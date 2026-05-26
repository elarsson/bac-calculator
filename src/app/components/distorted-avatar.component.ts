import {
  ChangeDetectionStrategy, Component, computed, input,
} from '@angular/core';

interface DistortStyle {
  filter: string;
  transform: string;
  opacity: number;
}

/**
 * Returns CSS filter/transform/opacity values driven by current promille.
 *
 * Stages (non-linear): sober → buzz → drunk → wrecked → absurd.
 * Each effect ramps over its own range so the gag escalates smoothly.
 */
function distortStyle(promille: number): DistortStyle {
  const p = Math.max(0, promille);

  // blur kicks in mid-buzz
  const blur = Math.min(4.5, Math.max(0, (p - 4) * 0.5));
  // hue shift starts subtle from 0,3 ‰
  const hue = Math.min(70, Math.max(0, (p - 3) * 9));
  // saturation boost
  const sat = Math.min(2.6, 1 + Math.max(0, (p - 3) * 0.18));
  // contrast climbs slightly
  const contrast = Math.min(1.4, 1 + Math.max(0, (p - 8) * 0.04));
  // brightness lifts then fades
  const brightness = Math.min(1.15, 1 + Math.max(0, (p - 4) * 0.018));
  // tilt past 0,5 ‰
  const tilt = Math.min(18, Math.max(0, (p - 5) * 1.6));
  // tiny scale wobble past 1 ‰
  const scale = Math.min(1.06, 1 + Math.max(0, (p - 10) * 0.006));
  // faint fade in extreme territory
  const opacity = Math.max(0.55, 1 - Math.max(0, (p - 22) * 0.02));

  return {
    filter:
      `blur(${blur.toFixed(2)}px) ` +
      `hue-rotate(${hue.toFixed(0)}deg) ` +
      `saturate(${sat.toFixed(2)}) ` +
      `brightness(${brightness.toFixed(2)}) ` +
      `contrast(${contrast.toFixed(2)})`,
    transform: `rotate(${tilt.toFixed(1)}deg) scale(${scale.toFixed(3)})`,
    opacity,
  };
}

@Component({
  selector: 'app-distorted-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="frame" [style.--size]="sizePx() + 'px'">
      @if (src(); as s) {
        <img
          [src]="s"
          alt=""
          [style.filter]="style().filter"
          [style.transform]="style().transform"
          [style.opacity]="style().opacity" />
        @if (showGhost()) {
          <img
            class="ghost"
            [src]="s"
            alt=""
            [style.filter]="style().filter"
            [style.transform]="ghostTransform()"
            [style.opacity]="ghostOpacity()" />
        }
      } @else {
        <span class="initial">{{ initial() }}</span>
      }
    </div>
  `,
  styles: [`
    :host { display: inline-block; flex-shrink: 0; }
    .frame {
      position: relative;
      width: var(--size, 32px);
      height: var(--size, 32px);
      border-radius: 50%;
      overflow: hidden;
      background: var(--bg-card);
      border: 1px solid var(--border);
    }
    img {
      position: absolute;
      inset: 0;
      width: 100%; height: 100%;
      object-fit: cover;
      display: block;
      transition: filter 0.6s ease, transform 0.6s ease, opacity 0.6s ease;
      transform-origin: 50% 50%;
    }
    .ghost { mix-blend-mode: screen; }
    .initial {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%; height: 100%;
      font-size: calc(var(--size, 32px) * 0.5);
      color: var(--text-muted);
      font-family: var(--font-display);
      font-style: italic;
    }
  `],
})
export class DistortedAvatarComponent {
  src = input<string | undefined>(undefined);
  name = input<string>('');
  promille = input<number>(0);
  /** Visual pixel size; CSS sets both width and height. */
  size = input<number>(32);

  protected sizePx = computed(() => this.size());
  protected initial = computed(() => (this.name().charAt(0) || '?').toUpperCase());
  protected style = computed(() => distortStyle(this.promille()));

  /** "Double vision" ghost duplicate appears above ~1,5 ‰. */
  protected showGhost = computed(() => this.promille() > 15);
  protected ghostTransform = computed(() => {
    const base = this.style().transform;
    const offset = Math.min(8, (this.promille() - 15) * 0.6);
    return `${base} translate(${offset.toFixed(1)}px, ${(offset * 0.4).toFixed(1)}px)`;
  });
  protected ghostOpacity = computed(() => {
    const base = this.style().opacity;
    return Math.min(0.55, Math.max(0, (this.promille() - 15) * 0.05)) * base;
  });
}
