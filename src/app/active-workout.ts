import { Injectable, computed, inject, signal } from '@angular/core';
import { WorkoutType } from './db';
import { nextType, todayIso } from './lifts';
import { SessionStore } from './session-store';

export interface DraftSet {
  w: number | null;
  r: number | null;
  note: string;
}
export interface DraftExercise {
  name: string;
  sets: DraftSet[];
}
export interface Draft {
  id?: number;
  date: string;
  type: WorkoutType | null; // null = use the suggested next type
  exercises: DraftExercise[];
  /** ms timestamp of the first lift added, for the elapsed time in the bar. */
  started?: number;
  /** Lift shown in focus mode, so Resume lands on it. */
  at?: number;
}

const DRAFT_KEY = 'gym-log:draft';
const COLLAPSED_KEY = 'gym-log:bar-collapsed';

/**
 * The workout being logged. Lives outside the Log page so it survives browsing
 * the rest of the app, and so the bottom bar can show it.
 */
@Injectable({ providedIn: 'root' })
export class ActiveWorkout {
  private readonly store = inject(SessionStore);

  draft: Draft = loadDraft() ?? blankDraft();
  /** Bumped on every edit so computeds that read the draft re-run. */
  readonly rev = signal(0);
  readonly collapsed = signal(read(COLLAPSED_KEY) === '1');

  /** A new workout with at least one lift in it. */
  readonly active = computed(() => (this.rev(), this.draft.id == null && this.draft.exercises.length > 0));
  readonly type = computed(() => (this.rev(), this.draft.type ?? nextType(this.store.all()).type));
  readonly summary = computed(() => {
    this.rev();
    const d = this.draft;
    const at = Math.min(d.at ?? 0, d.exercises.length - 1);
    return {
      lifts: d.exercises.length,
      sets: d.exercises.reduce((n, e) => n + e.sets.length, 0),
      current: d.exercises[at]?.name.trim() || 'New lift',
      setsOnCurrent: d.exercises[at]?.sets.length ?? 0,
    };
  });

  /** Saves after any change to `draft`. */
  save() {
    if (this.draft.exercises.length && !this.draft.started) this.draft.started = Date.now();
    if (!this.draft.exercises.length) delete this.draft.started;
    this.rev.update((n) => n + 1);
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(this.draft));
    } catch {}
  }

  replace(d: Draft) {
    this.draft = d;
    this.save();
  }

  clear() {
    this.replace(blankDraft());
  }

  /**
   * Until a set is logged the date follows today, so a workout opened (or a
   * copy of last time left waiting) on an earlier day doesn't keep that date.
   */
  freshen() {
    const d = this.draft;
    if (d.id != null || d.date === todayIso() || d.exercises.some((e) => e.sets.length)) return;
    d.date = todayIso();
    this.save();
  }

  setCollapsed(v: boolean) {
    this.collapsed.set(v);
    try {
      localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0');
    } catch {}
  }
}

export function blankDraft(): Draft {
  return { date: todayIso(), type: null, exercises: [] };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function loadDraft(): Draft | null {
  try {
    const raw = read(DRAFT_KEY);
    const d: Draft | null = raw ? JSON.parse(raw) : null;
    // Older versions also stored edits of past sessions here; those aren't a workout in progress.
    if (!d || d.id != null) return null;
    if (!d.exercises.some((e) => e.sets.length)) d.date = todayIso();
    return d;
  } catch {
    return null;
  }
}
