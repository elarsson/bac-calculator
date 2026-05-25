import {
  ChangeDetectionStrategy, Component, computed, inject, input, output, signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { StorageService } from '../services/storage.service';
import { BacService } from '../services/bac.service';
import { currentSessionDrinks } from '../services/session.util';
import {
  DRINK_CATEGORIES, DrinkCategory, DrinkPreset, Drink, STOMACH_LABELS, StomachState,
} from '../models/models';

function toLocal(d: Date): string {
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

@Component({
  selector: 'app-add-drink-modal',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop" [class.visible]="open()" (click)="close.emit()"></div>

    <div class="sheet" [class.visible]="open()">
      <div class="handle"></div>

      <div class="sheet-header">
        <h2 class="sheet-title">Add a drink</h2>
        <button class="close-btn" type="button" (click)="close.emit()">✕</button>
      </div>

      <!-- Stomach state -->
      <div class="stomach-row">
        @for (s of stomachOptions; track s) {
          <button
            class="s-pill"
            [class.active]="storage.stomachState() === s"
            (click)="setStomach(s)">
            {{ stomachLabel(s) }}
          </button>
        }
      </div>

      <!-- Category tabs -->
      <div class="cat-tabs">
        @for (cat of categories; track cat.key) {
          <button
            class="cat-tab"
            [class.active]="activeCat() === cat.key"
            (click)="activeCat.set(cat.key)">
            <span class="cat-icon">{{ cat.icon }}</span>
            <span class="cat-label">{{ cat.label }}</span>
          </button>
        }
      </div>

      <!-- Preset grid -->
      <div class="presets">
        @for (p of currentPresets(); track p.key) {
          <button
            class="preset"
            [class.selected]="selectedPreset() === p.key"
            type="button"
            (click)="applyPreset(p)">
            <span class="preset-name">{{ p.name }}</span>
            <span class="preset-meta mono">{{ p.volumeMl }}ml · {{ p.abv }}%</span>
          </button>
        }
      </div>

      <!-- Form -->
      <form [formGroup]="form" (ngSubmit)="add()" class="form">
        <div class="form-row">
          <div class="field">
            <label for="m-vol">Volume (ml)</label>
            <input id="m-vol" type="number" formControlName="volumeMl"
                   min="1" step="1" inputmode="decimal" />
          </div>
          <div class="field">
            <label for="m-abv">ABV (%)</label>
            <input id="m-abv" type="number" formControlName="abv"
                   min="0.1" max="96" step="0.1" inputmode="decimal" />
          </div>
        </div>

        <div class="form-row">
          <div class="field field-wide">
            <label for="m-when">When</label>
            <input id="m-when" type="datetime-local" formControlName="timestamp" />
          </div>
          <button class="btn btn-ghost now-btn" type="button" (click)="setNow()">now</button>
        </div>

        <div class="field">
          <label for="m-label">Label (optional)</label>
          <input id="m-label" type="text" formControlName="label"
                 placeholder="e.g. Negroni, IPA" autocomplete="off" />
        </div>

        @if (previewSober(); as s) {
          <div class="preview">
            <span class="preview-label">Sober at</span>
            <span class="preview-value mono">{{ s }}</span>
          </div>
        }

        <button class="btn btn-primary add-btn" type="submit" [disabled]="form.invalid">
          Add drink
        </button>
      </form>
    </div>
  `,
  styles: [`
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      z-index: 100;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
    }
    .backdrop.visible {
      opacity: 1;
      pointer-events: auto;
    }

    .sheet {
      position: fixed;
      left: 0; right: 0; bottom: 0;
      z-index: 101;
      background: var(--bg-elevated);
      border-top: 1px solid var(--border-strong);
      border-radius: 20px 20px 0 0;
      max-height: 92dvh;
      overflow-y: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
      padding: 0 1rem calc(1.5rem + env(safe-area-inset-bottom));
      transform: translateY(100%);
      transition: transform 0.32s cubic-bezier(0.32, 0.72, 0, 1);
    }
    .sheet.visible { transform: translateY(0); }

    .handle {
      width: 36px; height: 4px;
      background: var(--border-strong);
      border-radius: 2px;
      margin: 12px auto 0;
    }

    .sheet-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 0 0.75rem;
    }
    .sheet-title {
      font-family: var(--font-display);
      font-style: italic;
      font-size: 1.4rem;
      color: var(--amber);
      font-weight: 400;
    }
    .close-btn {
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 50%;
      background: var(--bg-card);
      color: var(--text-muted);
      font-size: 0.85rem;
      border: 1px solid var(--border);
    }

    .stomach-row {
      display: flex;
      gap: 0.4rem;
      margin-bottom: 1rem;
    }
    .s-pill {
      flex: 1;
      padding: 0.5rem 0.25rem;
      border-radius: 999px;
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.78rem;
      text-align: center;
      transition: all 0.15s ease;
      min-height: 40px;
    }
    .s-pill.active {
      background: var(--amber-dim);
      border-color: var(--amber);
      color: var(--amber-bright);
    }

    .cat-tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    .cat-tab {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.2rem;
      padding: 0.6rem 0.25rem;
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      border: 2px solid transparent;
      transition: all 0.15s ease;
      min-height: 58px;
    }
    .cat-tab.active {
      border-color: var(--amber);
      background: var(--bg);
    }
    .cat-icon { font-size: 1.4rem; line-height: 1; }
    .cat-label {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
    }
    .cat-tab.active .cat-label { color: var(--amber); }

    .presets {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .preset {
      background: var(--bg-card);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.25rem;
      transition: all 0.15s ease;
      min-height: 60px;
    }
    .preset.selected {
      border-color: var(--amber);
      background: rgba(212, 151, 74, 0.08);
    }
    .preset-name {
      font-size: 0.95rem;
      color: var(--text);
      font-weight: 500;
    }
    .preset-meta {
      font-size: 0.72rem;
      color: var(--text-muted);
    }

    .form {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      border-top: 1px solid var(--border);
      padding-top: 1rem;
    }
    .form-row {
      display: flex;
      gap: 0.6rem;
      align-items: flex-end;
    }
    .field {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .field-wide { flex: 2; }
    .now-btn {
      align-self: stretch;
      min-width: 56px;
      min-height: 44px;
    }

    input {
      min-height: 44px;
      font-size: 1rem;
    }

    .preview {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.6rem 0.8rem;
      background: var(--bg);
      border: 1px dashed var(--border-strong);
      border-radius: var(--radius);
      font-size: 0.88rem;
    }
    .preview-label {
      color: var(--text-muted);
      font-style: italic;
      font-family: var(--font-display);
    }
    .preview-value { color: var(--amber); }

    .add-btn {
      width: 100%;
      min-height: 52px;
      font-size: 1rem;
      border-radius: var(--radius-lg);
    }
  `],
})
export class AddDrinkModalComponent {
  open = input.required<boolean>();
  close = output<void>();

  protected storage = inject(StorageService);
  private bac = inject(BacService);
  private fb = inject(FormBuilder);

  protected categories: DrinkCategory[] = DRINK_CATEGORIES;
  protected stomachOptions: StomachState[] = ['empty', 'food', 'heavy'];
  protected activeCat = signal<'beer' | 'wine' | 'liquor'>('beer');
  protected selectedPreset = signal<string | null>(null);

  protected currentPresets = computed(() =>
    this.categories.find(c => c.key === this.activeCat())?.presets ?? []
  );

  protected form = this.fb.nonNullable.group({
    volumeMl:  [330,  [Validators.required, Validators.min(1)]],
    abv:       [5.0,  [Validators.required, Validators.min(0.1), Validators.max(96)]],
    timestamp: [toLocal(new Date()), Validators.required],
    label:     [''],
  });

  private formValue = signal(this.form.getRawValue());

  constructor() {
    this.form.valueChanges.subscribe(() => this.formValue.set(this.form.getRawValue()));
  }

  protected previewSober = computed(() => {
    const profile = this.storage.profile();
    if (!profile) return null;
    const v = this.formValue();
    if (!v.volumeMl || !v.abv || !v.timestamp) return null;
    const candidate: Drink = {
      id: '__preview__',
      volumeMl: v.volumeMl,
      abv: v.abv,
      timestamp: new Date(v.timestamp).toISOString(),
      stomachState: this.storage.stomachState(),
    };
    const curve = this.bac.computeCurve(
      [...currentSessionDrinks(this.storage.drinks()), candidate],
      profile,
    );
    return curve.soberAt ? this.fmt(curve.soberAt) : null;
  });

  protected applyPreset(p: DrinkPreset): void {
    this.selectedPreset.set(p.key);
    this.form.patchValue({ volumeMl: p.volumeMl, abv: p.abv });
  }

  protected setNow(): void {
    this.form.patchValue({ timestamp: toLocal(new Date()) });
  }

  protected setStomach(s: StomachState): void {
    this.storage.setStomachState(s);
  }

  protected stomachLabel(s: StomachState): string {
    return STOMACH_LABELS[s];
  }

  protected add(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.storage.addDrink({
      id: crypto.randomUUID(),
      volumeMl: v.volumeMl,
      abv: v.abv,
      timestamp: new Date(v.timestamp).toISOString(),
      stomachState: this.storage.stomachState(),
      label: v.label || undefined,
    });
    this.form.patchValue({ timestamp: toLocal(new Date()), label: '' });
    this.selectedPreset.set(null);
    this.close.emit();
  }

  private fmt(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return time;
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) return `${time} tomorrow`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
  }
}
