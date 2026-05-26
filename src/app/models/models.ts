export type Sex = 'male' | 'female';

export type StomachState = 'empty' | 'food' | 'heavy';

export type SharingMode = 'smygsuper' | 'festar';

export interface WskIdentity {
  /** Display name claimed in the WSK group. Trimmed, max 24 chars. */
  name: string;
  /** Optional avatar as a JPEG data URL (~50 kB after resize). */
  avatarDataUrl?: string;
}

export type ReactionKind = 'emoji' | 'text';

export interface Reaction {
  id: string;
  drinkId: string;
  authorName: string;
  kind: ReactionKind;
  content: string;
  createdAt: number;
}

/** A drink event as broadcast in the WSK feed. */
export interface FeedDrink {
  id: string;
  participantName: string;
  occurredAt: number;
  label?: string;
  /** Public URL to the uploaded photo (Supabase Storage), if any. */
  photoUrl?: string;
}

/** Lightweight payload uploaded per Festar tick. */
export interface BacCurvePayload {
  participantName: string;
  /** [{t: ms, bac: %}, …] — already simplified for chart rendering. */
  curve: { t: number; bac: number }[];
  currentBac: number;
  firstSoberDrinkAt: number | null;
  /** Wall-clock timestamp the row was last updated (ms). */
  updatedAt: number;
}

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
  /** Optional key into the IndexedDB photo store (rear-camera shot of the drink) */
  photoId?: string;
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
      { label: 'Folköl 2,8%', abv: 2.8 },
      { label: 'Folköl 3,5%', abv: 3.5, default: true },
      { label: 'Starköl 5,2%', abv: 5.2 },
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
