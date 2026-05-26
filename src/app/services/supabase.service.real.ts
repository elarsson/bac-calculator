import { Injectable } from '@angular/core';
import {
  createClient, RealtimeChannel, RealtimePostgresChangesPayload, SupabaseClient,
} from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { BacCurvePayload, DrinkCategoryKey, FeedDrink, Reaction } from '../models/models';

export interface ClaimResult {
  ok: boolean;
  reason?: 'duplicate' | 'offline' | 'unknown';
}

export interface ParticipantMeta {
  name: string;
  avatarUrl?: string;
}

export type UnsubscribeFn = () => void;

interface ParticipantRow {
  name: string;
  avatar_url: string | null;
  device_id: string;
}

function participantRowToMeta(row: ParticipantRow): ParticipantMeta {
  return { name: row.name, avatarUrl: row.avatar_url ?? undefined };
}

interface BacCurveRow {
  participant_name: string;
  curve: { t: number; bac: number }[];
  current_bac: number;
  first_sober_drink_at: string | null;
  sharing_on: boolean;
  updated_at: string;
}

function rowToPayload(row: BacCurveRow): BacCurvePayload {
  return {
    participantName: row.participant_name,
    curve: row.curve ?? [],
    currentBac: Number(row.current_bac),
    firstSoberDrinkAt: row.first_sober_drink_at ? new Date(row.first_sober_drink_at).getTime() : null,
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

interface DrinkRow {
  id: string;
  participant_name: string;
  occurred_at: string;
  label: string | null;
  photo_url: string | null;
  volume_ml: number | null;
  abv: number | null;
  category: DrinkCategoryKey | null;
}

function drinkRowToFeed(row: DrinkRow): FeedDrink {
  return {
    id: row.id,
    participantName: row.participant_name,
    occurredAt: new Date(row.occurred_at).getTime(),
    label: row.label ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    volumeMl: row.volume_ml ?? undefined,
    abv: row.abv ?? undefined,
    category: row.category ?? undefined,
  };
}

interface ReactionRow {
  id: string;
  drink_id: string;
  author_name: string;
  kind: 'emoji' | 'text';
  content: string;
  created_at: string;
}

function reactionRowToModel(row: ReactionRow): Reaction {
  return {
    id: row.id,
    drinkId: row.drink_id,
    authorName: row.author_name,
    kind: row.kind,
    content: row.content,
    createdAt: new Date(row.created_at).getTime(),
  };
}

const PHOTO_BUCKET = 'photos';

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',');
  const mime = /data:([^;]+);base64/.exec(meta)?.[1] ?? 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/**
 * Thin Supabase wrapper. If env.supabase.url/anonKey are blank, every
 * call short-circuits — the app stays fully functional locally and
 * WSK actions silently succeed without networked side effects.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private client: SupabaseClient | null = null;

  constructor() {
    const { url, anonKey } = environment.supabase;
    if (url && anonKey) {
      this.client = createClient(url, anonKey, {
        auth: { persistSession: false },
      });
    }
  }

  get configured(): boolean {
    return this.client !== null;
  }

  /**
   * Claim a name in the WSK group. Returns:
   * - { ok: true } on successful insert/upsert
   * - { ok: false, reason: 'duplicate' } if the name is taken by another
   *   device and `force` was not set. The caller is expected to surface
   *   a "is this you on another device?" confirmation prompt and re-call
   *   with force=true.
   * - { ok: false, reason: 'offline' } if Supabase isn't reachable.
   */
  async claimName(
    name: string,
    deviceId: string,
    avatarUrl?: string,
    force = false,
  ): Promise<ClaimResult> {
    if (!this.client) return { ok: false, reason: 'offline' };
    try {
      // Force = the user has confirmed they want to share this name across
      // devices. Skip the insert and the device_id check; just refresh the
      // row's avatar + last_seen so the second device's selfie wins.
      if (force) {
        await this.client
          .from('participants')
          .update({ avatar_url: avatarUrl ?? null, last_seen_at: new Date().toISOString() })
          .eq('name', name);
        return { ok: true };
      }

      // Try to insert; on PK conflict, check whether the existing row is ours.
      const { error } = await this.client
        .from('participants')
        .insert({ name, device_id: deviceId, avatar_url: avatarUrl ?? null });
      if (!error) return { ok: true };

      // Postgres unique violation = 23505
      if ((error as { code?: string }).code === '23505') {
        const { data, error: selErr } = await this.client
          .from('participants')
          .select('device_id')
          .eq('name', name)
          .single();
        if (selErr) return { ok: false, reason: 'unknown' };
        if (data?.device_id === deviceId) {
          // It's us — update avatar/last_seen.
          await this.client
            .from('participants')
            .update({ avatar_url: avatarUrl ?? null, last_seen_at: new Date().toISOString() })
            .eq('name', name);
          return { ok: true };
        }
        return { ok: false, reason: 'duplicate' };
      }
      return { ok: false, reason: 'unknown' };
    } catch {
      return { ok: false, reason: 'offline' };
    }
  }

  async uploadCurve(payload: BacCurvePayload): Promise<void> {
    if (!this.client) return;
    try {
      await this.client
        .from('bac_curves')
        .upsert({
          participant_name: payload.participantName,
          curve: payload.curve,
          current_bac: payload.currentBac,
          first_sober_drink_at: payload.firstSoberDrinkAt
            ? new Date(payload.firstSoberDrinkAt).toISOString()
            : null,
          sharing_on: true,
          updated_at: new Date().toISOString(),
        });
      void this.bumpLastSeen(payload.participantName);
    } catch {
      // ignore — next tick retries
    }
  }

  /**
   * Refresh participants.last_seen_at for this user. Fire-and-forget;
   * called from every Festar-time write so a future "stale friend"
   * indicator has data to work with.
   */
  private async bumpLastSeen(participantName: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client
        .from('participants')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('name', participantName);
    } catch {
      // swallow
    }
  }

  async deleteCurve(participantName: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.from('bac_curves').delete().eq('participant_name', participantName);
    } catch {
      // ignore
    }
  }

  async fetchCurves(): Promise<BacCurvePayload[]> {
    if (!this.client) return [];
    try {
      const { data, error } = await this.client.from('bac_curves').select('*');
      if (error || !data) return [];
      return (data as BacCurveRow[]).map(rowToPayload);
    } catch {
      return [];
    }
  }

  subscribeCurves(onChange: (curves: BacCurvePayload[]) => void): UnsubscribeFn {
    if (!this.client) return () => undefined;
    const client = this.client;
    const state = new Map<string, BacCurvePayload>();

    const emit = () => onChange(Array.from(state.values()));

    // Initial fetch
    void this.fetchCurves().then(curves => {
      curves.forEach(c => state.set(c.participantName, c));
      emit();
    });

    const channel: RealtimeChannel = client
      .channel('wsk-curves')
      .on<BacCurveRow>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bac_curves' },
        (msg: RealtimePostgresChangesPayload<BacCurveRow>) => {
          if (msg.eventType === 'DELETE') {
            const name = (msg.old as Partial<BacCurveRow> | null)?.participant_name;
            if (name) {
              state.delete(name);
              emit();
            }
            return;
          }
          const newRow = msg.new as BacCurveRow | undefined;
          if (newRow?.participant_name) {
            const payload = rowToPayload(newRow);
            state.set(payload.participantName, payload);
            emit();
          }
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }

  async upsertDrink(drink: FeedDrink): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.from('drinks').upsert({
        id: drink.id,
        participant_name: drink.participantName,
        occurred_at: new Date(drink.occurredAt).toISOString(),
        label: drink.label ?? null,
        photo_url: drink.photoUrl ?? null,
        volume_ml: drink.volumeMl ?? null,
        abv: drink.abv ?? null,
        category: drink.category ?? null,
      });
      void this.bumpLastSeen(drink.participantName);
    } catch {
      // swallow
    }
  }

  async deleteDrink(id: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.from('drinks').delete().eq('id', id);
    } catch {
      // swallow
    }
  }

  /**
   * Server-side cleanup of everything this participant has broadcast:
   * the BAC curve row, every drink they've logged, and every drink-photo
   * blob they uploaded to Storage. Avatar and participants row stay so
   * they can rejoin without re-claiming.
   *
   * Called when the user toggles Smygsuper — we treat it as a hard
   * privacy reset to remove anything that was uploaded under Festar.
   */
  async wipeOwnContent(participantName: string): Promise<void> {
    if (!this.client) return;
    try {
      // 1) Find every drink so we know which photo blobs to remove.
      const { data } = await this.client
        .from('drinks')
        .select('id')
        .eq('participant_name', participantName);
      const paths = (data ?? []).map(d => `${(d as { id: string }).id}.jpg`);
      if (paths.length > 0) {
        await this.client.storage.from(PHOTO_BUCKET).remove(paths);
      }
      // 2) Drop all drink rows for this participant.
      await this.client.from('drinks').delete().eq('participant_name', participantName);
      // 3) Drop the curve row.
      await this.client.from('bac_curves').delete().eq('participant_name', participantName);
    } catch {
      // swallow — best-effort cleanup
    }
  }

  async fetchDrinks(sinceMs?: number): Promise<FeedDrink[]> {
    if (!this.client) return [];
    try {
      let q = this.client.from('drinks').select('*').order('occurred_at', { ascending: false }).limit(200);
      if (sinceMs) q = q.gte('occurred_at', new Date(sinceMs).toISOString());
      const { data, error } = await q;
      if (error || !data) return [];
      return (data as DrinkRow[]).map(drinkRowToFeed);
    } catch {
      return [];
    }
  }

  subscribeDrinks(onChange: (drinks: FeedDrink[]) => void): UnsubscribeFn {
    if (!this.client) return () => undefined;
    const client = this.client;
    const state = new Map<string, FeedDrink>();
    const emit = () => onChange(Array.from(state.values()).sort((a, b) => b.occurredAt - a.occurredAt));

    void this.fetchDrinks().then(drinks => {
      drinks.forEach(d => state.set(d.id, d));
      emit();
    });

    const channel: RealtimeChannel = client
      .channel('wsk-drinks')
      .on<DrinkRow>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drinks' },
        (msg: RealtimePostgresChangesPayload<DrinkRow>) => {
          if (msg.eventType === 'DELETE') {
            const id = (msg.old as Partial<DrinkRow> | null)?.id;
            if (id) { state.delete(id); emit(); }
            return;
          }
          const row = msg.new as DrinkRow | undefined;
          if (row?.id) {
            state.set(row.id, drinkRowToFeed(row));
            emit();
          }
        },
      )
      .subscribe();

    return () => { void client.removeChannel(channel); };
  }

  async addReaction(reaction: Reaction): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.from('reactions').insert({
        id: reaction.id,
        drink_id: reaction.drinkId,
        author_name: reaction.authorName,
        kind: reaction.kind,
        content: reaction.content,
      });
      void this.bumpLastSeen(reaction.authorName);
    } catch {
      // swallow
    }
  }

  async fetchReactions(): Promise<Reaction[]> {
    if (!this.client) return [];
    try {
      const { data, error } = await this.client
        .from('reactions')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(2000);
      if (error || !data) return [];
      return (data as ReactionRow[]).map(reactionRowToModel);
    } catch {
      return [];
    }
  }

  subscribeReactions(onChange: (reactions: Reaction[]) => void): UnsubscribeFn {
    if (!this.client) return () => undefined;
    const client = this.client;
    const state = new Map<string, Reaction>();
    const emit = () => onChange(Array.from(state.values()).sort((a, b) => a.createdAt - b.createdAt));

    void this.fetchReactions().then(rs => {
      rs.forEach(r => state.set(r.id, r));
      emit();
    });

    const channel: RealtimeChannel = client
      .channel('wsk-reactions')
      .on<ReactionRow>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reactions' },
        (msg: RealtimePostgresChangesPayload<ReactionRow>) => {
          if (msg.eventType === 'DELETE') {
            const id = (msg.old as Partial<ReactionRow> | null)?.id;
            if (id) { state.delete(id); emit(); }
            return;
          }
          const row = msg.new as ReactionRow | undefined;
          if (row?.id) {
            state.set(row.id, reactionRowToModel(row));
            emit();
          }
        },
      )
      .subscribe();

    return () => { void client.removeChannel(channel); };
  }

  async fetchParticipants(): Promise<ParticipantMeta[]> {
    if (!this.client) return [];
    try {
      const { data, error } = await this.client.from('participants').select('name, avatar_url, device_id');
      if (error || !data) return [];
      return (data as ParticipantRow[]).map(participantRowToMeta);
    } catch {
      return [];
    }
  }

  subscribeParticipants(onChange: (participants: ParticipantMeta[]) => void): UnsubscribeFn {
    if (!this.client) return () => undefined;
    const client = this.client;
    const state = new Map<string, ParticipantMeta>();
    const emit = () => onChange(Array.from(state.values()));

    void this.fetchParticipants().then(ps => {
      ps.forEach(p => state.set(p.name, p));
      emit();
    });

    const channel: RealtimeChannel = client
      .channel('wsk-participants')
      .on<ParticipantRow>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants' },
        (msg: RealtimePostgresChangesPayload<ParticipantRow>) => {
          if (msg.eventType === 'DELETE') {
            const name = (msg.old as Partial<ParticipantRow> | null)?.name;
            if (name) { state.delete(name); emit(); }
            return;
          }
          const row = msg.new as ParticipantRow | undefined;
          if (row?.name) {
            state.set(row.name, participantRowToMeta(row));
            emit();
          }
        },
      )
      .subscribe();

    return () => { void client.removeChannel(channel); };
  }

  /**
   * Upload a square selfie data URL to the `photos` bucket under
   * `avatars/<name>.jpg` and return the public URL. Falls back to
   * undefined on failure.
   */
  async uploadParticipantAvatar(name: string, dataUrl: string): Promise<string | undefined> {
    if (!this.client) return undefined;
    try {
      const blob = dataUrlToBlob(dataUrl);
      const path = `avatars/${encodeURIComponent(name)}.jpg`;
      const { error } = await this.client.storage
        .from(PHOTO_BUCKET)
        .upload(path, blob, { contentType: blob.type, upsert: true });
      if (error) return undefined;
      const { data } = this.client.storage.from(PHOTO_BUCKET).getPublicUrl(path);
      // bust caches when the user uploads a replacement
      return `${data.publicUrl}?v=${Date.now()}`;
    } catch {
      return undefined;
    }
  }

  /**
   * Uploads a photo data URL to the `photos` bucket and returns the public URL.
   * Returns undefined if the upload fails or the bucket is missing.
   */
  async uploadDrinkPhoto(drinkId: string, dataUrl: string): Promise<string | undefined> {
    if (!this.client) return undefined;
    try {
      const blob = dataUrlToBlob(dataUrl);
      const path = `${drinkId}.jpg`;
      const { error } = await this.client.storage
        .from(PHOTO_BUCKET)
        .upload(path, blob, { contentType: blob.type, upsert: true });
      if (error) return undefined;
      const { data } = this.client.storage.from(PHOTO_BUCKET).getPublicUrl(path);
      return data.publicUrl;
    } catch {
      return undefined;
    }
  }
}
