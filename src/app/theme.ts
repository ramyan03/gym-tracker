import { Injectable, computed, effect, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

const KEY = 'gym-log:theme';
const query = matchMedia('(prefers-color-scheme: light)');

/** Light/dark preference. 'system' follows the phone; the choice is kept per device. */
@Injectable({ providedIn: 'root' })
export class Theme {
  readonly mode = signal<ThemeMode>(load());
  private readonly systemLight = signal(query.matches);
  /** What's actually showing; read by anything that paints with JS (the chart). */
  readonly resolved = computed(() => {
    const mode = this.mode();
    return mode === 'light' || (mode === 'system' && this.systemLight()) ? 'light' : 'dark';
  });

  constructor() {
    query.addEventListener('change', (e) => this.systemLight.set(e.matches));
    effect(() => {
      const mode = this.mode();
      const light = this.resolved() === 'light';
      const root = document.documentElement;
      if (mode === 'system') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', mode);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f4f4f2' : '#111111');
      try {
        localStorage.setItem(KEY, mode);
      } catch {}
    });
  }

  cycle() {
    const order: ThemeMode[] = ['system', 'light', 'dark'];
    this.mode.set(order[(order.indexOf(this.mode()) + 1) % order.length]);
  }
}

function load(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}
