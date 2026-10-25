import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Peak, TYPE_COLOR, TYPE_INK, fmtDate, fmtWeight, nextType, pad, todayIso, weekStats, weekStreak } from '../lifts';
import { SessionStore } from '../session-store';
import { Theme } from '../theme';

const NAME_KEY = 'gym-log:name';

@Component({
  selector: 'app-home',
  imports: [FormsModule, RouterLink],
  templateUrl: './home.html',
})
export class Home {
  protected readonly store = inject(SessionStore);
  protected readonly theme = inject(Theme);
  protected readonly typeColor = TYPE_COLOR;
  protected readonly typeInk = TYPE_INK;
  protected readonly fmtDate = fmtDate;
  protected readonly fmtWeight = fmtWeight;

  protected readonly name = signal(readName());
  protected readonly editingName = signal(false);

  protected readonly greeting = (() => {
    const h = new Date().getHours();
    return h < 5 ? 'Late one' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();
  protected readonly today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  protected readonly next = computed(() => nextType(this.store.all()));
  protected readonly last = computed(() => this.store.all().at(-1));
  protected readonly trainedToday = computed(() => this.last()?.date === todayIso());
  protected readonly weeks = computed(() => weekStats(this.store.all(), todayIso()));
  protected readonly streak = computed(() => weekStreak(this.weeks()));
  protected readonly thisWeek = computed(() => this.weeks().at(-1)!.sessions);
  /** "96k" style, so it fits the narrow stat column. */
  protected readonly volumeK = computed(() => {
    const v = this.weeks().at(-1)!.volume;
    return v >= 1000 ? `${Math.round(v / 1000)}k` : String(v);
  });
  /** Monday to Sunday of this week, coloured by the first session each day. */
  protected readonly weekDays = computed(() => {
    const today = todayIso();
    const byDate = this.store.byDate();
    const monday = this.weeks().at(-1)!.start;
    const [y, m, d] = monday.split('-').map(Number);
    return 'MTWTFSS'.split('').map((letter, i) => {
      const date = new Date(y, m - 1, d + i);
      const iso = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      const first = byDate.get(iso)?.[0];
      return { iso, letter, day: date.getDate(), color: first ? TYPE_COLOR[first.type] : null, isToday: iso === today };
    });
  });
  protected readonly latestPr = computed(() =>
    this.store.peaks().reduce<Peak | undefined>((a, p) => (!a || p.date > a.date ? p : a), undefined),
  );
  /** This month's days with a session, coloured by type, for the calendar card. */
  protected readonly monthDots = computed(() => {
    const month = todayIso().slice(0, 7);
    return this.store.all().filter((s) => s.date.startsWith(month)).map((s) => TYPE_COLOR[s.type]);
  });

  protected saveName(value: string) {
    const v = value.trim() || 'there';
    this.name.set(v);
    this.editingName.set(false);
    try {
      localStorage.setItem(NAME_KEY, v);
    } catch {}
  }
}

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || 'Ramyan';
  } catch {
    return 'Ramyan';
  }
}
