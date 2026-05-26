import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { StorageService } from '../services/storage.service';
import { PhotoStoreService } from '../services/photo-store.service';
import { groupIntoSessions, DrinkSession } from '../services/session.util';
import { Drink, STOMACH_LABELS } from '../models/models';
import { PhotoThumbComponent } from './photo-thumb.component';

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

@Component({
  selector: 'app-drink-history',
  standalone: true,
  imports: [ReactiveFormsModule, PhotoThumbComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sessions().length === 0) {
      <p class="empty">Inga drycker ännu.</p>
    } @else {
      @for (s of sessions(); track s.id; let first = $first) {
        <div class="session" [class.current]="first">
          <div class="session-header">
            <span class="session-label">
              @if (first) {
                <em>Nuvarande session</em>
              } @else {
                {{ formatSessionDate(s) }}
              }
            </span>
            <span class="session-meta mono">{{ s.drinks.length }} dryck{{ s.drinks.length === 1 ? '' : 'er' }}</span>
          </div>

          @for (d of s.drinks.slice().reverse(); track d.id) {
            <div class="row">
              @if (editingId() === d.id) {
                <form [formGroup]="editForm" (ngSubmit)="saveEdit(d.id)" class="edit-row">
                  <input type="number" formControlName="volumeCl" min="0.1" step="0.1" placeholder="cl" />
                  <input type="number" formControlName="abv" min="0.1" max="96" step="0.1" placeholder="%" />
                  <input type="datetime-local" formControlName="timestamp" />
                  <input type="text" formControlName="label" placeholder="label" />
                  <div class="edit-actions">
                    <button class="btn btn-primary" type="submit">Spara</button>
                    <button class="btn btn-ghost" type="button" (click)="cancelEdit()">Avbryt</button>
                  </div>
                </form>
              } @else {
                <div class="row-main">
                  @if (d.photoId) {
                    <app-photo-thumb [photoId]="d.photoId" />
                  }
                  <div class="row-left">
                    <div class="row-title">
                      <span class="time mono">{{ formatTime(d.timestamp) }}</span>
                      @if (d.label) {
                        <span class="label-text">{{ d.label }}</span>
                      }
                    </div>
                    <div class="row-meta mono">
                      {{ formatVolumeCl(d.volumeMl) }} · {{ d.abv }}% · {{ stomachLabel(d.stomachState) }}
                    </div>
                  </div>
                  <div class="row-actions">
                    <button class="btn btn-ghost" (click)="startEdit(d)">Redigera</button>
                    <button class="btn btn-ghost danger" (click)="remove(d)">×</button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

      <div class="footer">
        <button class="btn btn-secondary" (click)="confirmClear()">
          @if (confirmingClear()) { Tryck igen för att bekräfta } @else { Rensa all historik }
        </button>
      </div>
    }
  `,
  styles: [`
    .empty {
      color: var(--text-muted);
      font-style: italic;
      font-family: var(--font-display);
      padding: 0.5rem 0;
    }
    .session {
      border-top: 1px solid var(--border);
      padding: 0.8rem 0;
    }
    .session:first-of-type { border-top: none; padding-top: 0; }
    .session-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 0.5rem;
    }
    .session-label {
      font-family: var(--font-display);
      font-size: 1rem;
      color: var(--text-muted);
    }
    .session.current .session-label em {
      color: var(--amber);
      font-style: italic;
    }
    .session-meta {
      font-size: 0.75rem;
      color: var(--text-dim);
    }
    .row {
      padding: 0.5rem 0;
      border-top: 1px dashed var(--border);
    }
    .row:first-of-type { border-top: none; }
    .row-main {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
    }
    .row-left { min-width: 0; flex: 1; }
    .row-title {
      display: flex;
      gap: 0.6rem;
      align-items: baseline;
      margin-bottom: 0.15rem;
    }
    .time { color: var(--text); font-size: 0.95rem; }
    .label-text {
      color: var(--text-muted);
      font-style: italic;
      font-family: var(--font-display);
      font-size: 0.95rem;
    }
    .row-meta {
      font-size: 0.75rem;
      color: var(--text-muted);
      letter-spacing: 0.02em;
    }
    .row-actions { display: flex; gap: 0.2rem; flex-shrink: 0; }
    .row-actions .danger:hover { color: var(--red); }
    .edit-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.4rem;
    }
    .edit-row input[type="datetime-local"],
    .edit-row input[type="text"] {
      grid-column: 1 / -1;
    }
    .edit-actions {
      grid-column: 1 / -1;
      display: flex;
      gap: 0.4rem;
      justify-content: flex-end;
    }
    .footer {
      margin-top: 1rem;
      display: flex;
      justify-content: flex-end;
    }
  `],
})
export class DrinkHistoryComponent {
  private storage = inject(StorageService);
  private fb = inject(FormBuilder);
  private photoStore = inject(PhotoStoreService);

  editingId = signal<string | null>(null);
  confirmingClear = signal(false);
  private clearTimeout?: ReturnType<typeof setTimeout>;

  editForm = this.fb.nonNullable.group({
    volumeCl: [33, [Validators.required, Validators.min(0.1)]],
    abv: [5.0, [Validators.required, Validators.min(0.1), Validators.max(96)]],
    timestamp: ['', Validators.required],
    label: [''],
  });

  sessions = computed<DrinkSession[]>(() =>
    groupIntoSessions(this.storage.drinks())
  );

  startEdit(d: Drink): void {
    this.editForm.patchValue({
      volumeCl: d.volumeMl / 10,
      abv: d.abv,
      timestamp: toLocalInputValue(new Date(d.timestamp)),
      label: d.label ?? '',
    });
    this.editingId.set(d.id);
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  saveEdit(id: string): void {
    if (this.editForm.invalid) return;
    const v = this.editForm.getRawValue();
    this.storage.updateDrink(id, {
      volumeMl: v.volumeCl * 10,
      abv: v.abv,
      timestamp: new Date(v.timestamp).toISOString(),
      label: v.label || undefined,
    });
    this.editingId.set(null);
  }

  remove(d: Drink): void {
    if (d.photoId) {
      this.photoStore.delete(d.photoId).catch(() => undefined);
    }
    this.storage.deleteDrink(d.id);
  }

  confirmClear(): void {
    if (!this.confirmingClear()) {
      this.confirmingClear.set(true);
      this.clearTimeout = setTimeout(() => this.confirmingClear.set(false), 3000);
      return;
    }
    if (this.clearTimeout) clearTimeout(this.clearTimeout);
    const ids = this.storage.drinks().map(d => d.photoId).filter((id): id is string => !!id);
    ids.forEach(id => this.photoStore.delete(id).catch(() => undefined));
    this.storage.clearDrinks();
    this.confirmingClear.set(false);
  }

  formatVolumeCl(ml: number): string {
    const cl = ml / 10;
    if (Number.isInteger(cl)) return `${cl} cl`;
    return `${cl.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} cl`;
  }

  formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  stomachLabel(s: keyof typeof STOMACH_LABELS): string {
    return STOMACH_LABELS[s];
  }

  formatSessionDate(s: DrinkSession): string {
    const d = new Date(s.start);
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }
}
