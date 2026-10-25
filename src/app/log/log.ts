import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { Session, WorkoutType } from '../db';
import { TYPES, TYPE_COLOR, TYPE_INK, fmtDate, fmtSets, fmtWeight, lastTime, liftKey, nextType, suggestNames, todayIso, weekStats, weekStreak } from '../lifts';
import { SessionStore } from '../session-store';
import { CountUp } from '../shared/count-up';
import { Sparkline } from '../shared/sparkline';

interface DraftSet {
  w: number | null;
  r: number | null;
  note: string;
}
interface DraftExercise {
  name: string;
  sets: DraftSet[];
}
interface Draft {
  id?: number;
  date: string;
  type: WorkoutType | null; // null = use the suggested next type
  exercises: DraftExercise[];
}

const DRAFT_KEY = 'gym-log:draft';
const MODE_KEY = 'gym-log:mode';

type Mode = 'focus' | 'list';

@Component({
  selector: 'app-log',
  imports: [FormsModule, RouterLink, CountUp, Sparkline],
  templateUrl: './log.html',
})
export class Log {
  protected readonly store = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly editId = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((q) => (q.has('edit') ? Number(q.get('edit')) : null))),
  );

  protected readonly types = TYPES;
  protected readonly typeColor = TYPE_COLOR;
  protected readonly typeInk = TYPE_INK;
  protected readonly fmtDate = fmtDate;
  protected readonly fmtSets = fmtSets;
  protected readonly fmtWeight = fmtWeight;

  protected draft: Draft = loadDraft() ?? blankDraft();
  /** Bumped on every edit so computeds that read the draft re-run. */
  private readonly rev = signal(0);
  protected readonly saving = signal(false);
  protected readonly confirmDiscard = signal(false);

  /** Focus shows one lift at a time; list shows the whole session. Editing a past session always uses the list. */
  private readonly mode = signal<Mode>(loadMode());
  protected readonly focus = computed(() => (this.rev(), this.mode() === 'focus' && this.draft.id == null));
  /** Index of the lift shown in focus mode. */
  protected readonly cur = signal(0);
  protected readonly current = computed(() => (this.rev(), this.draft.exercises[this.cur()]));
  protected readonly editingName = signal(false);
  /** The set about to be logged in focus mode. */
  protected readonly pw = signal<number | null>(null);
  protected readonly pr = signal<number | null>(null);
  protected readonly pnote = signal('');
  private touchX = 0;

  protected readonly next = computed(() => nextType(this.store.all()));
  protected readonly type = computed(() => (this.rev(), this.draft.type ?? this.next().type));
  protected readonly names = computed(() => suggestNames(this.store.all(), this.type()));
  protected readonly peaks = computed(() => new Map(this.store.peaks().map((p) => [p.key, p])));
  protected readonly lastOfType = computed(() => {
    const type = this.type();
    return [...this.store.all()].reverse().find((s) => s.type === type && s.id !== this.draft.id);
  });
  protected readonly isToday = computed(() => (this.rev(), this.draft.date === todayIso()));
  protected readonly longDate = computed(() => {
    this.rev();
    const [y, m, d] = this.draft.date.split('-').map(Number);
    const sameYear = y === new Date().getFullYear();
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
    });
  });
  protected readonly weeks = computed(() => weekStats(this.store.all(), todayIso()));
  protected readonly streak = computed(() => weekStreak(this.weeks()));
  protected readonly sessionsPerWeek = computed(() => this.weeks().map((w) => w.sessions));
  protected readonly volumePerWeek = computed(() => this.weeks().map((w) => w.volume));
  protected readonly Math = Math;
  protected readonly thisWeek = computed(() => this.weeks().at(-1)!);
  /** Percent change in volume against last week; null when last week was empty. */
  protected readonly volumeChange = computed(() => {
    const w = this.weeks();
    const prev = w.at(-2)!.volume;
    return prev ? Math.round(((w.at(-1)!.volume - prev) / prev) * 100) : null;
  });
  protected readonly canSave = computed(() => (this.rev(), toSession(this.draft).exercises.length > 0));

  constructor() {
    effect(() => {
      const id = this.editId();
      if (id == null || this.store.sessions() == null || this.draft.id === id) return;
      const s = this.store.get(id);
      if (s) this.replace(fromSession(s));
    });
    // A restored draft needs its steppers filled once the history (for "last time") has loaded.
    let primed = false;
    effect(() => {
      if (primed || this.store.sessions() == null) return;
      primed = true;
      untracked(() => this.go(this.cur()));
    });
  }

  protected changed() {
    this.rev.update((n) => n + 1);
    this.confirmDiscard.set(false);
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(this.draft));
    } catch {}
  }

  protected setType(t: WorkoutType) {
    this.draft.type = t;
    this.changed();
  }

  protected addExercise() {
    if (this.focus()) return this.addLift();
    this.draft.exercises.push({ name: '', sets: [{ w: null, r: null, note: '' }] });
    this.changed();
  }

  protected removeExercise(i: number) {
    this.draft.exercises.splice(i, 1);
    this.changed();
  }

  protected addSet(ex: DraftExercise) {
    const prev = ex.sets.at(-1);
    ex.sets.push({ w: prev?.w ?? null, r: prev?.r ?? null, note: '' });
    this.changed();
  }

  protected removeSet(ex: DraftExercise, i: number) {
    ex.sets.splice(i, 1);
    this.changed();
  }

  /** Copies the last session of the chosen type as a starting point. */
  protected repeatLast() {
    const last = this.lastOfType();
    if (!last) return;
    this.draft.type = last.type;
    // Focus mode logs each set fresh, guided by last time; the list copies the weights in.
    this.draft.exercises = fromSession(last).exercises.map((e) => (this.focus() ? { ...e, sets: [] } : e));
    this.changed();
    this.go(0);
  }

  protected setMode(mode: Mode) {
    this.mode.set(mode);
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {}
    if (mode === 'focus') this.go(this.cur());
  }

  protected go(i: number) {
    const n = this.draft.exercises.length;
    this.cur.set(Math.max(0, Math.min(i, n - 1)));
    this.editingName.set(!this.current()?.name);
    this.prime();
  }

  /** Pre-fills the steppers: the matching set from last time, else a repeat of the previous set. */
  protected prime() {
    const ex = this.current();
    if (!ex) return;
    const plan = ex.name.trim() ? this.lastFor(ex.name)?.sets : undefined;
    const next = plan?.[ex.sets.length] ?? ex.sets.at(-1) ?? plan?.at(-1);
    this.pw.set(next?.w ?? null);
    this.pr.set(next?.r ?? null);
    this.pnote.set('');
  }

  protected bump(which: 'w' | 'r', by: number) {
    const sig = which === 'w' ? this.pw : this.pr;
    sig.set(Math.max(which === 'w' ? -999 : 0, (sig() ?? 0) + by));
  }

  protected logSet() {
    const ex = this.current();
    const w = this.pw();
    const r = this.pr();
    if (!ex || w == null || r == null || r <= 0) return;
    ex.sets.push({ w, r, note: this.pnote().trim() });
    this.changed();
    this.prime();
  }

  /** Takes a logged set back into the steppers to fix it. */
  protected unlog(i: number) {
    const ex = this.current();
    if (!ex) return;
    const [s] = ex.sets.splice(i, 1);
    this.changed();
    this.pw.set(s.w);
    this.pr.set(s.r);
    this.pnote.set(s.note);
  }

  protected addLift() {
    this.draft.exercises.push({ name: '', sets: [] });
    this.changed();
    this.go(this.draft.exercises.length - 1);
  }

  protected removeLift() {
    this.draft.exercises.splice(this.cur(), 1);
    this.changed();
    this.go(this.cur());
  }

  protected nameDone() {
    if (!this.current()?.name.trim()) return;
    this.editingName.set(false);
    this.prime();
  }

  protected touchStart(e: TouchEvent) {
    this.touchX = e.touches[0].clientX;
  }

  protected touchEnd(e: TouchEvent) {
    const dx = e.changedTouches[0].clientX - this.touchX;
    if (Math.abs(dx) > 70 && !(e.target as HTMLElement).closest('input')) this.go(this.cur() + (dx < 0 ? 1 : -1));
  }

  protected lastFor(name: string) {
    if (!name.trim()) return undefined;
    return lastTime(this.store.all(), name, this.draft.date, this.draft.id);
  }

  protected peakFor(name: string) {
    return name.trim() ? this.peaks().get(liftKey(name)) : undefined;
  }

  protected async save() {
    if (!this.canSave() || this.saving()) return;
    this.saving.set(true);
    try {
      const id = await this.store.save(toSession({ ...this.draft, type: this.type() }));
      this.replace(blankDraft());
      this.router.navigate(['/book'], { queryParams: { view: 'list', open: id, saved: 1 } });
    } finally {
      this.saving.set(false);
    }
  }

  protected discard() {
    if (!this.confirmDiscard() && this.draft.exercises.length) {
      this.confirmDiscard.set(true);
      return;
    }
    const wasEditing = this.draft.id != null;
    this.replace(blankDraft());
    if (wasEditing) this.router.navigate(['/log']);
  }

  private replace(d: Draft) {
    this.draft = d;
    this.cur.set(0);
    this.changed();
  }
}

function blankDraft(): Draft {
  return { date: todayIso(), type: null, exercises: [] };
}

function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'list' ? 'list' : 'focus';
  } catch {
    return 'focus';
  }
}

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function fromSession(s: Session): Draft {
  return {
    id: s.id,
    date: s.date,
    type: s.type,
    exercises: s.exercises.map((e) => ({ name: e.name, sets: e.sets.map((x) => ({ w: x.w, r: x.r, note: x.note ?? '' })) })),
  };
}

/** Drops blank rows; a set needs both weight and reps. */
function toSession(d: Draft): Session {
  const exercises = d.exercises
    .map((e) => ({
      name: e.name.trim().replace(/\s+/g, ' '),
      sets: e.sets
        .filter((s) => s.w != null && s.r != null && s.r > 0)
        .map((s) => (s.note.trim() ? { w: s.w!, r: s.r!, note: s.note.trim() } : { w: s.w!, r: s.r! })),
    }))
    .filter((e) => e.name && e.sets.length);
  return { ...(d.id != null ? { id: d.id } : {}), date: d.date, type: d.type ?? 'Push', exercises };
}
