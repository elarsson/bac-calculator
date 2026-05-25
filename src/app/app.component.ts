import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { StorageService } from './services/storage.service';
import { BacStatusComponent } from './components/bac-status.component';
import { BacChartComponent } from './components/bac-chart.component';
import { AddDrinkModalComponent } from './components/add-drink-modal.component';
import { DrinkHistoryComponent } from './components/drink-history.component';
import { ProfileEditorComponent } from './components/profile-editor.component';
import { STOMACH_LABELS, StomachState } from './models/models';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    BacStatusComponent,
    BacChartComponent,
    AddDrinkModalComponent,
    DrinkHistoryComponent,
    ProfileEditorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <header>
        <h1 class="title">B<span class="dot">·</span>A<span class="dot">·</span>C</h1>
        <p class="subtitle">din personliga drinklogg</p>
      </header>

      @if (!storage.profile()) {
        <section class="card hero">
          <h2 class="section-title">Sätt upp din profil</h2>
          <p class="muted intro">Används för att beräkna total kroppsvätska (Watson) för korrekt fördelning.</p>
          <app-profile-editor />
        </section>
      } @else {

        <section class="card status-card">
          <app-bac-status />
          <div class="stomach-strip">
            @for (s of stomachOptions; track s) {
              <button
                class="s-chip"
                [class.active]="storage.stomachState() === s"
                (click)="setStomach(s)">
                {{ stomachLabel(s) }}
              </button>
            }
          </div>
        </section>

        <section class="card chart-card">
          <app-bac-chart />
        </section>

        <section class="card">
          <div class="card-header collapsible" (click)="historyOpen.set(!historyOpen())">
            <h2 class="section-title">Historik</h2>
            <span class="chev">{{ historyOpen() ? '–' : '+' }}</span>
          </div>
          @if (historyOpen()) {
            <app-drink-history />
          }
        </section>

        <section class="card">
          <div class="card-header collapsible" (click)="profileOpen.set(!profileOpen())">
            <h2 class="section-title">Profil</h2>
            <span class="chev">{{ profileOpen() ? '–' : '+' }}</span>
          </div>
          @if (profileOpen()) {
            <app-profile-editor />
          }
        </section>

        <!-- spacer so FAB doesn't overlap last card -->
        <div class="fab-spacer"></div>

        <!-- Floating action button -->
        <button class="fab" (click)="modalOpen.set(true)" aria-label="Add drink">
          <span class="fab-icon">+</span>
        </button>

        <!-- Add drink modal -->
        <app-add-drink-modal
          [open]="modalOpen()"
          (close)="modalOpen.set(false)" />
      }

      <footer>
        <p class="dim small">Watson · absorption av första ordningen · 0,015%/tim eliminering</p>
      </footer>
    </main>
  `,
  styles: [`
    main {
      max-width: 480px;
      margin: 0 auto;
      padding: 0 0.75rem calc(2rem + env(safe-area-inset-bottom));
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding-top: env(safe-area-inset-top, 0);
    }

    header {
      text-align: center;
      padding: 1rem 0 0.5rem;
    }
    .title {
      font-family: var(--font-display);
      font-size: 2.2rem;
      font-weight: 500;
      color: var(--amber);
      letter-spacing: 0.04em;
    }
    .dot {
      color: var(--text-dim);
      font-weight: 400;
      margin: 0 0.1em;
    }
    .subtitle {
      font-family: var(--font-display);
      font-style: italic;
      color: var(--text-muted);
      font-size: 0.92rem;
    }

    .hero { padding: 1.25rem; }
    .intro {
      font-size: 0.88rem;
      margin: -0.2rem 0 1rem;
      font-style: italic;
      font-family: var(--font-display);
    }

    .status-card { padding: 1.25rem 1rem 0.75rem; }
    .chart-card  { padding: 0.75rem 0.5rem 0.5rem; }

    /* Stomach state strip inside status card */
    .stomach-strip {
      display: flex;
      gap: 0.4rem;
      margin-top: 0.85rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--border);
    }
    .s-chip {
      flex: 1;
      padding: 0.4rem 0;
      border-radius: 999px;
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.75rem;
      text-align: center;
      transition: all 0.15s ease;
      min-height: 36px;
    }
    .s-chip.active {
      background: var(--amber-dim);
      border-color: var(--amber);
      color: var(--amber-bright);
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
      font-size: 1.3rem;
      font-family: var(--font-display);
      line-height: 1;
    }

    .fab-spacer { height: 72px; }

    /* Floating action button */
    .fab {
      position: fixed;
      right: max(1.25rem, env(safe-area-inset-right, 1.25rem));
      bottom: calc(1.5rem + env(safe-area-inset-bottom));
      width: 60px; height: 60px;
      border-radius: 50%;
      background: var(--amber);
      color: var(--bg);
      border: none;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      z-index: 50;
      transition: background 0.15s ease, transform 0.15s ease;
    }
    .fab:active { transform: scale(0.94); }
    .fab-icon {
      font-size: 2rem;
      line-height: 1;
      font-weight: 300;
      margin-top: -1px;
    }

    footer {
      text-align: center;
      padding: 0 0.5rem;
    }
    .small { font-size: 0.72rem; }
  `],
})
export class AppComponent {
  storage = inject(StorageService);

  modalOpen  = signal(false);
  historyOpen = signal(true);
  profileOpen = signal(false);

  stomachOptions: StomachState[] = ['empty', 'food', 'heavy'];

  setStomach(s: StomachState): void { this.storage.setStomachState(s); }
  stomachLabel(s: StomachState): string { return STOMACH_LABELS[s]; }
}
