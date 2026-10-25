import { Component, computed, input } from '@angular/core';

/** Tiny trend line that wipes in from the left. */
@Component({
  selector: 'app-sparkline',
  host: { class: 'block' },
  template: `
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" class="h-full w-full overflow-visible" style="animation: reveal 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both">
      <path [attr.d]="area()" [attr.fill]="color()" fill-opacity="0.12" />
      <path
        [attr.d]="line()"
        fill="none"
        [attr.stroke]="color()"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  `,
})
export class Sparkline {
  readonly values = input.required<number[]>();
  readonly color = input('#c8c8c8');

  private readonly pts = computed(() => {
    const v = this.values();
    const max = Math.max(...v, 1);
    const step = v.length > 1 ? 100 / (v.length - 1) : 0;
    return v.map((n, i) => ({ x: i * step, y: 30 - (n / max) * 28 }));
  });
  protected readonly line = computed(() => this.pts().map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(''));
  protected readonly area = computed(() => (this.pts().length ? `${this.line()}L100,32L0,32Z` : ''));
}
