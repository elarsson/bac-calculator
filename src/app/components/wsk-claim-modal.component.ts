import {
  ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { StorageService } from '../services/storage.service';
import { SupabaseService } from '../services/supabase.service';
import { resizeSquareJpeg } from '../services/image.util';
import { WskIdentity } from '../models/models';

const AVATAR_SIZE = 256;
const MAX_NAME_LEN = 24;

@Component({
  selector: 'app-wsk-claim-modal',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop" [class.visible]="open()" (click)="cancel()"></div>

    <div class="sheet" [class.visible]="open()">
      <div class="handle"></div>

      <div class="sheet-header">
        <h2 class="sheet-title">{{ existing() ? 'Ändra Mig' : 'Gå med i WSK' }}</h2>
        <button class="close-btn" type="button" (click)="cancel()">✕</button>
      </div>

      <p class="intro">
        Välj ett namn och en bild. Bilden förvrängs senare beroende på din promillehalt.
      </p>

      <form [formGroup]="form" (ngSubmit)="save()" class="form">
        <div class="field">
          <label for="wsk-name">Namn</label>
          <input
            id="wsk-name"
            type="text"
            formControlName="name"
            [attr.maxlength]="MAX_NAME_LEN"
            autocomplete="off"
            placeholder="t.ex. Erik" />
          @if (errorMsg(); as e) {
            <span class="err">{{ e }}</span>
          }
        </div>

        <div class="avatar-row">
          <div class="avatar-preview" [class.empty]="!avatarDataUrl()">
            @if (avatarDataUrl(); as src) {
              <img [src]="src" alt="Selfie" />
            } @else {
              <span class="mono dim">ingen bild</span>
            }
          </div>
          <div class="avatar-actions">
            <button class="btn btn-secondary" type="button" (click)="fileInput.click()">
              {{ avatarDataUrl() ? 'Ny bild' : 'Ta selfie' }}
            </button>
            @if (avatarDataUrl()) {
              <button class="btn btn-ghost" type="button" (click)="clearAvatar()">Ta bort</button>
            }
            <input
              #fileInput
              type="file"
              accept="image/*"
              capture="user"
              hidden
              (change)="onFile($event)" />
          </div>
        </div>

        <button class="btn btn-primary save-btn" type="submit" [disabled]="form.invalid || processing()">
          {{ processing() ? 'Sparar…' : 'Spara' }}
        </button>
      </form>
    </div>
  `,
  styles: [`
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      z-index: 100;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
    }
    .backdrop.visible { opacity: 1; pointer-events: auto; }

    .sheet {
      position: fixed;
      left: 0; right: 0; bottom: 0;
      z-index: 101;
      background: var(--bg-elevated);
      border-top: 1px solid var(--border-strong);
      border-radius: 20px 20px 0 0;
      max-height: 92dvh;
      overflow-y: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
      padding: 0 1rem calc(1.5rem + env(safe-area-inset-bottom));
      transform: translateY(100%);
      transition: transform 0.32s cubic-bezier(0.32, 0.72, 0, 1);
    }
    .sheet.visible { transform: translateY(0); }

    .handle {
      width: 36px; height: 4px;
      background: var(--border-strong);
      border-radius: 2px;
      margin: 12px auto 0;
    }
    .sheet-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 0 0.4rem;
    }
    .sheet-title {
      font-family: var(--font-display);
      font-style: italic;
      font-size: 1.4rem;
      color: var(--amber);
      font-weight: 400;
    }
    .close-btn {
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 50%;
      background: var(--bg-card);
      color: var(--text-muted);
      font-size: 0.85rem;
      border: 1px solid var(--border);
    }

    .intro {
      font-size: 0.88rem;
      color: var(--text-muted);
      font-style: italic;
      font-family: var(--font-display);
      margin: 0 0 1rem;
    }

    .form { display: flex; flex-direction: column; gap: 1rem; }
    .field { display: flex; flex-direction: column; }
    .err {
      color: var(--red);
      font-size: 0.78rem;
      margin-top: 0.35rem;
      font-family: var(--font-mono);
    }

    .avatar-row {
      display: flex;
      gap: 0.85rem;
      align-items: center;
    }
    .avatar-preview {
      width: 92px; height: 92px;
      border-radius: 50%;
      overflow: hidden;
      background: var(--bg);
      border: 1.5px dashed var(--border-strong);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .avatar-preview.empty {
      font-size: 0.7rem;
      letter-spacing: 0.05em;
    }
    .avatar-preview img {
      width: 100%; height: 100%;
      object-fit: cover;
      display: block;
    }
    .avatar-actions {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      flex: 1;
    }

    .save-btn {
      width: 100%;
      min-height: 52px;
      font-size: 1rem;
      border-radius: var(--radius-lg);
      margin-top: 0.5rem;
    }
  `],
})
export class WskClaimModalComponent {
  open = input.required<boolean>();
  saved = output<WskIdentity>();
  cancelled = output<void>();

  protected storage = inject(StorageService);
  private fb = inject(FormBuilder);
  private supabase = inject(SupabaseService);

  protected readonly MAX_NAME_LEN = MAX_NAME_LEN;
  protected existing = signal<WskIdentity | null>(null);
  protected avatarDataUrl = signal<string | undefined>(undefined);
  protected processing = signal(false);
  protected errorMsg = signal<string | null>(null);

  protected form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(MAX_NAME_LEN)]],
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => this.prefillFromIdentity());
      }
    });
  }

  private prefillFromIdentity(): void {
    const id = this.storage.wskIdentity();
    this.existing.set(id);
    this.errorMsg.set(null);
    this.form.patchValue({ name: id?.name ?? '' });
    this.avatarDataUrl.set(id?.avatarDataUrl);
  }

  protected async onFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.processing.set(true);
    try {
      const dataUrl = await resizeSquareJpeg(file, AVATAR_SIZE);
      this.avatarDataUrl.set(dataUrl);
    } catch {
      this.errorMsg.set('Kunde inte läsa bilden.');
    } finally {
      this.processing.set(false);
    }
  }

  protected clearAvatar(): void {
    this.avatarDataUrl.set(undefined);
  }

  protected cancel(): void {
    this.cancelled.emit();
  }

  protected async save(): Promise<void> {
    const name = (this.form.getRawValue().name ?? '').trim();
    if (!name) {
      this.errorMsg.set('Skriv ett namn.');
      return;
    }
    this.processing.set(true);
    this.errorMsg.set(null);
    try {
      if (this.supabase.configured) {
        const result = await this.supabase.claimName(name, this.storage.deviceId);
        if (!result.ok) {
          if (result.reason === 'duplicate') {
            this.errorMsg.set('Namnet är upptaget. Välj ett annat.');
          } else if (result.reason === 'offline') {
            this.errorMsg.set('Kan inte nå servern just nu.');
          } else {
            this.errorMsg.set('Något gick fel. Försök igen.');
          }
          return;
        }
      }
      const identity: WskIdentity = {
        name,
        avatarDataUrl: this.avatarDataUrl(),
      };
      this.storage.setWskIdentity(identity);
      this.saved.emit(identity);
    } finally {
      this.processing.set(false);
    }
  }
}
