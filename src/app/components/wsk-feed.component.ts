import {
  ChangeDetectionStrategy, Component, computed, inject, output, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WskSyncService } from '../services/wsk-sync.service';
import { FeedDrink, Reaction } from '../models/models';
import { DistortedAvatarComponent } from './distorted-avatar.component';

const QUICK_EMOJIS = ['🍻', '🔥', '😂', '💀', '👏', '🥂'];

function categoryFromAbv(abv: number): string {
  if (abv < 10) return 'Öl';
  if (abv < 25) return 'Vin';
  return 'Sprit';
}

function fmtNum(n: number, frac: number): string {
  return n.toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: frac });
}

function describeDrink(e: FeedDrink): string | null {
  if (e.volumeMl == null || e.abv == null) return null;
  const cat = categoryFromAbv(e.abv);
  return `${cat} ${fmtNum(e.abv, 1)}%, ${fmtNum(e.volumeMl / 10, 1)} cl`;
}

@Component({
  selector: 'app-wsk-feed',
  standalone: true,
  imports: [FormsModule, DistortedAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (feed().length === 0) {
      <p class="empty">Inga drycker loggade i WSK ännu.</p>
    } @else {
      <ul class="events">
        @for (e of feed(); track e.id) {
          <li class="event">
            <div class="event-head">
              <app-distorted-avatar
                [src]="avatarFor(e.participantName)"
                [name]="e.participantName"
                [promille]="promilleFor(e.participantName)"
                [size]="36" />
              <div class="event-head-text">
                <span class="who">{{ e.participantName }}</span>
                <span class="when mono">{{ formatTime(e.occurredAt) }}</span>
              </div>
            </div>
            @if (describe(e); as d) {
              <div class="event-drink mono">{{ d }}</div>
            }
            @if (e.label) {
              <div class="event-label">{{ e.label }}</div>
            }
            @if (e.photoUrl; as src) {
              <img class="event-photo" [src]="src" alt="" loading="lazy"
                   (click)="enlarge.set(enlarge() === e.id ? null : e.id)"
                   [class.enlarged]="enlarge() === e.id" />
            }

            @if (groupedEmojis(e.id).length > 0 || textsFor(e.id).length > 0) {
              <div class="reaction-summary">
                @for (g of groupedEmojis(e.id); track g.emoji) {
                  <span class="emoji-count">{{ g.emoji }} <span class="mono dim">{{ g.count }}</span></span>
                }
              </div>
              @for (t of textsFor(e.id); track t.id) {
                <div class="reply">
                  <app-distorted-avatar
                    [src]="avatarFor(t.authorName)"
                    [name]="t.authorName"
                    [promille]="promilleFor(t.authorName)"
                    [size]="22" />
                  <span class="reply-author">{{ t.authorName }}</span>
                  <span class="reply-text">{{ t.content }}</span>
                </div>
              }
            }

            <div class="reaction-bar">
              @for (em of quickEmojis; track em) {
                <button class="emoji-btn" type="button" (click)="onEmoji(e.id, em)">{{ em }}</button>
              }
              <button class="emoji-btn plus" type="button" (click)="toggleReply(e.id)">
                {{ replyOpen() === e.id ? '×' : '+' }}
              </button>
            </div>

            @if (replyOpen() === e.id) {
              <form class="reply-form" (ngSubmit)="onSendReply(e.id)">
                <input
                  type="text"
                  [(ngModel)]="replyText"
                  name="replyText"
                  placeholder="Skriv ett svar…"
                  maxlength="200"
                  autocomplete="off" />
                <button class="btn btn-primary" type="submit" [disabled]="!replyText.trim()">Skicka</button>
              </form>
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
      gap: 0.4rem;
    }
    .event-head {
      display: flex;
      align-items: center;
      gap: 0.55rem;
    }
    .event-head-text {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      flex: 1;
      min-width: 0;
    }
    .who {
      font-family: var(--font-display);
      font-style: italic;
      color: var(--amber);
      font-size: 1rem;
      line-height: 1.1;
    }
    .when { color: var(--text-dim); font-size: 0.78rem; }
    .event-drink {
      color: var(--text-muted);
      font-size: 0.82rem;
      letter-spacing: 0.02em;
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

    .reaction-summary {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      padding-top: 0.15rem;
    }
    .emoji-count {
      background: var(--bg-card);
      border: 1px solid var(--border);
      padding: 0.15rem 0.45rem;
      border-radius: 999px;
      font-size: 0.9rem;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }
    .emoji-count .dim { font-size: 0.7rem; }

    .reply {
      display: flex;
      gap: 0.4rem;
      align-items: baseline;
      font-size: 0.88rem;
    }
    .reply-author {
      font-family: var(--font-display);
      font-style: italic;
      color: var(--amber);
    }
    .reply-text { color: var(--text); }

    .reaction-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
      padding-top: 0.3rem;
      border-top: 1px dashed var(--border);
    }
    .emoji-btn {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 0.3rem 0.6rem;
      font-size: 1.05rem;
      min-height: 36px;
      min-width: 38px;
      transition: transform 0.12s ease, background 0.15s ease;
    }
    .emoji-btn:active { transform: scale(0.92); }
    .emoji-btn.plus {
      color: var(--text-muted);
      font-size: 1.1rem;
      font-weight: 300;
      margin-left: auto;
    }

    .reply-form {
      display: flex;
      gap: 0.4rem;
      align-items: stretch;
      margin-top: 0.25rem;
    }
    .reply-form input { flex: 1; min-height: 40px; }
    .reply-form .btn { white-space: nowrap; min-height: 40px; padding: 0.3rem 0.85rem; }
  `],
})
export class WskFeedComponent {
  private sync = inject(WskSyncService);
  needsName = output<void>();

  protected feed = computed(() => this.sync.feed());
  protected enlarge = signal<string | null>(null);
  protected replyOpen = signal<string | null>(null);
  protected replyText = '';
  protected readonly quickEmojis = QUICK_EMOJIS;

  protected avatarFor = (name: string): string | undefined => this.sync.avatarFor(name);
  protected promilleFor = (name: string): number => this.sync.promilleFor(name);
  protected describe = (e: FeedDrink): string | null => describeDrink(e);

  protected emojisFor(drinkId: string): Reaction[] {
    return this.sync.reactions().filter(r => r.drinkId === drinkId && r.kind === 'emoji');
  }

  protected textsFor(drinkId: string): Reaction[] {
    return this.sync.reactions().filter(r => r.drinkId === drinkId && r.kind === 'text');
  }

  protected groupedEmojis(drinkId: string): { emoji: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const r of this.emojisFor(drinkId)) {
      counts.set(r.content, (counts.get(r.content) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([emoji, count]) => ({ emoji, count }));
  }

  protected onEmoji(drinkId: string, emoji: string): void {
    if (!this.sync.postReaction(drinkId, 'emoji', emoji)) {
      this.needsName.emit();
    }
  }

  protected toggleReply(drinkId: string): void {
    this.replyOpen.update(cur => cur === drinkId ? null : drinkId);
    this.replyText = '';
  }

  protected onSendReply(drinkId: string): void {
    const text = this.replyText.trim();
    if (!text) return;
    if (!this.sync.postReaction(drinkId, 'text', text)) {
      this.needsName.emit();
      return;
    }
    this.replyText = '';
    this.replyOpen.set(null);
  }

  protected formatTime(ms: number): string {
    const d = new Date(ms);
    const now = new Date();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return time;
    return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  }
}
