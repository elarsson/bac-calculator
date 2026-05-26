import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export interface ClaimResult {
  ok: boolean;
  reason?: 'duplicate' | 'offline' | 'unknown';
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
}
