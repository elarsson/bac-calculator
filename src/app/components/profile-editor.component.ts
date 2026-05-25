import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { StorageService } from '../services/storage.service';
import { BacService } from '../services/bac.service';
import { Profile } from '../models/models';

@Component({
  selector: 'app-profile-editor',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" class="grid">
      <div class="field">
        <label for="sex">Kön</label>
        <select id="sex" formControlName="sex">
          <option value="male">Man</option>
          <option value="female">Kvinna</option>
        </select>
      </div>

      <div class="field">
        <label for="age">Ålder</label>
        <input id="age" type="number" formControlName="age" min="14" max="120" />
      </div>

      <div class="field">
        <label for="height">Längd (cm)</label>
        <input id="height" type="number" formControlName="heightCm" min="120" max="230" step="0.5" />
      </div>

      <div class="field">
        <label for="weight">Vikt (kg)</label>
        <input id="weight" type="number" formControlName="weightKg" min="35" max="250" step="0.5" />
      </div>

      <div class="actions">
        <button class="btn btn-primary" type="submit" [disabled]="form.invalid">
          Spara profil
        </button>
        @if (currentR(); as r) {
          <span class="meta">Widmark r &nbsp;<span class="mono">{{ r.toFixed(3) }}</span></span>
        }
      </div>
    </form>
  `,
  styles: [`
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.9rem;
    }
    .field { display: flex; flex-direction: column; }
    .actions {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-top: 0.4rem;
    }
    .meta {
      font-size: 0.8rem;
      color: var(--text-muted);
      letter-spacing: 0.04em;
    }
    @media (max-width: 400px) {
      .grid { grid-template-columns: 1fr; }
    }
  `],
})
export class ProfileEditorComponent {
  private fb = inject(FormBuilder);
  private storage = inject(StorageService);
  private bac = inject(BacService);

  form = this.fb.nonNullable.group({
    sex: ['male' as 'male' | 'female', Validators.required],
    age: [30, [Validators.required, Validators.min(14), Validators.max(120)]],
    heightCm: [175, [Validators.required, Validators.min(120), Validators.max(230)]],
    weightKg: [75, [Validators.required, Validators.min(35), Validators.max(250)]],
  });

  constructor() {
    const existing = this.storage.profile();
    if (existing) {
      this.form.patchValue(existing);
    }
  }

  currentR(): number | null {
    if (this.form.invalid) return null;
    const v = this.form.getRawValue() as Profile;
    try {
      return this.bac.widmarkR(v);
    } catch {
      return null;
    }
  }

  save(): void {
    if (this.form.invalid) return;
    this.storage.saveProfile(this.form.getRawValue() as Profile);
  }
}
