import { Injectable } from '@angular/core';
import { BacCurvePayload } from '../models/models';

export interface ClaimResult {
  ok: boolean;
  reason?: 'duplicate' | 'offline' | 'unknown';
}

export type UnsubscribeFn = () => void;

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

  async uploadCurve(_payload: BacCurvePayload): Promise<void> { /* no-op */ }
  async deleteCurve(_participantName: string): Promise<void> { /* no-op */ }
  async fetchCurves(): Promise<BacCurvePayload[]> { return []; }
  subscribeCurves(_onChange: (curves: BacCurvePayload[]) => void): UnsubscribeFn {
    return () => undefined;
  }
}
