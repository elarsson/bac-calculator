import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { BacCurvePayload, Drink, FeedDrink, Reaction, ReactionKind } from '../models/models';
import { BacService } from './bac.service';
import { PhotoStoreService } from './photo-store.service';
import { StorageService } from './storage.service';
import { ParticipantMeta, SupabaseService, UnsubscribeFn } from './supabase.service';
import { firstSoberDrinkAt } from './session.util';

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
 * Privacy invariant (load-bearing — read before touching):
 *   No drink/curve write hits the network unless sharingMode is
 *   'festar' AND a wskIdentity exists AND Supabase is configured.
 *   Every write path re-checks at the moment of the call, not just
 *   at the moment the effect was scheduled, so async races on
 *   toggle-off can't leak.
 *
 *   On Festar → Smygsuper the service does a server-side
 *   wipeOwnContent: every drink row, every drink-photo blob, and
 *   the curve row for this participant are deleted. The avatar +
 *   participants row stay so reactions still attribute correctly
 *   if the user posts later.
 *
 * Lifecycle:
 *   - Festar with identity → compute curve from drinks at-or-after
 *     sharingStartedAt and upload every 30 s; push each new
 *     in-scope drink as it is logged.
 *   - Smygsuper → stop uploading, wipe everything on the server,
 *     clear sharingStartedAt.
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
  /** Participant directory keyed by name (avatars, etc.). */
  readonly participantsDir = signal<ParticipantMeta[]>([]);

  private uploadHandle?: ReturnType<typeof setInterval>;
  private unsubscribe?: UnsubscribeFn;
  private unsubscribeFeed?: UnsubscribeFn;
  private unsubscribeReactions?: UnsubscribeFn;
  private unsubscribeParticipants?: UnsubscribeFn;
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
      this.unsubscribeParticipants = this.supabase.subscribeParticipants(ps =>
        this.participantsDir.set(ps),
      );
    }

    // Manage upload lifecycle from sharing mode + identity changes.
    effect(() => {
      const mode = this.storage.sharingMode();
      const identity = this.storage.wskIdentity();
      if (mode === 'festar' && identity && this.supabase.configured) {
        // Lock in the sharing anchor the first time we enter Festar; reuse
        // it across reloads so the scope rule is stable through the night.
        if (this.storage.sharingStartedAt() === null) {
          this.storage.setSharingStartedAt(this.computeSharingAnchor());
        }
        this.startUploading();
      } else {
        this.stopUploading();
        if (identity && this.supabase.configured) {
          // Single server-side bulk delete; doesn't rely on the local
          // feed mirror, so drinks uploaded just before toggle-off can't
          // survive due to subscription lag.
          void this.supabase.wipeOwnContent(identity.name);
        }
        this.uploadedDrinkIds.clear();
        this.storage.setSharingStartedAt(null);
      }
    });

    // Push new drinks to the feed whenever the local drinks list changes
    // and we're currently in Festar mode. Scope follows sharingStartedAt.
    effect(() => {
      const drinks = this.storage.drinks();
      const mode = this.storage.sharingMode();
      const identity = this.storage.wskIdentity();
      const start = this.storage.sharingStartedAt();
      if (mode !== 'festar' || !identity || !this.supabase.configured || start === null) return;
      drinks
        .filter(d => new Date(d.timestamp).getTime() >= start)
        .forEach(d => this.uploadDrinkIfNeeded(d, identity.name));
    });
  }

  /**
   * Pick the anchor used to scope what gets shared:
   *   - Sober at toggle time → 'now', so only future drinks broadcast.
   *   - Already drinking → first drink of the current binge, so the curve
   *     starts where the night actually began (per user spec).
   */
  private computeSharingAnchor(): number {
    const now = Date.now();
    const profile = this.storage.profile();
    const drinks = this.storage.drinks();
    if (!profile || drinks.length === 0) return now;
    const curve = this.bac.computeCurve(drinks, profile, now);
    if (curve.currentBac < 0.001) return now;
    return firstSoberDrinkAt(drinks, this.bac, profile) ?? now;
  }

  /** Drinks in scope for the current sharing session. */
  private sharingDrinks(): Drink[] {
    const start = this.storage.sharingStartedAt();
    const drinks = this.storage.drinks();
    if (start === null) return [];
    return drinks.filter(d => new Date(d.timestamp).getTime() >= start);
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
    // Defensive: re-check the invariant at the moment we actually
    // write. The setInterval callback could fire mid-toggle-off.
    if (this.storage.sharingMode() !== 'festar') return;

    const identity = this.storage.wskIdentity();
    const profile = this.storage.profile();
    if (!identity || !profile) return;
    if (!this.supabase.configured) return;

    const drinks = this.sharingDrinks();
    if (drinks.length === 0) {
      // Nothing in scope yet (just toggled on while sober and no drinks since).
      // Make sure no stale row hangs around.
      void this.supabase.deleteCurve(identity.name);
      return;
    }

    const now = Date.now();
    const curve = this.bac.computeCurve(drinks, profile, now);
    const fsdAt = firstSoberDrinkAt(drinks, this.bac, profile);

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
    this.unsubscribeParticipants?.();
  }

  /** Current promille for a participant — used to drive avatar distortion. */
  promilleFor(name: string): number {
    const p = this.participants().find(x => x.participantName === name);
    return p ? p.currentBac * 10 : 0;
  }

  /** Avatar URL for a participant (server-side public URL). */
  avatarFor(name: string): string | undefined {
    return this.participantsDir().find(p => p.name === name)?.avatarUrl;
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
    // Reserve the ID up front so a second tick doesn't double-upload.
    this.uploadedDrinkIds.add(drink.id);

    // Defensive: re-check the invariant before each network write. If
    // sharing toggled off between the effect firing and now, drop everything.
    const stillSharing = () => this.storage.sharingMode() === 'festar';
    if (!stillSharing()) { this.uploadedDrinkIds.delete(drink.id); return; }

    let photoUrl: string | undefined;
    if (drink.photoId) {
      try {
        const dataUrl = await this.photoStore.get(drink.photoId);
        if (dataUrl && stillSharing()) {
          photoUrl = await this.supabase.uploadDrinkPhoto(drink.id, dataUrl);
        }
      } catch {
        // ignore photo failure — still upload the drink if we're still sharing
      }
    }

    if (!stillSharing()) { this.uploadedDrinkIds.delete(drink.id); return; }

    await this.supabase.upsertDrink({
      id: drink.id,
      participantName,
      occurredAt: new Date(drink.timestamp).getTime(),
      label: drink.label,
      photoUrl,
      volumeMl: drink.volumeMl,
      abv: drink.abv,
      category: drink.category,
    });
  }

}
