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

export interface DrinkCategory {
  key: 'beer' | 'wine' | 'liquor';
  label: string;
  icon: string;
  presets: DrinkPreset[];
}

export const DRINK_CATEGORIES: DrinkCategory[] = [
  {
    key: 'beer',
    label: 'Beer',
    icon: '🍺',
    presets: [
      { key: 'lager',      name: 'Lager',  volumeMl: 330, abv: 4.5 },
      { key: 'pint',       name: 'Pint',   volumeMl: 568, abv: 5.0 },
      { key: 'ipa',        name: 'IPA',    volumeMl: 330, abv: 6.5 },
      { key: 'strong',     name: 'Strong', volumeMl: 500, abv: 7.5 },
    ],
  },
  {
    key: 'wine',
    label: 'Wine',
    icon: '🍷',
    presets: [
      { key: 'white',      name: 'White',  volumeMl: 150, abv: 12.0 },
      { key: 'red',        name: 'Red',    volumeMl: 150, abv: 13.5 },
      { key: 'rose',       name: 'Rosé',   volumeMl: 150, abv: 12.0 },
      { key: 'wine-large', name: 'Large',  volumeMl: 250, abv: 13.0 },
    ],
  },
  {
    key: 'liquor',
    label: 'Liquor',
    icon: '🥃',
    presets: [
      { key: 'shot',       name: 'Shot',      volumeMl: 25,  abv: 40.0 },
      { key: 'double',     name: 'Double',    volumeMl: 50,  abv: 40.0 },
      { key: 'cocktail',   name: 'Cocktail',  volumeMl: 100, abv: 20.0 },
      { key: 'long-drink', name: 'Long drink',volumeMl: 300, abv: 8.0  },
    ],
  },
];

export const DRINK_PRESETS: DrinkPreset[] = DRINK_CATEGORIES.flatMap(c => c.presets);

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
