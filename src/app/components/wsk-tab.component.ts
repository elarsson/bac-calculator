import {
  ChangeDetectionStrategy, Component, inject, output,
} from '@angular/core';
import { StorageService } from '../services/storage.service';
import { WskChartComponent } from './wsk-chart.component';
import { WskFeedComponent } from './wsk-feed.component';

/**
 * The WSK tab: shared promille chart, drink feed, and the user's
 * WSK identity card. Loaded lazily by AppComponent via @defer so its
 * code (Chart.js mixers, distorted-avatar filters, reaction UI)
 * never ships in the main bundle — both the offline build and the
 * social build's first paint stay slim.
 *
 * The component never opens the claim modal directly; it bubbles
 * `claimRequested` up to AppComponent, which owns the modal so the
 * Solo-tab Festar toggle can also open it.
 */
@Component({
  selector: 'app-wsk-tab',
  standalone: true,
  imports: [WskChartComponent, WskFeedComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card chart-card">
      <app-wsk-chart />
    </section>

    <section class="card">
      <h2 class="section-title">Flödet</h2>
      <app-wsk-feed (needsName)="claimRequested.emit()" />
    </section>

    <section class="card identity-card">
      @if (storage.wskIdentity(); as id) {
        <div class="identity-row">
          <div class="avatar-circle" [class.empty]="!id.avatarDataUrl">
            @if (id.avatarDataUrl) {
              <img [src]="id.avatarDataUrl" [alt]="id.name" />
            } @else {
              <span class="mono dim">{{ id.name.charAt(0).toUpperCase() }}</span>
            }
          </div>
          <div class="identity-info">
            <span class="identity-label">Du i WSK</span>
            <span class="identity-name">{{ id.name }}</span>
          </div>
          <button class="btn btn-ghost" type="button" (click)="claimRequested.emit()">Ändra</button>
        </div>
      } @else {
        <div class="identity-row">
          <div class="identity-info">
            <span class="identity-label">Du är inte med än</span>
            <span class="muted small">Ange ett namn för att reagera och dela din promille.</span>
          </div>
          <button class="btn btn-primary" type="button" (click)="claimRequested.emit()">Gå med</button>
        </div>
      }
    </section>
  `,
  styles: [`
    :host {
      display: contents;
    }
    .chart-card  { padding: 0.75rem 0.5rem 0.5rem; }

    .identity-card { padding: 0.85rem 1rem; }
    .identity-row {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }
    .avatar-circle {
      width: 48px; height: 48px;
      border-radius: 50%;
      overflow: hidden;
      flex-shrink: 0;
      background: var(--bg);
      border: 1.5px solid var(--border);
      display: flex; align-items: center; justify-content: center;
    }
    .avatar-circle.empty { font-size: 1rem; color: var(--text-muted); }
    .avatar-circle img {
      width: 100%; height: 100%;
      object-fit: cover;
      display: block;
    }
    .identity-info {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      flex: 1;
      min-width: 0;
    }
    .identity-label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-muted);
    }
    .identity-name {
      font-family: var(--font-display);
      font-size: 1.15rem;
      color: var(--text);
      font-style: italic;
    }
    .small { font-size: 0.8rem; }
  `],
})
export class WskTabComponent {
  claimRequested = output<void>();
  protected storage = inject(StorageService);
}
