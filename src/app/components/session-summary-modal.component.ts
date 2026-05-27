import {
  ChangeDetectionStrategy, Component, computed, input, output,
} from '@angular/core';
import { CATEGORY_LABELS, DrinkCategoryKey, SessionSummary } from '../models/models';

function fmtDuration(ms: number): string {
  if (ms <= 0) return '0 min';
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function fmtPromille(bacPct: number): string {
  return (bacPct * 10).toLocaleString('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtGrams(g: number): string {
  return Math.round(g).toLocaleString('sv-SE');
}

@Component({
  selector: 'app-session-summary-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (summary(); as s) {
      <div class="backdrop" (click)="close.emit()"></div>
      <div class="card" role="dialog" aria-modal="true" aria-labelledby="summary-title">
        <h2 id="summary-title" class="title">Tack för att du delade</h2>
        <p class="muted">Här är vad du loggade under den här sessionen.</p>

        <dl class="stats">
          <div class="stat">
            <dt>Längd</dt>
            <dd class="mono">{{ duration(s) }}</dd>
          </div>
          <div class="stat">
            <dt>Drycker</dt>
            <dd class="mono">{{ s.drinkCount }}</dd>
          </div>
          <div class="stat">
            <dt>Topp</dt>
            <dd class="mono">{{ peak(s) }} ‰</dd>
          </div>
          <div class="stat">
            <dt>Alkohol</dt>
            <dd class="mono">{{ grams(s) }} g</dd>
          </div>
        </dl>

        @if (breakdown(s).length > 0) {
          <ul class="breakdown">
            @for (b of breakdown(s); track b.key) {
              <li>
                <span class="cat-label">{{ b.label }}</span>
                <span class="cat-count mono">{{ b.count }}</span>
              </li>
            }
          </ul>
        }

        <button class="btn btn-primary close-btn" type="button" (click)="close.emit()">
          Stäng
        </button>
      </div>
    }
  `,
  styles: [`
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      z-index: 150;
      animation: fade-in 0.2s ease;
    }
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

    .card {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(92vw, 380px);
      z-index: 151;
      background: var(--bg-elevated);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-lg);
      padding: 1.5rem 1.25rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      animation: pop-in 0.25s cubic-bezier(0.32, 0.72, 0, 1);
    }
    @keyframes pop-in {
      from { opacity: 0; transform: translate(-50%, calc(-50% + 12px)); }
      to   { opacity: 1; transform: translate(-50%, -50%); }
    }

    .title {
      font-family: var(--font-display);
      font-style: italic;
      font-size: 1.45rem;
      color: var(--amber);
      font-weight: 400;
      margin: 0;
    }
    .muted {
      color: var(--text-muted);
      font-size: 0.88rem;
      font-style: italic;
      font-family: var(--font-display);
      margin: -0.3rem 0 0.25rem;
    }

    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.7rem;
      margin: 0;
      padding: 0.65rem 0.5rem;
      background: var(--bg);
      border: 1px dashed var(--border-strong);
      border-radius: var(--radius);
    }
    .stat { display: flex; flex-direction: column; gap: 0.15rem; }
    .stat dt {
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-muted);
    }
    .stat dd {
      margin: 0;
      font-size: 1.1rem;
      color: var(--text);
    }

    .breakdown {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    .breakdown li {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.6rem;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 0.85rem;
    }
    .cat-label {
      font-family: var(--font-display);
      font-style: italic;
      color: var(--text);
    }
    .cat-count { color: var(--text-muted); font-size: 0.78rem; }

    .close-btn {
      width: 100%;
      min-height: 48px;
      margin-top: 0.4rem;
    }
  `],
})
export class SessionSummaryModalComponent {
  summary = input<SessionSummary | null>(null);
  close = output<void>();

  protected duration = (s: SessionSummary): string => fmtDuration(s.endedAt - s.startedAt);
  protected peak = (s: SessionSummary): string => fmtPromille(s.peakBac);
  protected grams = (s: SessionSummary): string => fmtGrams(s.totalGrams);

  protected breakdown = (s: SessionSummary): { key: DrinkCategoryKey; label: string; count: number }[] =>
    (Object.entries(s.categoryCounts) as [DrinkCategoryKey, number][])
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, label: CATEGORY_LABELS[key], count }));
}
