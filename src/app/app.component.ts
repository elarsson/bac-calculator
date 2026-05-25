import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { StorageService } from './services/storage.service';
import { BacStatusComponent } from './components/bac-status.component';
import { BacChartComponent } from './components/bac-chart.component';
import { AddDrinkComponent } from './components/add-drink.component';
import { DrinkHistoryComponent } from './components/drink-history.component';
import { ProfileEditorComponent } from './components/profile-editor.component';
import { STOMACH_LABELS, StomachState } from './models/models';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    BacStatusComponent,
    BacChartComponent,
    AddDrinkComponent,
    DrinkHistoryComponent,
    ProfileEditorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <header>
        <h1 class="title">B<span class="ampersand">·</span>A<span class="ampersand">·</span>C</h1>
        <p class="subtitle">a personal pour log</p>
      </header>

      @if (!storage.profile()) {
        <section class="card hero">
          <h2 class="section-title">First, your profile</h2>
          <p class="muted intro">
            Used to compute total body water (Watson) for accurate distribution.
          </p>
          <app-profile-editor />
        </section>
      } @else {
        <section class="card status-card">
          <app-bac-status />
        </section>

        <section class="card chart-card">
          <app-bac-chart />
        </section>

        <section class="card">
          <div class="card-header">
            <h2 class="section-title">Stomach</h2>
            <span class="muted small">applies to new drinks</span>
          </div>
          <div class="stomach-pills">
            @for (s of stomachOptions; track s) {
              <button
                class="pill"
                [class.active]="storage.stomachState() === s"
                (click)="setStomach(s)">
                {{ stomachLabel(s) }}
              </button>
            }
          </div>
        </section>

        <section class="card">
          <h2 class="section-title">Add a drink</h2>
          <app-add-drink />
        </section>

        <section class="card">
          <div class="card-header collapsible" (click)="historyOpen.set(!historyOpen())">
            <h2 class="section-title">History</h2>
            <span class="chev">{{ historyOpen() ? '–' : '+' }}</span>
          </div>
          @if (historyOpen()) {
            <app-drink-history />
          }
        </section>

        <section class="card">
          <div class="card-header collapsible" (click)="profileOpen.set(!profileOpen())">
            <h2 class="section-title">Profile</h2>
            <span class="chev">{{ profileOpen() ? '–' : '+' }}</span>
          </div>
          @if (profileOpen()) {
            <app-profile-editor />
          }
        </section>
      }

      <footer>
        <p class="dim small">
          Watson body water · first-order absorption · linear elimination at 0.015%/hr
        </p>
      </footer>
    </main>
  `,
  styles: [`
    main {
      max-width: 640px;
      margin: 0 auto;
      padding: 1.5rem 1rem 3rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    header {
      text-align: center;
      padding: 1.5rem 0 1rem;
    }
    .title {
      font-family: var(--font-display);
      font-size: 2.6rem;
      font-weight: 500;
      color: var(--amber);
      letter-spacing: 0.04em;
    }
    .ampersand {
      color: var(--text-dim);
      font-weight: 400;
      margin: 0 0.15em;
    }
    .subtitle {
      font-family: var(--font-display);
      font-style: italic;
      color: var(--text-muted);
      font-size: 1rem;
      margin-top: -0.2rem;
    }
    .hero { padding: 1.5rem; }
    .intro {
      font-size: 0.9rem;
      margin: -0.3rem 0 1rem;
      font-style: italic;
      font-family: var(--font-display);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 0.8rem;
    }
    .card-header .section-title { margin-bottom: 0; }
    .collapsible { cursor: pointer; user-select: none; }
    .chev {
      color: var(--text-muted);
      font-size: 1.4rem;
      font-family: var(--font-display);
      line-height: 1;
    }
    .small { font-size: 0.78rem; }

    .status-card { padding: 1.5rem 1.25rem; }
    .chart-card { padding: 1rem 0.75rem 0.75rem; }

    .stomach-pills {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }
    .pill {
      padding: 0.5rem 0.9rem;
      border-radius: 999px;
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.85rem;
      transition: all 0.15s ease;
    }
    .pill:hover { color: var(--text); }
    .pill.active {
      background: var(--amber);
      color: var(--bg);
      border-color: var(--amber);
    }

    footer {
      text-align: center;
      margin-top: 1rem;
      padding: 0 0.5rem;
    }
  `],
})
export class AppComponent {
  storage = inject(StorageService);

  historyOpen = signal(true);
  profileOpen = signal(false);

  stomachOptions: StomachState[] = ['empty', 'food', 'heavy'];

  setStomach(s: StomachState): void {
    this.storage.setStomachState(s);
  }

  stomachLabel(s: StomachState): string {
    return STOMACH_LABELS[s];
  }
}
