import {
  ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal,
} from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import type { ChartData, ChartOptions } from 'chart.js';
import { WskSyncService } from '../services/wsk-sync.service';
import { DistortedAvatarComponent } from './distorted-avatar.component';

/** Stable colour palette, cycled by participant name hash. */
const PALETTE = [
  '#e85aad', // hot pink
  '#5ac8e8', // cyan
  '#e8b76a', // amber
  '#7ad07a', // green
  '#c98ae8', // purple
  '#e88a5a', // orange
  '#5aa0e8', // blue
  '#d4974a', // whiskey
];

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

@Component({
  selector: 'app-wsk-chart',
  standalone: true,
  imports: [BaseChartDirective, DistortedAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (participants().length === 0) {
      <p class="empty">Inget delas just nu.</p>
    } @else {
      <div class="chart-wrap">
        <canvas baseChart
                [type]="'line'"
                [data]="chartData()"
                [options]="chartOptions">
        </canvas>
      </div>
      <ul class="legend">
        @for (p of participants(); track p.participantName) {
          <li>
            <app-distorted-avatar
              [src]="avatarFor(p.participantName)"
              [name]="p.participantName"
              [promille]="p.currentBac * 10"
              [size]="36" />
            <span class="line-color" [style.background]="colorFor(p.participantName)"></span>
            <span class="name">{{ p.participantName }}</span>
            <span class="bac mono">{{ (p.currentBac * 10).toFixed(2) }} ‰</span>
          </li>
        }
      </ul>
    }
  `,
  styles: [`
    .empty {
      padding: 1.25rem 0.5rem;
      text-align: center;
      color: var(--text-muted);
      font-style: italic;
      font-family: var(--font-display);
    }
    .chart-wrap {
      position: relative;
      height: 280px;
      width: 100%;
    }
    @media (max-width: 500px) {
      .chart-wrap { height: 240px; }
    }
    .legend {
      list-style: none;
      padding: 0.6rem 0 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .legend li {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      font-size: 0.92rem;
    }
    .line-color {
      width: 14px; height: 3px;
      border-radius: 2px;
      flex-shrink: 0;
    }
    .name {
      color: var(--text);
      flex: 1;
      min-width: 0;
      font-family: var(--font-display);
      font-style: italic;
    }
    .bac { color: var(--text-muted); }
  `],
})
export class WskChartComponent implements OnInit, OnDestroy {
  private sync = inject(WskSyncService);
  protected colorFor = colorFor;
  protected avatarFor = (name: string): string | undefined => this.sync.avatarFor(name);

  now = signal(Date.now());
  private tickHandle?: ReturnType<typeof setInterval>;

  protected participants = computed(() => this.sync.visibleParticipants());

  /** Earliest first-sober-drink across all currently-sharing participants. */
  protected sharedAnchor = computed(() => {
    const anchors = this.participants()
      .map(p => p.firstSoberDrinkAt)
      .filter((t): t is number => t !== null);
    return anchors.length ? Math.min(...anchors) : null;
  });

  protected chartData = computed<ChartData<'line'>>(() => {
    const ps = this.participants();
    const anchor = this.sharedAnchor();
    const now = this.now();
    if (ps.length === 0 || anchor === null) return { datasets: [] };

    return {
      datasets: ps.map(p => {
        const color = colorFor(p.participantName);
        // Clip to the shared anchor; future-project samples will be drawn
        // as dashed at render time once notification batching lands.
        const data = p.curve
          .filter(pt => pt.t >= anchor && pt.t <= now)
          .map(pt => ({ x: pt.t, y: +pt.bac.toFixed(4) }));
        return {
          label: p.participantName,
          data,
          borderColor: color,
          backgroundColor: color + '22',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.25,
          fill: false,
        };
      }),
    };
  });

  protected chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#221a14',
        borderColor: '#3a2e26',
        borderWidth: 1,
        titleColor: '#f0e6d8',
        bodyColor: '#f0e6d8',
        padding: 10,
        displayColors: true,
        callbacks: {
          title: (items) => {
            const x = items[0].parsed.x;
            return x != null ? new Date(x).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          },
          label: (item) => {
            const promille = (item.parsed.y as number) * 10;
            return `${item.dataset.label}: ${promille.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ‰`;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        ticks: {
          color: '#6a5848',
          font: { family: 'JetBrains Mono', size: 10 },
          maxRotation: 0,
          autoSkipPadding: 30,
          callback: (val) => {
            const d = new Date(val as number);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          },
        },
        grid: { color: 'rgba(58, 46, 38, 0.5)' },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: '#6a5848',
          font: { family: 'JetBrains Mono', size: 10 },
          callback: (val) => {
            const promille = (val as number) * 10;
            return promille.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ‰';
          },
        },
        grid: { color: 'rgba(58, 46, 38, 0.5)' },
      },
    },
  };

  ngOnInit(): void {
    this.tickHandle = setInterval(() => this.now.set(Date.now()), 30_000);
  }
  ngOnDestroy(): void {
    if (this.tickHandle) clearInterval(this.tickHandle);
  }
}
