import {
  ChangeDetectionStrategy, Component, signal,
} from '@angular/core';

const K_DISMISSED = 'bac.installBannerDismissed';

function isIosBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS 13+ identifies as Mac; check touch as a tiebreaker.
  const ua = navigator.userAgent ?? '';
  const iosByUa = /iPad|iPhone|iPod/.test(ua);
  const iPadOs = ua.includes('Mac') && 'ontouchend' in document;
  return iosByUa || iPadOs;
}

function isAlreadyInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const standaloneIos = (window.navigator as { standalone?: boolean }).standalone === true;
  const standaloneMq = window.matchMedia?.('(display-mode: standalone)')?.matches === true;
  return standaloneIos || standaloneMq;
}

/**
 * Compact one-time banner that walks iOS Safari users through adding
 * Suparkompisen to their home screen. PWA install is a prerequisite
 * for web push on iOS, so this lands before notifications themselves
 * to warm up the flow. Dismiss persists across reloads.
 *
 * Only renders when: the device looks like iOS, the app is not
 * already running standalone, and the user hasn't dismissed it.
 */
@Component({
  selector: 'app-install-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="install-banner" role="dialog" aria-label="Installera Suparkompisen">
        <div class="install-text">
          <strong class="install-title">Installera Suparkompisen</strong>
          <span class="install-body">
            Tryck på dela-knappen
            <span class="ios-share-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                <path d="M8 1.5l3 3-.7.7L8.5 3.4V10h-1V3.4L5.7 5.2l-.7-.7 3-3zM3 7v7h10V7h1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7h1z"/>
              </svg>
            </span>
            i Safari och välj <em>Lägg till på hemskärmen</em>.
          </span>
        </div>
        <button class="install-close" type="button" (click)="dismiss()" aria-label="Stäng">×</button>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }
    .install-banner {
      display: flex;
      align-items: flex-start;
      gap: 0.6rem;
      padding: 0.65rem 0.85rem;
      background: var(--bg-elevated);
      border: 1px solid var(--amber-dim);
      border-radius: var(--radius-lg);
      margin: 0.25rem 0 0.25rem;
    }
    .install-text {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      min-width: 0;
    }
    .install-title {
      color: var(--amber);
      font-family: var(--font-display);
      font-style: italic;
      font-size: 0.98rem;
      font-weight: 500;
      letter-spacing: 0.02em;
    }
    .install-body {
      font-size: 0.82rem;
      line-height: 1.4;
      color: var(--text-muted);
    }
    .install-body em {
      color: var(--text);
      font-style: italic;
      font-family: var(--font-display);
    }
    .ios-share-icon {
      display: inline-flex;
      vertical-align: -2px;
      color: var(--amber-bright);
      margin: 0 0.15em;
    }
    .install-close {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: transparent;
      color: var(--text-muted);
      border: 1px solid var(--border);
      font-size: 0.95rem;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
  `],
})
export class InstallBannerComponent {
  protected visible = signal(this.shouldShow());

  protected dismiss(): void {
    try { localStorage.setItem(K_DISMISSED, '1'); } catch { /* swallow */ }
    this.visible.set(false);
  }

  private shouldShow(): boolean {
    if (typeof window === 'undefined') return false;
    let dismissed = false;
    try { dismissed = localStorage.getItem(K_DISMISSED) === '1'; } catch { /* swallow */ }
    if (dismissed) return false;
    if (isAlreadyInstalled()) return false;
    return isIosBrowser();
  }
}
