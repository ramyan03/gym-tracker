import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { map } from 'rxjs';
import { Session } from '../db';
import { LiftScore, TYPE_COLOR, fmtDate, fmtWeight, pad, sessionPrs, todayIso } from '../lifts';
import { SessionStore } from '../session-store';
import { SessionDetail } from '../shared/session-detail';
import { TypeBadge } from '../shared/type-badge';

interface Cell {
  day: number;
  iso: string;
  sessions: Session[];
}

/** History and Calendar in one place: a month view by default, or the full list. */
@Component({
  selector: 'app-book',
  imports: [SessionDetail, TypeBadge, NgTemplateOutlet],
  templateUrl: './book.html',
})
export class Book {
  protected readonly store = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly query = inject(ActivatedRoute).queryParamMap;
  private readonly openParam = toSignal(this.query.pipe(map((q) => Number(q.get('open')) || null)));
  private readonly justSaved = toSignal(this.query.pipe(map((q) => q.has('saved'))));
  protected readonly view = toSignal(this.query.pipe(map((q) => (q.get('view') === 'list' ? 'list' : 'calendar'))), {
    initialValue: 'calendar' as const,
  });

  protected readonly today = todayIso();
  protected readonly weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  /** First of the shown month, YYYY-MM. */
  protected readonly month = signal(this.today.slice(0, 7));
  private readonly picked = signal<string | null>(null);

  protected readonly monthLabel = computed(() => {
    const [y, m] = this.month().split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', ...(y === new Date().getFullYear() ? {} : { year: 'numeric' }) });
  });

  protected readonly cells = computed(() => {
    const [y, m] = this.month().split('-').map(Number);
    const byDate = this.store.byDate();
    const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday-first
    const cells: (Cell | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) {
      const iso = `${this.month()}-${pad(d)}`;
      cells.push({ day: d, iso, sessions: byDate.get(iso) ?? [] });
    }
    return cells;
  });

  protected readonly monthCount = computed(() => this.cells().reduce((n, c) => n + (c?.sessions.length ?? 0), 0));

  /** The tapped day, else the month's most recent session day. */
  protected readonly selectedDay = computed(() => {
    const picked = this.picked();
    if (picked?.startsWith(this.month())) return picked;
    return this.cells().filter((c) => c?.sessions.length).at(-1)?.iso ?? null;
  });
  protected readonly daySessions = computed(() => {
    const iso = this.selectedDay();
    return iso ? (this.store.byDate().get(iso) ?? []) : [];
  });
  protected readonly celebrationDismissed = signal(false);

  /** The strength score and PRs of the session that was just logged, for the card after Finish. */
  protected readonly celebration = computed(() => {
    const id = this.openParam();
    const s = id != null && this.justSaved() ? this.store.get(id) : undefined;
    if (!s || this.celebrationDismissed()) return null;
    const prs = new Map(sessionPrs(this.store.all(), s).map((p) => [p.name, p]));
    const score = this.store.scores().get(s.id!);
    return { session: s, prs, points: score?.points ?? null, lifts: score?.lifts ?? [] };
  });

  protected scoreOf(s: Session): number | null {
    return this.store.scores().get(s.id!)?.points ?? null;
  }

  /** "+2.6% on Thu Nov 6", plus a note when a long gap made it count for less. */
  protected describe(l: LiftScore): string {
    if (l.points == null) return 'First time · sets the baseline';
    const pct = l.change * 100;
    const change = Math.abs(pct) < 0.05 ? 'Matched' : `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}% on`;
    const gap = l.gapDays! > 21 ? ` · ${l.gapDays} days back, counts less` : '';
    return `${change} ${fmtDate(l.prevDate!)}${gap}`;
  }

  protected sets(sets: { w: number; r: number }[]): string {
    return sets.map((x) => `${fmtWeight(x.w)}×${x.r}`).join(' · ');
  }

  /** Export picks: tap sessions in the list, then export just those. */
  protected readonly selecting = signal(false);
  protected readonly chosen = signal<ReadonlySet<number>>(new Set());

  protected startExport() {
    this.chosen.set(new Set());
    this.selecting.set(true);
    this.message.set('');
  }

  protected choose(id: number) {
    this.chosen.update((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected monthChosen(sessions: Session[]): boolean {
    const c = this.chosen();
    return sessions.every((s) => c.has(s.id!));
  }

  protected chooseMonth(sessions: Session[]) {
    const all = this.monthChosen(sessions);
    this.chosen.update((cur) => {
      const next = new Set(cur);
      for (const s of sessions) all ? next.delete(s.id!) : next.add(s.id!);
      return next;
    });
  }

  protected chooseAll() {
    const all = this.chosen().size === this.store.all().length;
    this.chosen.set(all ? new Set() : new Set(this.store.all().map((s) => s.id!)));
  }

  protected rowTap(id: number) {
    if (this.selecting()) this.choose(id);
    else this.toggle(id);
  }

  protected readonly fmtDate = fmtDate;
  protected readonly fmtWeight = fmtWeight;
  protected readonly typeColor = TYPE_COLOR;
  protected readonly open = signal<number | null>(null);
  protected readonly confirmDelete = signal<number | null>(null);
  protected readonly pendingImport = signal<{ name: string; text: string; count: number; fresh: number } | null>(null);
  protected readonly message = signal('');

  /** Newest first, grouped by month. */
  protected readonly months = computed(() => {
    const groups: { key: string; label: string; sessions: Session[] }[] = [];
    for (const s of [...this.store.all()].reverse()) {
      const key = s.date.slice(0, 7);
      if (groups.at(-1)?.key !== key) {
        const [y, m] = key.split('-').map(Number);
        const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        groups.push({ key, label, sessions: [] });
      }
      groups.at(-1)!.sessions.push(s);
    }
    return groups;
  });

  constructor() {
    effect(() => {
      const id = this.openParam();
      if (id == null || !this.store.get(id)) return;
      this.open.set(id);
      setTimeout(() => document.getElementById(`s-${id}`)?.scrollIntoView({ block: 'center' }));
    });
  }

  protected setView(view: 'calendar' | 'list') {
    this.router.navigate([], { queryParams: { view: view === 'list' ? 'list' : null }, replaceUrl: true });
  }

  protected shiftMonth(by: number) {
    const [y, m] = this.month().split('-').map(Number);
    const d = new Date(y, m - 1 + by, 1);
    this.month.set(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }

  protected color(c: Cell): string | null {
    return c.sessions.length ? TYPE_COLOR[c.sessions[0].type] : null;
  }

  protected pick(c: Cell) {
    if (c.sessions.length) this.picked.set(c.iso);
  }

  protected toggle(id: number) {
    this.open.update((cur) => (cur === id ? null : id));
    this.confirmDelete.set(null);
  }

  protected setCount(s: Session) {
    return s.exercises.reduce((n, e) => n + e.sets.length, 0);
  }

  protected preview(s: Session) {
    return s.exercises.map((e) => e.name).join(', ');
  }

  protected dayNum(iso: string) {
    return Number(iso.slice(8));
  }

  protected weekday(iso: string) {
    return fmtDate(iso).split(' ')[0];
  }

  protected edit(id: number) {
    this.router.navigate(['/log'], { queryParams: { edit: id } });
  }

  protected async remove(id: number) {
    if (this.confirmDelete() !== id) {
      this.confirmDelete.set(id);
      return;
    }
    await this.store.delete(id);
    this.open.set(null);
    this.confirmDelete.set(null);
  }

  protected exportData() {
    const ids = this.chosen();
    if (!ids.size) return;
    const picked = this.store.all().filter((s) => ids.has(s.id!));
    const span = picked.length === 1 ? picked[0].date : `${picked[0].date}-to-${picked.at(-1)!.date}`;
    const blob = new Blob([this.store.exportJson(ids)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gym-log-${span}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.message.set(`Exported ${ids.size} session${ids.size === 1 ? '' : 's'}`);
    this.selecting.set(false);
  }

  protected async pickImport(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      const sessions = Array.isArray(parsed) ? parsed : parsed?.sessions;
      if (!Array.isArray(sessions)) throw new Error();
      const have = new Set(this.store.all().map((s) => `${s.date}|${s.type}`));
      const fresh = sessions.filter((s: any) => !have.has(`${s?.date}|${s?.type}`)).length;
      this.pendingImport.set({ name: file.name, text, count: sessions.length, fresh });
      this.message.set('');
    } catch {
      this.message.set(`${file.name} isn't a gym-log export`);
    }
  }

  protected async confirmImport(mode: 'merge' | 'replace') {
    const pending = this.pendingImport();
    if (!pending) return;
    try {
      const n = await this.store.importJson(pending.text, mode);
      this.message.set(mode === 'merge' ? `Added ${n} session${n === 1 ? '' : 's'}` : `Replaced with ${n} sessions`);
    } catch (e) {
      this.message.set(`Import failed: ${(e as Error).message}`);
    }
    this.pendingImport.set(null);
  }
}
