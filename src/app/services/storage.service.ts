import { Injectable, signal, effect } from '@angular/core';
import { Drink, Profile, SharingMode, StomachState } from '../models/models';

const K_PROFILE = 'bac.profile';
const K_DRINKS = 'bac.drinks';
const K_STOMACH = 'bac.stomach';
const K_MODE = 'bac.sharingMode';

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage unavailable: silently ignore
  }
}

@Injectable({ providedIn: 'root' })
export class StorageService {
  readonly profile = signal<Profile | null>(readJSON<Profile>(K_PROFILE));
  readonly drinks = signal<Drink[]>(readJSON<Drink[]>(K_DRINKS) ?? []);
  readonly stomachState = signal<StomachState>(
    readJSON<StomachState>(K_STOMACH) ?? 'food'
  );
  readonly sharingMode = signal<SharingMode>(
    readJSON<SharingMode>(K_MODE) ?? 'smygsuper'
  );

  constructor() {
    effect(() => writeJSON(K_PROFILE, this.profile()));
    effect(() => writeJSON(K_DRINKS, this.drinks()));
    effect(() => writeJSON(K_STOMACH, this.stomachState()));
    effect(() => writeJSON(K_MODE, this.sharingMode()));
  }

  saveProfile(p: Profile): void {
    this.profile.set(p);
  }

  addDrink(d: Drink): void {
    this.drinks.update((arr) =>
      [...arr, d].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
    );
  }

  updateDrink(id: string, patch: Partial<Drink>): void {
    this.drinks.update((arr) =>
      arr
        .map((d) => (d.id === id ? { ...d, ...patch } : d))
        .sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
    );
  }

  deleteDrink(id: string): void {
    this.drinks.update((arr) => arr.filter((d) => d.id !== id));
  }

  clearDrinks(): void {
    this.drinks.set([]);
  }

  setStomachState(s: StomachState): void {
    this.stomachState.set(s);
  }

  setSharingMode(m: SharingMode): void {
    this.sharingMode.set(m);
  }
}
