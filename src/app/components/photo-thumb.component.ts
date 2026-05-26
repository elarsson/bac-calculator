import {
  ChangeDetectionStrategy, Component, effect, inject, input, signal,
} from '@angular/core';
import { PhotoStoreService } from '../services/photo-store.service';

@Component({
  selector: 'app-photo-thumb',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src(); as s) {
      <img [src]="s" alt="" (click)="enlarged.set(!enlarged())" [class.enlarged]="enlarged()" />
    }
  `,
  styles: [`
    :host {
      display: inline-block;
      flex-shrink: 0;
    }
    img {
      width: var(--thumb-size, 44px);
      height: var(--thumb-size, 44px);
      object-fit: cover;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      cursor: pointer;
      transition: transform 0.2s ease;
      display: block;
    }
    img.enlarged {
      position: fixed;
      inset: 0;
      width: 100vw; height: 100vh;
      object-fit: contain;
      background: rgba(0,0,0,0.92);
      z-index: 200;
      border-radius: 0;
      border: none;
      padding: env(safe-area-inset-top, 1rem) 1rem env(safe-area-inset-bottom, 1rem);
    }
  `],
})
export class PhotoThumbComponent {
  photoId = input.required<string>();

  private store = inject(PhotoStoreService);
  protected src = signal<string | undefined>(undefined);
  protected enlarged = signal(false);

  constructor() {
    effect(async () => {
      const id = this.photoId();
      this.src.set(undefined);
      if (!id) return;
      try {
        const data = await this.store.get(id);
        if (this.photoId() === id) {
          this.src.set(data);
        }
      } catch {
        // ignore missing photo
      }
    });
  }
}
