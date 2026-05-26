import {
  ChangeDetectionStrategy, Component, computed, inject, signal,
} from '@angular/core';
import { WskSyncService } from '../services/wsk-sync.service';

@Component({
  selector: 'app-wsk-feed',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (feed().length === 0) {
      <p class="empty">Inga drycker loggade i WSK ännu.</p>
    } @else {
      <ul class="events">
        @for (e of feed(); track e.id) {
          <li class="event">
            <div class="event-head">
              <span class="who">{{ e.participantName }}</span>
              <span class="when mono">{{ formatTime(e.occurredAt) }}</span>
            </div>
            @if (e.label) {
              <div class="event-label">{{ e.label }}</div>
            }
            @if (e.photoUrl; as src) {
              <img class="event-photo" [src]="src" alt="" loading="lazy"
                   (click)="enlarge.set(enlarge() === e.id ? null : e.id)"
                   [class.enlarged]="enlarge() === e.id" />
            }
          </li>
        }
      </ul>
    }
  `,
  styles: [`
    .empty {
      padding: 1rem 0.25rem;
      color: var(--text-muted);
      font-style: italic;
      font-family: var(--font-display);
      text-align: center;
    }
    .events {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .event {
      padding: 0.65rem 0.75rem;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
    }
    .event-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .who {
      font-family: var(--font-display);
      font-style: italic;
      color: var(--amber);
      font-size: 1rem;
    }
    .when {
      color: var(--text-dim);
      font-size: 0.78rem;
    }
    .event-label {
      color: var(--text-muted);
      font-style: italic;
      font-family: var(--font-display);
      font-size: 0.95rem;
    }
    .event-photo {
      width: 100%;
      max-height: 240px;
      object-fit: cover;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      cursor: pointer;
      transition: transform 0.2s ease;
    }
    .event-photo.enlarged {
      position: fixed;
      inset: 0;
      width: 100vw; height: 100vh;
      object-fit: contain;
      background: rgba(0,0,0,0.92);
      z-index: 200;
      border-radius: 0;
      border: none;
      padding: env(safe-area-inset-top, 1rem) 1rem env(safe-area-inset-bottom, 1rem);
      max-height: 100vh;
    }
  `],
})
export class WskFeedComponent {
  private sync = inject(WskSyncService);
  protected feed = computed(() => this.sync.feed());
  protected enlarge = signal<string | null>(null);

  protected formatTime(ms: number): string {
    const d = new Date(ms);
    const now = new Date();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return time;
    return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  }
}
