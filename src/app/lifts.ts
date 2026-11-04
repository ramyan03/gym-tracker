import { LiftSet, Session, WorkoutType } from './db';

export const TYPES: WorkoutType[] = ['Push', 'Pull', 'Legs', 'Arms', 'Upper'];

export const TYPE_COLOR: Record<WorkoutType, string> = {
  Push: '#4FC3F7',
  Pull: '#A78BFA',
  Legs: '#34D399',
  Arms: '#FB923C',
  Upper: '#FB923C',
};

/** For text in a split's colour; resolves per theme (see styles.css). */
export const TYPE_INK: Record<WorkoutType, string> = {
  Push: 'var(--color-ink-push)',
  Pull: 'var(--color-ink-pull)',
  Legs: 'var(--color-ink-legs)',
  Arms: 'var(--color-ink-arms)',
  Upper: 'var(--color-ink-arms)',
};

/** Logged spellings → one canonical name. From the original gym log, plus plural variants. */
const ALIASES: Record<string, string> = {
  'leg curl': 'Leg Curls',
  'leg extension': 'Leg Extensions',
  'one leg ext': 'One Leg Extension',
  'tricep oh press': 'Tricep Overhead',
  'tricep extension': 'Tricep Overhead',
  'overhead press': 'Shoulder Press',
  'chest supp row': 'Chest Supported Row',
  'hammer curls': 'Hammer Curl',
  'bayesian curl': 'Bayesian Curls',
  'lat raises': 'Lateral Raise',
  'lateral raises': 'Lateral Raise',
  'face pull': 'Face Pulls',
  'barbell rows': 'Barbell Row',
  'one arm delt fly': 'Rear Delt Fly',
  'delt fly (one arm)': 'Rear Delt Fly',
  'pec dec': 'Pec Fly',
};

export function canonical(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  return ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

/** Case-insensitive identity of a lift, for grouping and lookups. */
export function liftKey(name: string): string {
  return canonical(name).toLowerCase();
}

/** Lifts with a muscle illustration in public/muscles, named by slugged liftKey. */
const MUSCLE_ART = new Set(
  ('back-extension barbell-row bayesian-curls bench-press bicep-curl cable-curl calf-raises-lp ' +
    'calf-raises-seated chest-supported-row face-pulls hammer-curl high-to-low-fly hip-adductor ' +
    'incline-db lat-pulldown lat-row lateral-raise leg-curls leg-extensions leg-press low-to-high-fly ' +
    'mid-fly one-leg-extension pec-fly preacher-curl pull-ups rdl rear-delt-fly reverse-cable-curl ' +
    'reverse-curl shoulder-press squats t-bar-row t-bar-wide-row tricep-overhead tricep-press-machine ' +
    'tricep-pushdown').split(' '),
);

/**
 * Size (px of the 360px art) of the white patch over the source's top-left logo.
 * null = no patch: no logo, or the moving art passes through it.
 */
const LOGO_PATCH: Record<string, [number, number] | null> = {
  'cable-curl': null,
  'calf-raises-lp': null,
  'bench-press': null,
  'chest-supported-row': null,
  'hip-adductor': [66, 32],
  'preacher-curl': [96, 34],
  't-bar-row': [118, 44],
};

export interface MuscleArt {
  src: string;
  patch: { w: string; h: string } | null;
}

export function muscleArt(name: string): MuscleArt | null {
  const slug = liftKey(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!MUSCLE_ART.has(slug)) return null;
  const size = slug in LOGO_PATCH ? LOGO_PATCH[slug] : [96, 40];
  const pct = (px: number) => `${((px / 360) * 100).toFixed(1)}%`;
  return { src: `muscles/${slug}.gif`, patch: size && { w: pct(size[0]), h: pct(size[1]) } };
}

/** Heaviest set, ties broken by reps. */
export function topSet(sets: LiftSet[]): LiftSet | undefined {
  let best: LiftSet | undefined;
  for (const s of sets) {
    if (!best || s.w > best.w || (s.w === best.w && s.r > best.r)) best = s;
  }
  return best;
}

/** Epley estimate; meaningless for bodyweight/assisted sets. */
export function est1rm(s: LiftSet): number | null {
  return s.w > 0 ? Math.round(s.w * (1 + s.r / 30)) : null;
}

export function fmtWeight(w: number): string {
  if (w === 0) return 'BW';
  return w < 0 ? `BW${w}` : String(w);
}

/** "3×10 @ 245" when every set matches, otherwise "100×10 · 130×10". */
export function fmtSets(sets: LiftSet[]): string {
  if (!sets.length) return '';
  const same = sets.every((s) => s.w === sets[0].w && s.r === sets[0].r);
  if (same && sets.length > 1) return `${sets.length}×${sets[0].r} @ ${fmtWeight(sets[0].w)}`;
  return sets.map((s) => `${fmtWeight(s.w)}×${s.r}`).join(' · ');
}

export interface LiftPoint {
  date: string;
  type: WorkoutType;
  top: LiftSet;
}

export interface Lift {
  name: string; // first spelling seen, after aliasing
  points: LiftPoint[];
}

/** Top set per session for each lift (keyed by liftKey), oldest first. */
export function liftHistory(sessions: Session[]): Map<string, Lift> {
  const map = new Map<string, Lift>();
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  for (const s of sorted) {
    for (const ex of s.exercises) {
      const top = topSet(ex.sets);
      if (!top) continue;
      const key = liftKey(ex.name);
      const lift = map.get(key) ?? { name: canonical(ex.name), points: [] };
      lift.points.push({ date: s.date, type: s.type, top });
      map.set(key, lift);
    }
  }
  return map;
}

export interface Peak {
  key: string;
  name: string;
  best: LiftSet;
  date: string;
  type: WorkoutType;
  sessions: number;
}

export function peaks(history: Map<string, Lift>): Peak[] {
  return [...history].map(([key, { name, points }]) => {
    let best = points[0];
    for (const p of points) {
      if (p.top.w > best.top.w || (p.top.w === best.top.w && p.top.r > best.top.r)) best = p;
    }
    return { key, name, best: best.top, date: best.date, type: mostCommonType(points), sessions: points.length };
  });
}

function mostCommonType(points: LiftPoint[]): WorkoutType {
  const counts = new Map<WorkoutType, number>();
  for (const p of points) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

const ROTATION: Partial<Record<WorkoutType, WorkoutType>> = { Push: 'Pull', Pull: 'Legs', Legs: 'Push' };

/** Next day in the Push → Pull → Legs rotation; Arms/Upper days don't move it. */
export function nextType(sessions: Session[]): { type: WorkoutType; after?: Session } {
  // Same-day sessions: the later-saved one (higher id) counts as more recent.
  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date) || (b.id ?? 0) - (a.id ?? 0));
  const last = sorted.find((s) => s.type in ROTATION);
  return last ? { type: ROTATION[last.type]!, after: last } : { type: 'Push' };
}

/** Most recent earlier appearance of an exercise, skipping the session being edited. */
export function lastTime(
  sessions: Session[],
  name: string,
  onOrBefore: string,
  excludeId?: number,
): { date: string; sets: LiftSet[] } | undefined {
  const key = liftKey(name);
  let found: { date: string; sets: LiftSet[] } | undefined;
  for (const s of sessions) {
    if (s.id === excludeId || s.date > onOrBefore || (found && s.date <= found.date)) continue;
    const ex = s.exercises.find((e) => liftKey(e.name) === key);
    if (ex) found = { date: s.date, sets: ex.sets };
  }
  return found;
}

/** Canonical names, names used on `type` days first, then by frequency. */
export function suggestNames(sessions: Session[], type?: WorkoutType): string[] {
  const score = new Map<string, { name: string; n: number }>();
  for (const s of sessions) {
    for (const ex of s.exercises) {
      const key = liftKey(ex.name);
      const entry = score.get(key) ?? { name: canonical(ex.name), n: 0 };
      entry.n += s.type === type ? 1000 : 1;
      score.set(key, entry);
    }
  }
  return [...score.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map((e) => e.name);
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "Fri Oct 24" from YYYY-MM-DD, without timezone drift. */
export function fmtDate(iso: string, withYear = false): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  }).replace(',', '');
}

function beats(a: LiftSet, b: LiftSet): boolean {
  return a.w > b.w || (a.w === b.w && a.r > b.r);
}

export interface SessionPr {
  name: string;
  top: LiftSet;
  prev: LiftSet;
}

/** Lifts whose top set beat every earlier session's. A first-ever lift isn't a PR. */
export function sessionPrs(sessions: Session[], session: Session): SessionPr[] {
  const prs: SessionPr[] = [];
  for (const ex of session.exercises) {
    const top = topSet(ex.sets);
    if (!top) continue;
    const key = liftKey(ex.name);
    let prev: LiftSet | undefined;
    for (const s of sessions) {
      if (s.id === session.id || s.date >= session.date) continue;
      for (const e of s.exercises) {
        if (liftKey(e.name) !== key) continue;
        const t = topSet(e.sets);
        if (t && (!prev || beats(t, prev))) prev = t;
      }
    }
    if (prev && beats(top, prev)) prs.push({ name: canonical(ex.name), top, prev });
  }
  return prs;
}

export interface WeekStat {
  start: string; // Monday, YYYY-MM-DD
  sessions: number;
  volume: number; // Σ weight × reps over loaded sets
}

/** The last `count` Monday-start weeks up to `today`, oldest first. */
export function weekStats(sessions: Session[], today: string, count = 8): WeekStat[] {
  const monday = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date;
  };
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const end = monday(today);
  const weeks: WeekStat[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    weeks.push({ start: iso(d), sessions: 0, volume: 0 });
  }
  const index = new Map(weeks.map((w, i) => [w.start, i]));
  for (const s of sessions) {
    const i = index.get(iso(monday(s.date)));
    if (i == null || s.date > today) continue;
    weeks[i].sessions++;
    for (const ex of s.exercises) for (const set of ex.sets) if (set.w > 0) weeks[i].volume += set.w * set.r;
  }
  return weeks;
}

/** Consecutive weeks with a session. The current week only counts once it has one. */
export function weekStreak(weeks: WeekStat[]): number {
  let i = weeks.length - 1;
  if (weeks[i]?.sessions === 0) i--;
  let n = 0;
  while (i >= 0 && weeks[i].sessions > 0) {
    n++;
    i--;
  }
  return n;
}
