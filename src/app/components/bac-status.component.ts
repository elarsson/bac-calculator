import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { StorageService } from '../services/storage.service';
import { BacService } from '../services/bac.service';
import { currentSessionDrinks } from '../services/session.util';

@Component({
  selector: 'app-bac-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!storage.profile()) {
      <div class="empty">Ange din profil för att börja.</div>
    } @else if (sessionDrinks().length === 0) {
      <div class="empty">Inga drycker loggade. Lägg till en nedan.</div>
    } @else {
      <div class="grid">
        <div class="reading primary">
          <div class="label">Promillehalt</div>
          <div class="value mono" [class]="'tier-' + tier()">
            {{ formatPromille(curve().currentBac) }}<span class="unit">‰</span>
          </div>
          <div class="sub mono">{{ tierLabel() }}</div>
        </div>

        <div class="reading">
          <div class="label">Nykter klockan</div>
          <div class="value mono">
            @if (curve().soberAt) {
              {{ formatSober(curve().soberAt!) }}
            } @else {
              —
            }
          </div>
          <div class="sub mono">
            @if (curve().soberAt) {
              {{ formatDuration(curve().soberAt! - now()) }} kvar
            }
          </div>
        </div>

        <div class="reading">
          <div class="label">Topp</div>
          <div class="value mono">{{ formatPromille(curve().peakBac) }}<span class="unit">‰</span></div>
          <div class="sub mono">
            @if (curve().peakAt) {
              @if (curve().peakAt! < now()) {
                kl. {{ formatClock(curve().peakAt!) }}
              } @else {
                beräknad {{ formatClock(curve().peakAt!) }}
              }
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .empty {
      padding: 1.5rem 1rem;
      text-align: center;
      color: var(--text-muted);
      font-style: italic;
      font-family: var(--font-display);
      font-size: 1.1rem;
    }
    .grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr 1fr;
      gap: 1rem;
    }
    .reading { display: flex; flex-direction: column; gap: 0.2rem; }
    .label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-muted);
    }
    .value {
      font-size: 1.6rem;
      font-weight: 500;
      letter-spacing: -0.02em;
      color: var(--text);
    }
    .primary .value { font-size: 2.4rem; }
    .unit {
      font-size: 0.7em;
      color: var(--text-muted);
      margin-left: 0.1em;
    }
    .sub {
      font-size: 0.78rem;
      color: var(--text-muted);
    }
    .tier-clear { color: var(--text); }
    .tier-low { color: var(--green); }
    .tier-mid { color: var(--yellow); }
    .tier-high { color: var(--orange); }
    .tier-extreme { color: var(--red); }
    @media (max-width: 500px) {
      .grid { grid-template-columns: 1fr 1fr; }
      .primary { grid-column: 1 / -1; }
      .primary .value { font-size: 2rem; }
    }
  `],
})
export class BacStatusComponent implements OnInit, OnDestroy {
  storage = inject(StorageService);
  private bacService = inject(BacService);

  now = signal(Date.now());
  private tickHandle?: ReturnType<typeof setInterval>;

  sessionDrinks = computed(() => currentSessionDrinks(this.storage.drinks()));

  curve = computed(() => {
    const profile = this.storage.profile();
    const drinks = this.sessionDrinks();
    if (!profile || drinks.length === 0) {
      return { points: [], currentBac: 0, peakBac: 0, peakAt: null, soberAt: null, r: 0 };
    }
    // referencing `now()` triggers recompute every tick
    return this.bacService.computeCurve(drinks, profile, this.now());
  });

  tier = computed(() => {
    const b = this.curve().currentBac;
    if (b <= 0) return 'clear';
    if (b < 0.03) return 'low';
    if (b < 0.06) return 'mid';
    if (b < 0.10) return 'high';
    return 'extreme';
  });

  tierLabel = computed(() => {
    switch (this.tier()) {
      case 'clear': return 'nykter';
      case 'low': return 'mild';
      case 'mid': return 'måttlig';
      case 'high': return 'hög';
      case 'extreme': return 'mycket hög';
    }
    return '';
  });

  ngOnInit(): void {
    this.tickHandle = setInterval(() => this.now.set(Date.now()), 30_000);
  }

  ngOnDestroy(): void {
    if (this.tickHandle) clearInterval(this.tickHandle);
  }

  formatSober(ts: number): string {
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
    if (isTomorrow) return `${time} imorgon`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
  }

  formatClock(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  formatDuration(ms: number): string {
    if (ms <= 0) return 'nu';
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}min`;
  }

  formatPromille(bac: number): string {
    return (bac * 10).toLocaleString('sv-SE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}
