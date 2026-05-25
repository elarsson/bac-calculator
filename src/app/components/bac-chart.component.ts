import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import type { ChartConfiguration, ChartData, ChartOptions } from 'chart.js';
import { StorageService } from '../services/storage.service';
import { BacService } from '../services/bac.service';
import { currentSessionDrinks } from '../services/session.util';

@Component({
  selector: 'app-bac-chart',
  standalone: true,
  imports: [BaseChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (storage.profile() && sessionDrinks().length > 0) {
      <div class="chart-wrap">
        <canvas baseChart
                [type]="'line'"
                [data]="chartData()"
                [options]="chartOptions">
        </canvas>
      </div>
    }
  `,
  styles: [`
    .chart-wrap {
      position: relative;
      height: 280px;
      width: 100%;
    }
    @media (max-width: 500px) {
      .chart-wrap { height: 240px; }
    }
  `],
})
export class BacChartComponent implements OnInit, OnDestroy {
  storage = inject(StorageService);
  private bacService = inject(BacService);

  now = signal(Date.now());
  private tickHandle?: ReturnType<typeof setInterval>;

  sessionDrinks = computed(() => currentSessionDrinks(this.storage.drinks()));

  chartData = computed<ChartData<'line'>>(() => {
    const profile = this.storage.profile();
    const drinks = this.sessionDrinks();
    const now = this.now();
    if (!profile || drinks.length === 0) {
      return { datasets: [] };
    }
    const curve = this.bacService.computeCurve(drinks, profile, now);

    // Split points at `now` into actual and projected
    const actual: { x: number; y: number }[] = [];
    const projected: { x: number; y: number }[] = [];

    for (const p of curve.points) {
      const pt = { x: p.t, y: +p.bac.toFixed(4) };
      if (p.t <= now) actual.push(pt);
      else projected.push(pt);
    }

    // Bridge: include "now" point in both series so the line is continuous
    if (actual.length > 0 && projected.length > 0) {
      const last = actual[actual.length - 1];
      const first = projected[0];
      // Interpolate value at `now`
      if (last.x < now && first.x > now) {
        const ratio = (now - last.x) / (first.x - last.x);
        const interpY = last.y + (first.y - last.y) * ratio;
        const bridge = { x: now, y: +interpY.toFixed(4) };
        actual.push(bridge);
        projected.unshift(bridge);
      }
    }

    // Drink markers (interpolated from curve)
    const drinkMarkers = drinks.map((d) => {
      const t = new Date(d.timestamp).getTime();
      return { x: t, y: this.bacService.bacAtFromCurve(t, curve) };
    });

    return {
      datasets: [
        {
          label: 'BAC',
          data: actual,
          borderColor: '#d4974a',
          backgroundColor: 'rgba(212, 151, 74, 0.12)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.25,
          fill: true,
        },
        {
          label: 'Projected',
          data: projected,
          borderColor: '#d4974a',
          backgroundColor: 'rgba(212, 151, 74, 0.04)',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          tension: 0.25,
          fill: true,
        },
        {
          label: 'Drinks',
          data: drinkMarkers,
          borderColor: 'rgba(232, 183, 106, 0.9)',
          backgroundColor: '#e8b76a',
          pointRadius: 4,
          pointHoverRadius: 6,
          showLine: false,
        },
      ],
    };
  });

  chartOptions: ChartOptions<'line'> = {
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
        displayColors: false,
        callbacks: {
          title: (items) => {
            const x = items[0].parsed.x;
            return x != null ? new Date(x).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          },
          label: (item) => `${((item.parsed.y as number) * 10).toFixed(2)} ‰`,
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
          callback: (val) => ((val as number) * 10).toFixed(1) + ' ‰',
        },
        grid: { color: 'rgba(58, 46, 38, 0.5)' },
      },
    },
  };

  ngOnInit(): void {
    this.tickHandle = setInterval(() => this.now.set(Date.now()), 60_000);
  }
  ngOnDestroy(): void {
    if (this.tickHandle) clearInterval(this.tickHandle);
  }
}
