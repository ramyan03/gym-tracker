import { Component, computed, inject, input } from '@angular/core';
import { Session } from '../db';
import { TYPE_COLOR, fmtWeight, liftKey, topSet } from '../lifts';
import { SessionStore } from '../session-store';

@Component({
  selector: 'app-session-detail',
  template: `
    <div class="divide-y divide-line rounded-2xl bg-raised/60">
      @for (ex of rows(); track $index) {
        <div class="px-4 py-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="text-[15px] font-medium text-bright">{{ ex.name }}</span>
            @if (ex.isPeak) {
              <span class="display rounded-md px-1.5 pt-[3px] pb-[2px] text-[13px] tracking-wide text-black" [style.background]="color()">PR</span>
            }
          </div>
          <div class="flex flex-wrap gap-1.5">
            @for (s of ex.sets; track $index) {
              <span class="num rounded-lg bg-card px-2 py-1 text-[13px]" [class.text-bright]="s === ex.top" [class.text-dim]="s !== ex.top">
                {{ fmtWeight(s.w) }}<span class="text-faint">×</span>{{ s.r }}
                @if (s.note) {
                  <span class="font-sans text-xs text-dim"> · {{ s.note }}</span>
                }
              </span>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class SessionDetail {
  private readonly store = inject(SessionStore);
  readonly session = input.required<Session>();

  protected readonly fmtWeight = fmtWeight;
  protected readonly color = computed(() => TYPE_COLOR[this.session().type]);

  protected readonly rows = computed(() => {
    const s = this.session();
    const peaks = new Map(this.store.peaks().map((p) => [p.key, p]));
    return s.exercises.map((ex) => {
      const top = topSet(ex.sets);
      const peak = peaks.get(liftKey(ex.name));
      const isPeak = !!top && !!peak && peak.date === s.date && peak.best.w === top.w && peak.best.r === top.r;
      return { ...ex, top, isPeak };
    });
  });
}
