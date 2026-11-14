import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter, map } from 'rxjs';
import { TYPE_COLOR, nextType } from './lifts';
import { SessionStore } from './session-store';
import { Theme } from './theme';
import { ActiveWorkout } from './active-workout';
import { ActiveBar } from './shared/active-bar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, ActiveBar],
  templateUrl: './app.html',
})
export class App {
  private readonly sw = inject(SwUpdate);
  private readonly store = inject(SessionStore);
  // Created here so the saved light/dark choice applies on every page.
  private readonly theme = inject(Theme);

  protected readonly sections = [
    { path: '/book', label: 'Log book' },
    { path: '/progress', label: 'Progress' },
    { path: '/profile', label: 'Profile' },
  ];
  protected readonly workout = inject(ActiveWorkout);

  protected readonly updateReady = toSignal(
    this.sw.versionUpdates.pipe(
      filter((e) => e.type === 'VERSION_READY'),
      map(() => true),
    ),
    { initialValue: false },
  );
  protected readonly dismissed = signal(false);

  private readonly path = toSignal(
    inject(Router).events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects.split(/[?#]/)[0]),
    ),
    { initialValue: '/' },
  );
  /** Home and Log have their own headers; the other sections share the top bar and Start button. */
  protected readonly inSection = computed(() => this.sections.some((s) => s.path === this.path()));
  protected readonly isActive = (path: string) => this.path() === path;

  /** The workout bar, everywhere but Log itself and Home (whose big card turns into Resume). */
  protected readonly showBar = computed(() => this.workout.active() && this.path() !== '/log' && this.path() !== '/');
  /** Bottom room so the last thing on a page isn't under the bar or the Start button. */
  protected readonly bottomPad = computed(() => {
    if (this.showBar()) return this.workout.collapsed() ? 'pb-[calc(6rem+env(safe-area-inset-bottom))]' : 'pb-[calc(11rem+env(safe-area-inset-bottom))]';
    return this.inSection() ? 'pb-[calc(7rem+env(safe-area-inset-bottom))]' : 'pb-[calc(2rem+env(safe-area-inset-bottom))]';
  });

  protected readonly next = computed(() => nextType(this.store.all()).type);
  protected readonly nextColor = computed(() => TYPE_COLOR[this.next()]);

  constructor() {
    // Ask the browser not to evict IndexedDB under storage pressure.
    navigator.storage?.persist?.();
  }

  protected reload() {
    document.location.reload();
  }
}
