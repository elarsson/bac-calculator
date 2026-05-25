import { Injectable } from '@angular/core';
import { ABSORPTION_K, Drink, Profile } from '../models/models';

/** Ethanol density in g/ml */
const ETHANOL_DENSITY = 0.789;
/** Linear elimination rate in BAC % per hour (zero-order, Widmark β) */
const ELIMINATION_RATE = 0.015;
/** Watson conversion factor: TBW (L) -> equivalent Widmark distribution */
const WATSON_FACTOR = 1.0517;

/** Numerical integration step: 30 seconds */
const STEP_MS = 30_000;
const STEP_HR = STEP_MS / 3_600_000;
/** Sample emission interval: 1 minute */
const SAMPLE_MS = 60_000;
/** Safety cap on simulation length */
const MAX_HOURS = 36;
/** Numerical threshold considered "sober" */
const SOBER_EPS = 1e-4;

export interface BacPoint {
  /** ms since epoch */
  t: number;
  /** BAC as percent (g/100ml), e.g. 0.082 */
  bac: number;
}

export interface BacCurve {
  points: BacPoint[];
  currentBac: number;
  peakBac: number;
  peakAt: number | null;
  /** ms since epoch when BAC returns to 0 in the future, or null if already sober */
  soberAt: number | null;
  /** Widmark r factor used for this profile */
  r: number;
}

interface DrinkParam {
  /** Drink time in ms */
  t: number;
  /** Peak BAC contribution if fully absorbed (%) */
  peak: number;
  /** Absorption rate constant (per hour) */
  k: number;
}

@Injectable({ providedIn: 'root' })
export class BacService {

  /**
   * Watson Total Body Water (liters).
   * Male:   TBW = 2.447 - 0.09516*age + 0.1074*height + 0.3362*weight
   * Female: TBW = -2.097 + 0.1069*height + 0.2466*weight
   */
  watsonTBW(p: Profile): number {
    if (p.sex === 'male') {
      return 2.447 - 0.09516 * p.age + 0.1074 * p.heightCm + 0.3362 * p.weightKg;
    }
    return -2.097 + 0.1069 * p.heightCm + 0.2466 * p.weightKg;
  }

  /** Widmark r factor derived from Watson TBW */
  widmarkR(p: Profile): number {
    const tbw = this.watsonTBW(p);
    return (tbw * WATSON_FACTOR) / p.weightKg;
  }

  /** Pure ethanol mass for a drink, in grams */
  alcoholGrams(d: Drink): number {
    return d.volumeMl * (d.abv / 100) * ETHANOL_DENSITY;
  }

  /**
   * Peak BAC contribution (%) of a single drink if fully absorbed.
   * BAC% = grams / (r * weight_kg * 10)
   */
  drinkPeakContribution(d: Drink, p: Profile, r: number): number {
    return this.alcoholGrams(d) / (r * p.weightKg * 10);
  }

  /**
   * Compute the full BAC curve by numerical integration of a two-compartment
   * pharmacokinetic model:
   *
   *   Gut (per drink):  A_gut_i(t) = A_i * exp(-k_i * (t - t_i))
   *   Influx to blood:  sum_i [k_i * peak_i * exp(-k_i * (t - t_i))]    (%/hr)
   *   Blood:            dBAC/dt = influx_rate - β   while BAC > 0
   *                              max(0, influx_rate - β)  while BAC = 0
   *
   * Integration uses 30s Euler steps from the first drink forward, stopping
   * once BAC returns to ~0 after having risen (or after MAX_HOURS).
   */
  computeCurve(drinks: Drink[], profile: Profile, now: number = Date.now()): BacCurve {
    const r = this.widmarkR(profile);
    if (drinks.length === 0) {
      return { points: [], currentBac: 0, peakBac: 0, peakAt: null, soberAt: null, r };
    }

    const sorted = [...drinks].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const params: DrinkParam[] = sorted.map((d) => ({
      t: new Date(d.timestamp).getTime(),
      peak: this.drinkPeakContribution(d, profile, r),
      k: ABSORPTION_K[d.stomachState],
    }));

    const start = params[0].t;
    const endCap = start + MAX_HOURS * 3_600_000;

    let bac = 0;
    let hasRisen = false;
    let peakBac = 0;
    let peakAt: number | null = null;
    let currentBac = 0;
    let soberAt: number | null = null;
    const points: BacPoint[] = [];
    let lastSampleT = start - SAMPLE_MS;

    // Always emit the starting point at the first drink
    points.push({ t: start, bac: 0 });
    lastSampleT = start;

    for (let t = start + STEP_MS; t <= endCap; t += STEP_MS) {
      // Compute total influx rate from all active drinks (%/hr)
      let influxRate = 0;
      for (const dp of params) {
        if (t >= dp.t) {
          const dtHr = (t - dp.t) / 3_600_000;
          influxRate += dp.k * dp.peak * Math.exp(-dp.k * dtHr);
        }
      }

      // Net rate of change for blood BAC
      let netRate: number;
      if (bac > 0) {
        netRate = influxRate - ELIMINATION_RATE;
      } else {
        // Blood empty: only rise if influx exceeds elimination capacity
        netRate = Math.max(0, influxRate - ELIMINATION_RATE);
      }
      bac = Math.max(0, bac + netRate * STEP_HR);

      // Track peak
      if (bac > peakBac) {
        peakBac = bac;
        peakAt = t;
      }
      if (bac > SOBER_EPS) hasRisen = true;

      // Track current value
      if (t <= now) {
        currentBac = bac;
      }

      // Sample emission
      if (t - lastSampleT >= SAMPLE_MS) {
        points.push({ t, bac });
        lastSampleT = t;
      }

      // Detect future sober point
      if (t >= now && hasRisen && bac <= SOBER_EPS) {
        soberAt = t;
        // Ensure final point is included
        if (points[points.length - 1].t !== t) {
          points.push({ t, bac: 0 });
        }
        break;
      }
    }

    // If current bac is effectively 0, the user is already sober
    if (currentBac <= SOBER_EPS) {
      currentBac = 0;
      soberAt = null;
    }

    return { points, currentBac, peakBac, peakAt, soberAt, r };
  }

  /**
   * BAC value at a specific time `t`, derived from a precomputed curve
   * via linear interpolation between nearest sample points.
   */
  bacAtFromCurve(t: number, curve: BacCurve): number {
    const pts = curve.points;
    if (pts.length === 0) return 0;
    if (t <= pts[0].t) return pts[0].bac;
    if (t >= pts[pts.length - 1].t) return pts[pts.length - 1].bac;
    // Binary search
    let lo = 0;
    let hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].t <= t) lo = mid;
      else hi = mid;
    }
    const a = pts[lo];
    const b = pts[hi];
    const span = b.t - a.t;
    if (span === 0) return a.bac;
    const ratio = (t - a.t) / span;
    return a.bac + (b.bac - a.bac) * ratio;
  }
}
