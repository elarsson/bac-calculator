import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { BacCurvePayload, Drink } from '../models/models';
import { BacService } from './bac.service';
import { StorageService } from './storage.service';
import { SupabaseService, UnsubscribeFn } from './supabase.service';
import { currentSessionDrinks, firstSoberDrinkAt } from './session.util';

const UPLOAD_INTERVAL_MS = 30_000;
/** Max points to upload per curve to keep payload size sane. */
const MAX_CURVE_POINTS = 200;

function downsample<T>(arr: T[], maxLen: number): T[] {
  if (arr.length <= maxLen) return arr;
  const step = arr.length / maxLen;
  const out: T[] = [];
  for (let i = 0; i < maxLen; i++) out.push(arr[Math.floor(i * step)]);
  if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]);
  return out;
}

/**
 * Drives realtime sync of the user's BAC curve to Supabase and
 * maintains a local mirror of every other participant's curve.
 *
 * Lifecycle:
 *   - When sharingMode === 'festar' AND wskIdentity exists, the
 *     service computes the user's current curve from their drinks
 *     and uploads it every 30 s.
 *   - When sharingMode flips to 'smygsuper', the row is deleted from
 *     the server so other participants see the line disappear.
 *   - A single realtime subscription on bac_curves keeps the
 *     `participants` signal up-to-date for the WSK chart.
 */
@Injectable({ providedIn: 'root' })
export class WskSyncService {
  private storage = inject(StorageService);
  private bac = inject(BacService);
  private supabase = inject(SupabaseService);

  /** All currently-shared curves, keyed in a flat array (incl. self). */
  readonly participants = signal<BacCurvePayload[]>([]);

  private uploadHandle?: ReturnType<typeof setInterval>;
  private unsubscribe?: UnsubscribeFn;

  constructor() {
    // Realtime subscription stays open as long as Supabase is configured.
    if (this.supabase.configured) {
      this.unsubscribe = this.supabase.subscribeCurves(curves =>
        this.participants.set(curves),
      );
    }

    // Manage upload lifecycle from sharing mode + identity changes.
    effect(() => {
      const mode = this.storage.sharingMode();
      const identity = this.storage.wskIdentity();
      if (mode === 'festar' && identity && this.supabase.configured) {
        this.startUploading();
      } else {
        this.stopUploading();
        if (identity && this.supabase.configured) {
          void this.supabase.deleteCurve(identity.name);
        }
      }
    });
  }

  /** Force a single upload pass (used as a manual flush hook). */
  flush(): void { this.uploadOnce(); }

  private startUploading(): void {
    if (this.uploadHandle) return;
    this.uploadOnce();
    this.uploadHandle = setInterval(() => this.uploadOnce(), UPLOAD_INTERVAL_MS);
  }

  private stopUploading(): void {
    if (this.uploadHandle) {
      clearInterval(this.uploadHandle);
      this.uploadHandle = undefined;
    }
  }

  private uploadOnce(): void {
    const identity = this.storage.wskIdentity();
    const profile = this.storage.profile();
    if (!identity || !profile) return;

    const sessionDrinks = currentSessionDrinks(this.storage.drinks());
    if (sessionDrinks.length === 0) return;

    const now = Date.now();
    const curve = this.bac.computeCurve(sessionDrinks, profile, now);
    const fsdAt = firstSoberDrinkAt(sessionDrinks as Drink[], this.bac, profile);

    const points = curve.points.map(p => ({ t: p.t, bac: +p.bac.toFixed(4) }));
    const payload: BacCurvePayload = {
      participantName: identity.name,
      curve: downsample(points, MAX_CURVE_POINTS),
      currentBac: +curve.currentBac.toFixed(4),
      firstSoberDrinkAt: fsdAt,
      updatedAt: now,
    };
    void this.supabase.uploadCurve(payload);
  }

  /** Service worker / app shutdown cleanup. */
  shutdown(): void {
    this.stopUploading();
    this.unsubscribe?.();
  }

  /** Computed view: only participants who are currently sharing (everyone in the array). */
  readonly visibleParticipants = computed(() => this.participants());
}
