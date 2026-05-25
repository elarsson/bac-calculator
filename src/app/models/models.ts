export type Sex = 'male' | 'female';

export type StomachState = 'empty' | 'food' | 'heavy';

export interface Profile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
}

export interface Drink {
  id: string;
  /** Volume of the drink in ml */
  volumeMl: number;
  /** Alcohol by volume, percent (e.g. 5 for 5%) */
  abv: number;
  /** ISO timestamp when consumed */
  timestamp: string;
  /** Stomach state snapshotted when drink was logged */
  stomachState: StomachState;
  /** Optional human-readable label (e.g. "IPA", "Negroni") */
  label?: string;
}

export interface DrinkPreset {
  key: string;
  name: string;
  volumeMl: number;
  abv: number;
}

export const DRINK_PRESETS: DrinkPreset[] = [
  { key: 'beer-light', name: 'Light beer', volumeMl: 330, abv: 4.5 },
  { key: 'beer-pint', name: 'Pint of beer', volumeMl: 500, abv: 5.0 },
  { key: 'wine', name: 'Wine (glass)', volumeMl: 150, abv: 12.0 },
  { key: 'wine-large', name: 'Wine (large)', volumeMl: 250, abv: 12.0 },
  { key: 'shot', name: 'Spirit (shot)', volumeMl: 30, abv: 40.0 },
  { key: 'cocktail', name: 'Cocktail', volumeMl: 100, abv: 20.0 },
];

export const STOMACH_LABELS: Record<StomachState, string> = {
  empty: 'Empty stomach',
  food: 'Some food',
  heavy: 'Heavy meal',
};

/** Absorption rate constants per hour (first-order) */
export const ABSORPTION_K: Record<StomachState, number> = {
  empty: 6.0,
  food: 2.0,
  heavy: 1.0,
};
