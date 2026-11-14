import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActiveWorkout } from '../active-workout';
import { TYPE_COLOR, TYPE_INK } from '../lifts';

/** The workout in progress, pinned to the bottom of every page but Log. Collapses to a slim strip. */
@Component({
  selector: 'app-active-bar',
  imports: [RouterLink],
  template: `
    @let s = workout.summary();
    <div class="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div class="pointer-events-auto mx-auto max-w-xl overflow-hidden rounded-[22px] bg-card shadow-[0_10px_30px_rgba(0,0,0,0.45)] ring-1 ring-line">
        @if (workout.collapsed()) {
          <div class="flex items-center">
            <a routerLink="/log" class="press flex min-w-0 flex-1 items-center gap-2.5 py-3 pr-2 pl-4">
              <span class="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full" [style.background]="color()"></span>
              <span class="display shrink-0 text-[17px]" [style.color]="ink()">{{ workout.type() }}</span>
              <span class="num truncate text-[13px] text-dim">{{ s.lifts }} lift{{ s.lifts === 1 ? '' : 's' }} · {{ s.sets }} set{{ s.sets === 1 ? '' : 's' }}{{ elapsed() ? ' · ' + elapsed() : '' }}</span>
            </a>
            <button class="press flex h-11 w-11 shrink-0 items-center justify-center text-dim" aria-label="Expand workout bar" (click)="workout.setCollapsed(false)">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 15l6-6 6 6" /></svg>
            </button>
          </div>
        } @else {
          <div class="h-1" [style.background]="color()"></div>
          <div class="p-3.5 pt-3">
            <div class="flex items-center justify-between gap-2">
              <span class="flex min-w-0 items-center gap-2">
                <span class="h-2 w-2 shrink-0 animate-pulse rounded-full" [style.background]="color()"></span>
                <span class="label truncate">{{ workout.type() }} in progress{{ elapsed() ? ' · ' + elapsed() : '' }}</span>
              </span>
              <button class="press -my-1 -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-dim" aria-label="Collapse workout bar" (click)="workout.setCollapsed(true)">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 9l6 6 6-6" /></svg>
              </button>
            </div>
            <div class="mt-1 flex items-end justify-between gap-3">
              <span class="min-w-0">
                <span class="display block truncate text-[26px] text-bright">{{ s.current }}</span>
                <span class="block truncate text-[13px] text-dim">
                  {{ s.setsOnCurrent ? s.setsOnCurrent + ' set' + (s.setsOnCurrent === 1 ? '' : 's') + ' done' : 'No sets yet' }} · {{ s.sets }} total
                </span>
              </span>
              <a routerLink="/log" class="press display shrink-0 rounded-2xl px-5 py-3 text-[18px] text-black" [style.background]="color()">Resume</a>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class ActiveBar {
  protected readonly workout = inject(ActiveWorkout);
  protected readonly color = computed(() => TYPE_COLOR[this.workout.type()]);
  protected readonly ink = computed(() => TYPE_INK[this.workout.type()]);

  private readonly now = signal(Date.now());
  /** "42 min" or "1 h 05"; empty for an old draft with no start time. */
  protected readonly elapsed = computed(() => {
    this.workout.rev();
    const started = this.workout.draft.started;
    if (!started) return '';
    const min = Math.max(0, Math.floor((this.now() - started) / 60_000));
    // A workout left open overnight: the clock stops meaning anything.
    if (min >= 6 * 60) return '';
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
