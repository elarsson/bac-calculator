import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { StorageService } from '../services/storage.service';
import { groupIntoSessions, DrinkSession } from '../services/session.util';
import { Drink, STOMACH_LABELS } from '../models/models';

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

@Component({
  selector: 'app-drink-history',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sessions().length === 0) {
      <p class="empty">No drinks yet.</p>
    } @else {
      @for (s of sessions(); track s.id; let first = $first) {
        <div class="session" [class.current]="first">
          <div class="session-header">
            <span class="session-label">
              @if (first) {
                <em>Current session</em>
              } @else {
                {{ formatSessionDate(s) }}
              }
            </span>
            <span class="session-meta mono">{{ s.drinks.length }} drink{{ s.drinks.length === 1 ? '' : 's' }}</span>
          </div>

          @for (d of s.drinks.slice().reverse(); track d.id) {
            <div class="row">
              @if (editingId() === d.id) {
                <form [formGroup]="editForm" (ngSubmit)="saveEdit(d.id)" class="edit-row">
                  <input type="number" formControlName="volumeMl" min="1" step="1" placeholder="ml" />
                  <input type="number" formControlName="abv" min="0.1" max="96" step="0.1" placeholder="%" />
                  <input type="datetime-local" formControlName="timestamp" />
                  <input type="text" formControlName="label" placeholder="label" />
                  <div class="edit-actions">
                    <button class="btn btn-primary" type="submit">Save</button>
                    <button class="btn btn-ghost" type="button" (click)="cancelEdit()">Cancel</button>
                  </div>
                </form>
              } @else {
                <div class="row-main">
                  <div class="row-left">
                    <div class="row-title">
                      <span class="time mono">{{ formatTime(d.timestamp) }}</span>
                      @if (d.label) {
                        <span class="label-text">{{ d.label }}</span>
                      }
                    </div>
                    <div class="row-meta mono">
                      {{ d.volumeMl }}ml · {{ d.abv }}% · {{ stomachLabel(d.stomachState) }}
                    </div>
                  </div>
                  <div class="row-actions">
                    <button class="btn btn-ghost" (click)="startEdit(d)">Edit</button>
                    <button class="btn btn-ghost danger" (click)="remove(d.id)">×</button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

      <div class="footer">
        <button class="btn btn-secondary" (click)="confirmClear()">
          @if (confirmingClear()) { Tap again to confirm } @else { Clear all history }
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

  editingId = signal<string | null>(null);
  confirmingClear = signal(false);
  private clearTimeout?: ReturnType<typeof setTimeout>;

  editForm = this.fb.nonNullable.group({
    volumeMl: [330, [Validators.required, Validators.min(1)]],
    abv: [5.0, [Validators.required, Validators.min(0.1), Validators.max(96)]],
    timestamp: ['', Validators.required],
    label: [''],
  });

  sessions = computed<DrinkSession[]>(() =>
    groupIntoSessions(this.storage.drinks())
  );

  startEdit(d: Drink): void {
    this.editForm.patchValue({
      volumeMl: d.volumeMl,
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
      volumeMl: v.volumeMl,
      abv: v.abv,
      timestamp: new Date(v.timestamp).toISOString(),
      label: v.label || undefined,
    });
    this.editingId.set(null);
  }

  remove(id: string): void {
    this.storage.deleteDrink(id);
  }

  confirmClear(): void {
    if (!this.confirmingClear()) {
      this.confirmingClear.set(true);
      this.clearTimeout = setTimeout(() => this.confirmingClear.set(false), 3000);
      return;
    }
    if (this.clearTimeout) clearTimeout(this.clearTimeout);
    this.storage.clearDrinks();
    this.confirmingClear.set(false);
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
