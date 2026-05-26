import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { BacCurvePayload, Drink, FeedDrink, Reaction, ReactionKind } from '../models/models';
import { BacService } from './bac.service';
import { PhotoStoreService } from './photo-store.service';
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
  private photoStore = inject(PhotoStoreService);

  /** All currently-shared curves, keyed in a flat array (incl. self). */
  readonly participants = signal<BacCurvePayload[]>([]);
  /** All drinks broadcast to the group (newest first). */
  readonly feed = signal<FeedDrink[]>([]);
  /** All reactions across the group, oldest first. */
  readonly reactions = signal<Reaction[]>([]);

  private uploadHandle?: ReturnType<typeof setInterval>;
  private unsubscribe?: UnsubscribeFn;
  private unsubscribeFeed?: UnsubscribeFn;
  private unsubscribeReactions?: UnsubscribeFn;
  /** Drink IDs we've already pushed (or detected) so we don't re-upload on every drinks() change. */
  private uploadedDrinkIds = new Set<string>();

  constructor() {
    // Realtime subscriptions stay open as long as Supabase is configured.
    if (this.supabase.configured) {
      this.unsubscribe = this.supabase.subscribeCurves(curves =>
        this.participants.set(curves),
      );
      this.unsubscribeFeed = this.supabase.subscribeDrinks(drinks =>
        this.feed.set(drinks),
      );
      this.unsubscribeReactions = this.supabase.subscribeReactions(rs =>
        this.reactions.set(rs),
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
          this.deleteOwnDrinks(identity.name);
        }
      }
    });

    // Push new drinks to the feed whenever the local drinks list changes
    // and we're currently in Festar mode.
    effect(() => {
      const drinks = this.storage.drinks();
      const mode = this.storage.sharingMode();
      const identity = this.storage.wskIdentity();
      if (mode !== 'festar' || !identity || !this.supabase.configured) return;
      const session = currentSessionDrinks(drinks);
      session.forEach(d => this.uploadDrinkIfNeeded(d, identity.name));
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
    this.unsubscribeFeed?.();
    this.unsubscribeReactions?.();
  }

  /**
   * Post a reaction. Returns false if the user has not claimed a name
   * yet (caller should prompt for one); true otherwise (even if the
   * server insert failed — fire and forget).
   */
  postReaction(drinkId: string, kind: ReactionKind, content: string): boolean {
    const identity = this.storage.wskIdentity();
    if (!identity || !this.supabase.configured) return false;
    const reaction: Reaction = {
      id: crypto.randomUUID(),
      drinkId,
      authorName: identity.name,
      kind,
      content,
      createdAt: Date.now(),
    };
    void this.supabase.addReaction(reaction);
    return true;
  }

  /** Computed view: only participants who are currently sharing (everyone in the array). */
  readonly visibleParticipants = computed(() => this.participants());

  private async uploadDrinkIfNeeded(drink: Drink, participantName: string): Promise<void> {
    if (this.uploadedDrinkIds.has(drink.id)) return;
    this.uploadedDrinkIds.add(drink.id);
    let photoUrl: string | undefined;
    if (drink.photoId) {
      try {
        const dataUrl = await this.photoStore.get(drink.photoId);
        if (dataUrl) {
          photoUrl = await this.supabase.uploadDrinkPhoto(drink.id, dataUrl);
        }
      } catch {
        // ignore photo failure — still upload the drink
      }
    }
    await this.supabase.upsertDrink({
      id: drink.id,
      participantName,
      occurredAt: new Date(drink.timestamp).getTime(),
      label: drink.label,
      photoUrl,
    });
  }

  private deleteOwnDrinks(participantName: string): void {
    const own = this.feed().filter(d => d.participantName === participantName);
    own.forEach(d => {
      this.uploadedDrinkIds.delete(d.id);
      void this.supabase.deleteDrink(d.id);
    });
  }
}
