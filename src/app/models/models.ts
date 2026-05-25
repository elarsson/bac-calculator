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
  /** Optional human-readable label */
  label?: string;
}

export interface StrengthPreset {
  label: string;
  abv: number;
  default?: boolean;
}

export interface VolumePreset {
  label: string;
  volumeCl: number;
  default?: boolean;
}

export interface DrinkCategory {
  key: 'beer' | 'wine' | 'liquor';
  label: string;
  icon: string;
  strengthPresets: StrengthPreset[];
  volumePresets: VolumePreset[];
}

export const DRINK_CATEGORIES: DrinkCategory[] = [
  {
    key: 'beer',
    label: 'Öl',
    icon: '🍺',
    strengthPresets: [
      { label: '2,8% Folköl', abv: 2.8 },
      { label: '3,5% Folköl', abv: 3.5, default: true },
      { label: '5,2% Starköl', abv: 5.2 },
    ],
    volumePresets: [
      { label: '33 cl', volumeCl: 33 },
      { label: '50 cl', volumeCl: 50, default: true },
    ],
  },
  {
    key: 'wine',
    label: 'Vin',
    icon: '🍷',
    strengthPresets: [
      { label: '12%', abv: 12 },
      { label: '13%', abv: 13, default: true },
      { label: '14%', abv: 14 },
    ],
    volumePresets: [
      { label: '15 cl', volumeCl: 15 },
      { label: '20 cl', volumeCl: 20, default: true },
      { label: '25 cl', volumeCl: 25 },
    ],
  },
  {
    key: 'liquor',
    label: 'Sprit',
    icon: '🥃',
    strengthPresets: [
      { label: '37,5%', abv: 37.5, default: true },
      { label: '40%', abv: 40 },
    ],
    volumePresets: [
      { label: '3 cl', volumeCl: 3 },
      { label: '4 cl', volumeCl: 4 },
      { label: '5 cl', volumeCl: 5 },
      { label: '6 cl', volumeCl: 6 },
    ],
  },
];

export const STOMACH_LABELS: Record<StomachState, string> = {
  empty: 'Tom mage',
  food: 'Lite mat',
  heavy: 'Stor måltid',
};

/** Absorption rate constants per hour (first-order) */
export const ABSORPTION_K: Record<StomachState, number> = {
  empty: 6.0,
  food: 2.0,
  heavy: 1.0,
};
