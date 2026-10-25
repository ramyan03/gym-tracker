import { Directive, ElementRef, effect, inject, input } from '@angular/core';

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Ticks a number up from its previous value (0 at first) instead of swapping it. */
@Directive({ selector: '[appCountUp]' })
export class CountUp {
  readonly appCountUp = input.required<number>();
  private readonly el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private shown = 0;
  private frame = 0;

  constructor() {
    effect((onCleanup) => {
      const target = this.appCountUp();
      const from = this.shown;
      const render = (n: number) => {
        this.shown = n;
        this.el.textContent = Math.round(n).toLocaleString('en-US');
      };
      if (reduceMotion() || from === target) return render(target);
      const start = performance.now();
      const duration = 700;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        render(from + (target - from) * (1 - Math.pow(1 - t, 3)));
        if (t < 1) this.frame = requestAnimationFrame(tick);
      };
      this.frame = requestAnimationFrame(tick);
      onCleanup(() => cancelAnimationFrame(this.frame));
    });
  }
}
