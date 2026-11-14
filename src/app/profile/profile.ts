import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Session, WorkoutType } from '../db';
import { TYPES, TYPE_COLOR, TYPE_INK, allNotes, fmtDate, fmtWeight, pad, todayIso, weekStats, weekStreak } from '../lifts';
import { SessionStore } from '../session-store';
import { TypeBadge } from '../shared/type-badge';

const NAME_KEY = 'gym-log:name';
/** Sessions shown in the score chart. */
const SCORE_BARS = 24;
const VOLUME_WEEKS = 12;
const CAL_WEEKS = 20;

interface ScoreBar {
  session: Session;
  points: number;
}

/** You: totals, strength score over time, weekly volume, a training calendar and every note. */
@Component({
  selector: 'app-profile',
  imports: [TypeBadge],
  templateUrl: './profile.html',
})
export class Profile {
  protected readonly store = inject(SessionStore);
  private readonly router = inject(Router);
  protected readonly typeColor = TYPE_COLOR;
  protected readonly typeInk = TYPE_INK;
  protected readonly fmtDate = fmtDate;
  protected readonly fmtWeight = fmtWeight;

  protected readonly Math = Math;
  protected readonly name = readName();

  protected readonly first = computed(() => this.store.all()[0]);
  protected readonly streak = computed(() => weekStreak(weekStats(this.store.all(), todayIso(), 104)));
  protected readonly prCount = computed(() => {
    let n = 0;
    for (const s of this.store.scores().values()) n += s.lifts.filter((l) => l.pr).length;
    return n;
  });

  // ---- Strength score ----
  protected readonly scoreBars = computed<ScoreBar[]>(() => {
    const scores = this.store.scores();
    const bars: ScoreBar[] = [];
    for (const s of this.store.all()) {
      const points = scores.get(s.id!)?.points;
      if (points != null) bars.push({ session: s, points });
    }
    return bars.slice(-SCORE_BARS);
  });
  protected readonly avgScore = computed(() => {
    const recent = this.scoreBars().slice(-10);
    return recent.length ? Math.round(recent.reduce((n, b) => n + b.points, 0) / recent.length) : null;
  });
  /** Distance from 100 that fills half the chart: at least ±10 so small wobbles stay small. */
  protected readonly scoreRange = computed(() => Math.max(10, ...this.scoreBars().map((b) => Math.abs(b.points - 100))));
  protected readonly scoreTypes = computed(() => TYPES.filter((t) => this.scoreBars().some((b) => b.session.type === t)));
  protected readonly pickedScore = signal<number | null>(null);
  protected readonly scorePick = computed(() => {
    const bars = this.scoreBars();
    const i = this.pickedScore();
    return i != null && bars[i] ? bars[i] : bars.at(-1);
  });

  /** Height (% of half the plot) of a bar's distance from 100. */
  protected barSize(points: number): number {
    return Math.max(3, (Math.abs(points - 100) / this.scoreRange()) * 100);
  }

  // ---- Weekly volume ----
  protected readonly weeks = computed(() => weekStats(this.store.all(), todayIso(), VOLUME_WEEKS));
  protected readonly maxVolume = computed(() => Math.max(1, ...this.weeks().map((w) => w.volume)));
  protected readonly pickedWeek = signal<number | null>(null);
  protected readonly weekPick = computed(() => this.weeks()[this.pickedWeek() ?? this.weeks().length - 1]);

  protected k(v: number): string {
    return v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k` : String(v);
  }

  protected weekLabel(start: string): string {
    return fmtDate(start).split(' ').slice(1).join(' ');
  }

  // ---- Calendar: the last CAL_WEEKS weeks, Monday rows down, weeks across ----
  protected readonly calendar = computed(() => {
    const byDate = this.store.byDate();
    const today = todayIso();
    const [y, m, d] = today.split('-').map(Number);
    const now = new Date(y, m - 1, d);
    const monday = new Date(y, m - 1, d - ((now.getDay() + 6) % 7) - 7 * (CAL_WEEKS - 1));
    const cols: { label: string; days: { iso: string; future: boolean; session?: Session }[] }[] = [];
    let lastMonth = -1;
    for (let w = 0; w < CAL_WEEKS; w++) {
      const days = [];
      let label = '';
      for (let i = 0; i < 7; i++) {
        const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + w * 7 + i);
        const iso = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
        if (i === 0 && date.getMonth() !== lastMonth) {
          // Label a column when a new month starts in it (by its Monday).
          if (lastMonth !== -1 || date.getDate() <= 7) label = date.toLocaleDateString('en-US', { month: 'short' });
          lastMonth = date.getMonth();
        }
        days.push({ iso, future: iso > today, session: byDate.get(iso)?.[0] });
      }
      cols.push({ label, days });
    }
    return cols;
  });
  protected readonly calCount = computed(() =>
    this.calendar().reduce((n, c) => n + c.days.filter((d) => d.session).length, 0),
  );
  protected readonly calTypes = computed(() => {
    const seen = new Set<WorkoutType>();
    for (const c of this.calendar()) for (const d of c.days) if (d.session) seen.add(d.session.type);
    return TYPES.filter((t) => seen.has(t));
  });

  // ---- Notes ----
  protected readonly notes = computed(() => allNotes(this.store.all()));
  protected readonly allNotesShown = signal(false);
  protected readonly shownNotes = computed(() => (this.allNotesShown() ? this.notes() : this.notes().slice(0, 12)));

  protected openSession(id?: number) {
    if (id != null) this.router.navigate(['/book'], { queryParams: { view: 'list', open: id } });
  }
}

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || 'Ramyan';
  } catch {
    return 'Ramyan';
  }
}
