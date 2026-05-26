import {
  ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { StorageService } from '../services/storage.service';
import { BacService } from '../services/bac.service';
import { PhotoStoreService } from '../services/photo-store.service';
import { resizeMaxDimJpeg } from '../services/image.util';
import { currentSessionDrinks } from '../services/session.util';
import {
  DRINK_CATEGORIES, DrinkCategory, DrinkCategoryKey, Drink, STOMACH_LABELS, StomachState,
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
        <h2 class="sheet-title">Lägg till dryck</h2>
        <button class="close-btn" type="button" (click)="close.emit()">✕</button>
      </div>

      <!-- Magläge -->
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

      <!-- Kategoritabbar -->
      <div class="cat-tabs">
        @for (cat of categories; track cat.key) {
          <button
            class="cat-tab"
            [class.active]="activeCat() === cat.key"
            (click)="selectCategory(cat.key)">
            <span class="cat-icon">{{ cat.icon }}</span>
            <span class="cat-label">{{ cat.label }}</span>
          </button>
        }
      </div>

      <!-- Styrka -->
      <div class="preset-group">
        <div class="preset-group-label">Styrka</div>
        <div class="preset-chips">
          @for (s of currentStrengthPresets(); track s.abv) {
            <button
              class="preset-chip"
              [class.active]="isStrengthActive(s.abv)"
              type="button"
              (click)="selectStrength(s.abv)">
              {{ s.label }}
            </button>
          }
        </div>
      </div>

      <!-- Volym -->
      <div class="preset-group">
        <div class="preset-group-label">Volym</div>
        <div class="preset-chips">
          @for (v of currentVolumePresets(); track v.volumeCl) {
            <button
              class="preset-chip"
              [class.active]="isVolumeActive(v.volumeCl)"
              type="button"
              (click)="selectVolume(v.volumeCl)">
              {{ v.label }}
            </button>
          }
        </div>
      </div>

      <!-- Formulär -->
      <form [formGroup]="form" (ngSubmit)="add()" class="form">
        <div class="form-row">
          <div class="field">
            <label for="m-vol">Volym (cl)</label>
            <input id="m-vol" type="number" formControlName="volumeCl"
                   min="0.1" step="0.1" inputmode="decimal" />
          </div>
          <div class="field">
            <label for="m-abv">Alkohol (%)</label>
            <input id="m-abv" type="number" formControlName="abv"
                   min="0.1" max="96" step="0.1" inputmode="decimal" />
          </div>
        </div>

        <div class="form-row">
          <div class="field field-wide">
            <label for="m-when">När</label>
            <input id="m-when" type="datetime-local" formControlName="timestamp" />
          </div>
          <button class="btn btn-ghost now-btn" type="button" (click)="setNow()">nu</button>
        </div>

        <div class="field">
          <label for="m-label">Kommentar (valfritt)</label>
          <input id="m-label" type="text" formControlName="label"
                 placeholder="t.ex. snabb fredag" autocomplete="off" />
        </div>

        <div class="photo-row">
          <button class="btn btn-secondary" type="button" [disabled]="processingPhoto()" (click)="photoInput.click()">
            {{ processingPhoto() ? 'Läser in…' : pendingPhoto() ? 'Byt bild' : 'Lägg till bild' }}
          </button>
          @if (pendingPhoto(); as p) {
            <div class="photo-preview">
              <img [src]="p" alt="" />
              <button class="photo-remove" type="button" aria-label="Ta bort bild" (click)="clearPhoto()">×</button>
            </div>
          }
          <input #photoInput type="file" accept="image/*" capture="environment" hidden (change)="onPhoto($event)" />
        </div>

        @if (previewSober(); as s) {
          <div class="preview">
            <span class="preview-label">Nykter klockan</span>
            <span class="preview-value mono">{{ s }}</span>
          </div>
        }

        <button class="btn btn-primary add-btn" type="submit" [disabled]="form.invalid">
          Lägg till
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
      gap: 0.3rem;
      margin-bottom: 1rem;
    }
    .cat-tab {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.15rem;
      padding: 0.45rem 0.15rem;
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      border: 2px solid transparent;
      transition: all 0.15s ease;
      min-height: 54px;
      min-width: 0;
    }
    .cat-tab.active {
      border-color: var(--amber);
      background: var(--bg);
    }
    .cat-icon { font-size: 1.25rem; line-height: 1; }
    .cat-label {
      font-size: 0.62rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
    }
    .cat-tab.active .cat-label { color: var(--amber); }

    .preset-group {
      margin-bottom: 0.85rem;
    }
    .preset-group-label {
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-dim);
      margin-bottom: 0.4rem;
    }
    .preset-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
    .preset-chip {
      padding: 0.45rem 0.9rem;
      border-radius: 999px;
      background: var(--bg-card);
      border: 1.5px solid var(--border);
      color: var(--text-muted);
      font-size: 0.82rem;
      transition: all 0.15s ease;
      min-height: 36px;
      white-space: nowrap;
    }
    .preset-chip.active {
      background: var(--amber-dim);
      border-color: var(--amber);
      color: var(--amber-bright);
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

    .photo-row {
      display: flex;
      align-items: center;
      gap: 0.7rem;
    }
    .photo-row .btn { flex: 1; }
    .photo-preview {
      position: relative;
      width: 56px; height: 56px;
      border-radius: var(--radius);
      overflow: hidden;
      border: 1px solid var(--border);
      flex-shrink: 0;
    }
    .photo-preview img {
      width: 100%; height: 100%;
      object-fit: cover;
      display: block;
    }
    .photo-remove {
      position: absolute;
      top: -6px; right: -6px;
      width: 22px; height: 22px;
      border-radius: 50%;
      background: var(--bg-elevated);
      border: 1px solid var(--border-strong);
      color: var(--text);
      font-size: 0.8rem;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
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
  private photoStore = inject(PhotoStoreService);

  protected categories: DrinkCategory[] = DRINK_CATEGORIES;
  protected stomachOptions: StomachState[] = ['empty', 'food', 'heavy'];
  protected activeCat = signal<DrinkCategoryKey>('beer');
  protected pendingPhoto = signal<string | undefined>(undefined);
  protected processingPhoto = signal(false);

  protected currentStrengthPresets = computed(() =>
    this.categories.find(c => c.key === this.activeCat())?.strengthPresets ?? []
  );

  protected currentVolumePresets = computed(() =>
    this.categories.find(c => c.key === this.activeCat())?.volumePresets ?? []
  );

  protected form = this.fb.nonNullable.group({
    volumeCl: [50,  [Validators.required, Validators.min(0.1)]],
    abv:      [3.5, [Validators.required, Validators.min(0.1), Validators.max(96)]],
    timestamp: [toLocal(new Date()), Validators.required],
    label:     [''],
  });

  private formValue = signal(this.form.getRawValue());

  constructor() {
    this.form.valueChanges.subscribe(() => this.formValue.set(this.form.getRawValue()));
    effect(() => {
      if (this.open()) {
        untracked(() => this.prefillFromLastDrink());
      }
    });
  }

  private prefillFromLastDrink(): void {
    const drinks = this.storage.drinks();
    this.form.patchValue({ timestamp: toLocal(new Date()), label: '' });
    this.pendingPhoto.set(undefined);
    this.processingPhoto.set(false);
    if (drinks.length === 0) return;
    const last = [...drinks].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )[0];
    // Prefer the explicit category from the last drink. Fall back to the
    // legacy ABV-based inference for drinks logged before that field existed.
    const cat = last.category ?? this.inferCategory(last.abv);
    this.activeCat.set(cat);
    this.form.patchValue({ abv: last.abv, volumeCl: last.volumeMl / 10 });
  }

  private inferCategory(abv: number): DrinkCategoryKey {
    if (abv < 10) return 'beer';
    if (abv < 25) return 'wine';
    return 'liquor';
  }

  protected previewSober = computed(() => {
    const profile = this.storage.profile();
    if (!profile) return null;
    const v = this.formValue();
    if (!v.volumeCl || !v.abv || !v.timestamp) return null;
    const candidate: Drink = {
      id: '__preview__',
      volumeMl: v.volumeCl * 10,
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

  protected isStrengthActive(abv: number): boolean {
    return Math.abs((this.formValue().abv ?? 0) - abv) < 0.01;
  }

  protected isVolumeActive(cl: number): boolean {
    return Math.abs((this.formValue().volumeCl ?? 0) - cl) < 0.01;
  }

  protected selectCategory(key: DrinkCategoryKey): void {
    this.activeCat.set(key);
    const cat = this.categories.find(c => c.key === key)!;
    const ds = cat.strengthPresets.find(s => s.default) ?? cat.strengthPresets[0];
    const dv = cat.volumePresets.find(v => v.default) ?? cat.volumePresets[0];
    this.form.patchValue({ abv: ds.abv, volumeCl: dv.volumeCl });
  }

  protected selectStrength(abv: number): void {
    this.form.patchValue({ abv });
  }

  protected selectVolume(volumeCl: number): void {
    this.form.patchValue({ volumeCl });
  }

  protected setNow(): void {
    this.form.patchValue({ timestamp: toLocal(new Date()) });
  }

  protected async onPhoto(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.processingPhoto.set(true);
    try {
      this.pendingPhoto.set(await resizeMaxDimJpeg(file, 800));
    } catch {
      // ignore failed read
    } finally {
      this.processingPhoto.set(false);
    }
  }

  protected clearPhoto(): void {
    this.pendingPhoto.set(undefined);
  }

  protected setStomach(s: StomachState): void {
    this.storage.setStomachState(s);
  }

  protected stomachLabel(s: StomachState): string {
    return STOMACH_LABELS[s];
  }

  protected async add(): Promise<void> {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const id = crypto.randomUUID();
    let photoId: string | undefined;
    const photo = this.pendingPhoto();
    if (photo) {
      photoId = crypto.randomUUID();
      try {
        await this.photoStore.put(photoId, photo);
      } catch {
        photoId = undefined;
      }
    }
    this.storage.addDrink({
      id,
      volumeMl: v.volumeCl * 10,
      abv: v.abv,
      timestamp: new Date(v.timestamp).toISOString(),
      stomachState: this.storage.stomachState(),
      label: v.label || undefined,
      photoId,
      category: this.activeCat(),
    });
    this.close.emit();
  }

  private fmt(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return time;
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) return `${time} imorgon`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
  }
}
