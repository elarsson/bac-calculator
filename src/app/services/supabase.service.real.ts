import { Injectable } from '@angular/core';
import {
  createClient, RealtimeChannel, RealtimePostgresChangesPayload, SupabaseClient,
} from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { BacCurvePayload } from '../models/models';

export interface ClaimResult {
  ok: boolean;
  reason?: 'duplicate' | 'offline' | 'unknown';
}

export type UnsubscribeFn = () => void;

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
   * - { ok: false, reason: 'duplicate' } if the name is already taken by another device
   * - { ok: false, reason: 'offline' } if Supabase isn't configured/reachable
   */
  async claimName(name: string, deviceId: string, avatarUrl?: string): Promise<ClaimResult> {
    if (!this.client) return { ok: false, reason: 'offline' };
    try {
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
    } catch {
      // ignore — next tick retries
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
}
