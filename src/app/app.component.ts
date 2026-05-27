import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { StorageService } from './services/storage.service';
import { BacStatusComponent } from './components/bac-status.component';
import { BacChartComponent } from './components/bac-chart.component';
import { AddDrinkModalComponent } from './components/add-drink-modal.component';
import { DrinkHistoryComponent } from './components/drink-history.component';
import { ProfileEditorComponent } from './components/profile-editor.component';
import { WskClaimModalComponent } from './components/wsk-claim-modal.component';
import { WskTabComponent } from './components/wsk-tab.component';
import { InstallBannerComponent } from './components/install-banner.component';
import { SessionSummaryModalComponent } from './components/session-summary-modal.component';
import { WskSyncService } from './services/wsk-sync.service';
import { SharingMode, STOMACH_LABELS, StomachState } from './models/models';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    BacStatusComponent,
    BacChartComponent,
    AddDrinkModalComponent,
    DrinkHistoryComponent,
    ProfileEditorComponent,
    WskClaimModalComponent,
    WskTabComponent,
    InstallBannerComponent,
    SessionSummaryModalComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <header>
        <h1 class="title">
          Suparkompisen
          @if (social && storage.sharingMode() === 'festar') { <span class="title-flair">🎉</span> }
        </h1>
        <p class="subtitle">din personliga drinklogg</p>
      </header>

      @if (social) {
        <app-install-banner />
        <nav class="tabs" role="tablist" aria-label="Vyer">
          <button
            class="tab"
            role="tab"
            [class.active]="activeTab() === 'solo'"
            [attr.aria-selected]="activeTab() === 'solo'"
            (click)="setTab('solo')">Solo</button>
          <button
            class="tab"
            role="tab"
            [class.active]="activeTab() === 'wsk'"
            [attr.aria-selected]="activeTab() === 'wsk'"
            (click)="setTab('wsk')">WSK</button>
        </nav>
      }

      @if (!social || activeTab() === 'solo') {

        @if (social && storage.profile()) {
          <div class="mode-toggle" role="tablist" aria-label="Delningsläge">
            @for (m of modeOptions; track m) {
              <button
                class="mode-pill"
                role="tab"
                [class.active]="storage.sharingMode() === m"
                [attr.aria-selected]="storage.sharingMode() === m"
                (click)="setMode(m)">
                {{ modeLabel(m) }}
              </button>
            }
          </div>
        }

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
          <p class="dim small">Watson · absorption av första ordningen · 0,15‰/tim eliminering</p>
        </footer>
      }

      @if (social) {
        @defer (when activeTab() === 'wsk'; prefetch on idle) {
          <app-wsk-tab (claimRequested)="openClaim()" />
        } @placeholder {
          @if (activeTab() === 'wsk') {
            <p class="wsk-loading">Laddar WSK…</p>
          }
        } @error {
          @if (activeTab() === 'wsk') {
            <p class="wsk-loading">Kunde inte ladda WSK.</p>
          }
        }
      }

      @if (social) {
        <app-wsk-claim-modal
          [open]="claimOpen()"
          (saved)="onClaimSaved()"
          (cancelled)="onClaimCancelled()" />
        <app-session-summary-modal
          [summary]="wskSync.lastSession()"
          (close)="wskSync.clearLastSession()" />
      }
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
    .title-flair {
      display: inline-block;
      margin-left: 0.35em;
      animation: flair-bob 1.8s ease-in-out infinite;
    }
    @keyframes flair-bob {
      0%, 100% { transform: translateY(0) rotate(-6deg); }
      50%      { transform: translateY(-3px) rotate(6deg); }
    }
    .subtitle {
      font-family: var(--font-display);
      font-style: italic;
      color: var(--text-muted);
      font-size: 0.92rem;
    }

    /* Solo / WSK tabs */
    .tabs {
      display: flex;
      border-bottom: 1px solid var(--border);
      margin: 0 -0.25rem 0.25rem;
    }
    .tab {
      flex: 1;
      padding: 0.75rem 0.25rem 0.65rem;
      background: transparent;
      color: var(--text-muted);
      font-family: var(--font-display);
      font-style: italic;
      font-size: 1.15rem;
      letter-spacing: 0.02em;
      position: relative;
      transition: color 0.18s ease;
      min-height: 44px;
    }
    .tab.active { color: var(--amber); }
    .tab.active::after {
      content: '';
      position: absolute;
      left: 22%; right: 22%;
      bottom: -1px;
      height: 2px;
      background: var(--amber);
      border-radius: 2px;
    }

    .wsk-loading {
      padding: 1.25rem 1rem;
      text-align: center;
      color: var(--text-muted);
      font-style: italic;
      font-family: var(--font-display);
    }

    /* Smygsuper / Festar toggle */
    .mode-toggle {
      display: flex;
      gap: 0;
      background: var(--bg-elevated);
      border: 1px solid var(--border-strong);
      border-radius: 999px;
      padding: 4px;
      margin: 0 auto;
      width: 100%;
    }
    .mode-pill {
      flex: 1;
      padding: 0.55rem 0.75rem;
      border-radius: 999px;
      background: transparent;
      color: var(--text-muted);
      font-size: 0.92rem;
      font-weight: 500;
      letter-spacing: 0.02em;
      transition: background 0.18s ease, color 0.18s ease;
      min-height: 40px;
    }
    .mode-pill.active {
      background: var(--amber);
      color: var(--bg);
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
  /**
   * Eagerly instantiated so its sharingMode effect (curve upload,
   * sharingStartedAt anchor, wipe on toggle-off) runs even when the
   * user is on the Solo tab and the lazy WSK chunk hasn't loaded yet.
   * In the offline build this is the stub-backed no-op service.
   */
  protected wskSync = inject(WskSyncService);

  modalOpen  = signal(false);
  historyOpen = signal(true);
  profileOpen = signal(false);
  claimOpen   = signal(false);

  readonly social = environment.social;
  activeTab = signal<'solo' | 'wsk'>('solo');
  stomachOptions: StomachState[] = ['empty', 'food', 'heavy'];
  modeOptions: SharingMode[] = ['smygsuper', 'festar'];

  constructor() {
    if (environment.social) {
      effect(() => {
        const m = this.storage.sharingMode();
        const cls = document.documentElement.classList;
        cls.toggle('mode-festar', m === 'festar');
        cls.toggle('mode-smygsuper', m === 'smygsuper');
      });
    }
  }

  setStomach(s: StomachState): void { this.storage.setStomachState(s); }
  stomachLabel(s: StomachState): string { return STOMACH_LABELS[s]; }

  setMode(m: SharingMode): void {
    if (m === 'festar' && !this.storage.wskIdentity()) {
      this.claimOpen.set(true);
      return;
    }
    this.storage.setSharingMode(m);
  }
  modeLabel(m: SharingMode): string { return m === 'smygsuper' ? 'Smygsuper' : 'Festar'; }

  setTab(t: 'solo' | 'wsk'): void { this.activeTab.set(t); }

  onClaimSaved(): void {
    this.claimOpen.set(false);
    this.storage.setSharingMode('festar');
  }
  onClaimCancelled(): void { this.claimOpen.set(false); }
  openClaim(): void { this.claimOpen.set(true); }
}
