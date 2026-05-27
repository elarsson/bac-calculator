import { Injectable } from '@angular/core';
import { BacCurvePayload, FeedDrink, Reaction } from '../models/models';

export interface ClaimResult {
  ok: boolean;
  reason?: 'duplicate' | 'offline' | 'unknown';
}

export interface ParticipantMeta {
  name: string;
  avatarUrl?: string;
  /** Wall-clock ms of last server-recorded activity (curve/drink/reaction). */
  lastSeenAt?: number;
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

  async claimName(_name: string, _deviceId: string, _avatarUrl?: string, _force = false): Promise<ClaimResult> {
    return { ok: false, reason: 'offline' };
  }

  async uploadCurve(_payload: BacCurvePayload): Promise<void> { /* no-op */ }
  async deleteCurve(_participantName: string): Promise<void> { /* no-op */ }
  async fetchCurves(): Promise<BacCurvePayload[]> { return []; }
  subscribeCurves(_onChange: (curves: BacCurvePayload[]) => void): UnsubscribeFn {
    return () => undefined;
  }

  async upsertDrink(_drink: FeedDrink): Promise<void> { /* no-op */ }
  async deleteDrink(_id: string): Promise<void> { /* no-op */ }
  async wipeOwnContent(_participantName: string): Promise<void> { /* no-op */ }
  async deleteParticipant(_participantName: string): Promise<void> { /* no-op */ }
  async fetchDrinks(_sinceMs?: number): Promise<FeedDrink[]> { return []; }
  subscribeDrinks(_onChange: (drinks: FeedDrink[]) => void): UnsubscribeFn {
    return () => undefined;
  }

  async uploadDrinkPhoto(_drinkId: string, _dataUrl: string): Promise<string | undefined> {
    return undefined;
  }

  async addReaction(_reaction: Reaction): Promise<void> { /* no-op */ }
  async fetchReactions(): Promise<Reaction[]> { return []; }
  subscribeReactions(_onChange: (reactions: Reaction[]) => void): UnsubscribeFn {
    return () => undefined;
  }

  async fetchParticipants(): Promise<ParticipantMeta[]> { return []; }
  subscribeParticipants(_onChange: (participants: ParticipantMeta[]) => void): UnsubscribeFn {
    return () => undefined;
  }
  async uploadParticipantAvatar(_name: string, _dataUrl: string): Promise<string | undefined> {
    return undefined;
  }
}
