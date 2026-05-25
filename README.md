# BAC Tracker

A personal blood alcohol concentration tracker built with Angular 18.

## Run

```bash
npm install
npm start
```

Open `http://localhost:4200`. To use it on your phone over the LAN:

```bash
npx ng serve --host 0.0.0.0
```

Then visit `http://<your-computer-ip>:4200` from your phone.

## Build for production

```bash
npm run build
```

Static files end up in `dist/bac-calculator/browser/`. You can host them anywhere (e.g. drop into nginx, GitHub Pages, or `npx serve dist/bac-calculator/browser`).

## The math

**Watson Total Body Water (liters):**
- Male: `TBW = 2.447 − 0.09516·age + 0.1074·height_cm + 0.3362·weight_kg`
- Female: `TBW = −2.097 + 0.1069·height_cm + 0.2466·weight_kg`

**Widmark r factor:** `r = (TBW × 1.0517) / weight_kg`

**Per-drink alcohol mass (g):** `volume_ml × (abv/100) × 0.789` (ethanol density)

**Per-drink peak BAC if fully absorbed (%):** `grams / (r × weight_kg × 10)`

**Two-compartment kinetics.** Each drink lives in two pools — gut (unabsorbed) and blood (absorbed but not yet metabolized).

*Gut → blood* is first-order with rate constant *k* (per hour) depending on the stomach state at the time the drink was logged:

- Empty: 6.0/hr (~peaks fast)
- Some food: 2.0/hr
- Heavy meal: 1.0/hr

The instantaneous influx rate into blood from drink *i* is `k_i · peak_i · exp(−k_i · (t − t_i))` (in %BAC/hr).

*Blood → eliminated* is zero-order at `β = 0.015 %BAC/hr`. The blood pool can never go below zero, so when BAC is already at 0 the system only rises if influx exceeds elimination capacity.

The full system is integrated with explicit Euler at 30-second steps from the first drink forward. Sober time is found by detecting when blood BAC truly returns to zero after having risen.

This differs from the basic Widmark+absorption formula in two important ways: (1) elimination doesn't run "in the past" before alcohol is in your blood, so early-session estimates aren't artificially suppressed; (2) the sober point is determined by actual blood-pool depletion rather than a back-of-envelope total/β calculation.

## Data

Everything is in `localStorage` under keys `bac.profile`, `bac.drinks`, `bac.stomach`. Wipe via DevTools if needed:

```js
localStorage.clear()
```

## Notes

- A new drinking "session" begins whenever the gap from the previous drink exceeds 8 hours.
- The current BAC and chart only consider the most recent session; older sessions are visible in History.
- Real BAC varies ±20–30% from any formula due to food, genetics, medications, hydration, and so on. This is an estimate, not a measurement.
