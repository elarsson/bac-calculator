import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { StorageService } from '../services/storage.service';
import { BacService } from '../services/bac.service';
import { currentSessionDrinks } from '../services/session.util';
import { DRINK_PRESETS, Drink, DrinkPreset } from '../models/models';

function toLocalInputValue(d: Date): string {
  // 'YYYY-MM-DDTHH:mm' in local time
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(s: string): Date {
  return new Date(s);
}

@Component({
  selector: 'app-add-drink',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="presets">
      @for (p of presets; track p.key) {
        <button class="preset" type="button" (click)="applyPreset(p)">
          <span class="preset-name">{{ p.name }}</span>
          <span class="preset-meta mono">{{ p.volumeMl }}ml · {{ p.abv }}%</span>
        </button>
      }
    </div>

    <form [formGroup]="form" (ngSubmit)="add()" class="form">
      <div class="row">
        <div class="field">
          <label for="volume">Volume (ml)</label>
          <input id="volume" type="number" formControlName="volumeMl" min="1" step="1" />
        </div>
        <div class="field">
          <label for="abv">ABV (%)</label>
          <input id="abv" type="number" formControlName="abv" min="0.1" max="96" step="0.1" />
        </div>
      </div>

      <div class="row">
        <div class="field field-wide">
          <label for="when">When</label>
          <input id="when" type="datetime-local" formControlName="timestamp" />
        </div>
        <button class="btn btn-ghost now-btn" type="button" (click)="setNow()">now</button>
      </div>

      <div class="field">
        <label for="label">Label (optional)</label>
        <input id="label" type="text" formControlName="label" placeholder="e.g. Negroni, IPA" />
      </div>

      @if (previewSober(); as s) {
        <div class="preview">
          <span class="preview-label">If added,</span>
          <span class="preview-value mono">sober at {{ s }}</span>
        </div>
      }

      <button class="btn btn-primary" type="submit" [disabled]="form.invalid">
        Add drink
      </button>
    </form>
  `,
  styles: [`
    .presets {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .preset {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 0.6rem 0.7rem;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.15rem;
      transition: all 0.15s ease;
    }
    .preset:hover {
      border-color: var(--amber);
      background: var(--bg-card);
    }
    .preset-name {
      font-size: 0.92rem;
      color: var(--text);
    }
    .preset-meta {
      font-size: 0.72rem;
      color: var(--text-muted);
      letter-spacing: 0.02em;
    }
    .form { display: flex; flex-direction: column; gap: 0.8rem; }
    .row { display: flex; gap: 0.6rem; align-items: flex-end; }
    .field { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .field-wide { flex: 2; }
    .now-btn {
      align-self: stretch;
      min-width: 60px;
    }
    .preview {
      padding: 0.6rem 0.8rem;
      background: var(--bg);
      border: 1px dashed var(--border-strong);
      border-radius: var(--radius);
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
    }
    .preview-label {
      color: var(--text-muted);
      font-style: italic;
      font-family: var(--font-display);
    }
    .preview-value { color: var(--amber); }
  `],
})
export class AddDrinkComponent {
  private fb = inject(FormBuilder);
  private storage = inject(StorageService);
  private bac = inject(BacService);

  presets = DRINK_PRESETS;

  form = this.fb.nonNullable.group({
    volumeMl: [330, [Validators.required, Validators.min(1)]],
    abv: [5.0, [Validators.required, Validators.min(0.1), Validators.max(96)]],
    timestamp: [toLocalInputValue(new Date()), Validators.required],
    label: [''],
  });

  // Live-update preview when form changes
  private formValue = signal(this.form.getRawValue());

  constructor() {
    this.form.valueChanges.subscribe(() => {
      this.formValue.set(this.form.getRawValue());
    });
  }

  previewSober = computed(() => {
    const profile = this.storage.profile();
    if (!profile) return null;
    const v = this.formValue();
    if (!v.volumeMl || !v.abv || !v.timestamp) return null;
    const candidate: Drink = {
      id: '__preview__',
      volumeMl: v.volumeMl,
      abv: v.abv,
      timestamp: fromLocalInputValue(v.timestamp).toISOString(),
      stomachState: this.storage.stomachState(),
      label: v.label || undefined,
    };
    const existing = currentSessionDrinks(this.storage.drinks());
    const all = [...existing, candidate];
    const curve = this.bac.computeCurve(all, profile);
    if (!curve.soberAt) return null;
    return this.formatTime(curve.soberAt);
  });

  applyPreset(p: DrinkPreset): void {
    this.form.patchValue({ volumeMl: p.volumeMl, abv: p.abv });
  }

  setNow(): void {
    this.form.patchValue({ timestamp: toLocalInputValue(new Date()) });
  }

  add(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const drink: Drink = {
      id: crypto.randomUUID(),
      volumeMl: v.volumeMl,
      abv: v.abv,
      timestamp: fromLocalInputValue(v.timestamp).toISOString(),
      stomachState: this.storage.stomachState(),
      label: v.label || undefined,
    };
    this.storage.addDrink(drink);
    // Reset to "now" but keep volume/abv as a useful default
    this.form.patchValue({
      timestamp: toLocalInputValue(new Date()),
      label: '',
    });
  }

  private formatTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return time;
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow =
      d.getFullYear() === tomorrow.getFullYear() &&
      d.getMonth() === tomorrow.getMonth() &&
      d.getDate() === tomorrow.getDate();
    if (isTomorrow) return `${time} tomorrow`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
  }
}
