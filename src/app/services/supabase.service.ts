import { Injectable } from '@angular/core';

export interface ClaimResult {
  ok: boolean;
  reason?: 'duplicate' | 'offline' | 'unknown';
}

/**
 * Offline-build stub for SupabaseService. The social build replaces
 * this file with supabase.service.real.ts via angular.json
 * fileReplacements, so the SDK is only pulled into the social bundle.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  get configured(): boolean {
    return false;
  }

  async claimName(_name: string, _deviceId: string, _avatarUrl?: string): Promise<ClaimResult> {
    return { ok: false, reason: 'offline' };
  }
}
