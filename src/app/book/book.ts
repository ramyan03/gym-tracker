import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { Session } from '../db';
import { TYPE_COLOR, fmtDate, fmtWeight, pad, sessionPrs, todayIso } from '../lifts';
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
  imports: [SessionDetail, TypeBadge],
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

  /** PRs in the session that was just logged, for the celebration card. */
  protected readonly celebration = computed(() => {
    const id = this.openParam();
    const s = id != null && this.justSaved() ? this.store.get(id) : undefined;
    if (!s || this.celebrationDismissed()) return null;
    const prs = sessionPrs(this.store.all(), s);
    return prs.length ? { session: s, prs } : null;
  });

  protected readonly fmtDate = fmtDate;
  protected readonly fmtWeight = fmtWeight;
  protected readonly typeColor = TYPE_COLOR;
  protected readonly open = signal<number | null>(null);
  protected readonly confirmDelete = signal<number | null>(null);
  protected readonly pendingImport = signal<{ name: string; text: string; count: number } | null>(null);
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
    const blob = new Blob([this.store.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gym-log-${todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.message.set(`Exported ${this.store.all().length} sessions`);
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
      this.pendingImport.set({ name: file.name, text, count: sessions.length });
      this.message.set('');
    } catch {
      this.message.set(`${file.name} isn't a gym-log export`);
    }
  }

  protected async confirmImport() {
    const pending = this.pendingImport();
    if (!pending) return;
    try {
      const n = await this.store.importJson(pending.text);
      this.message.set(`Imported ${n} sessions`);
    } catch (e) {
      this.message.set(`Import failed: ${(e as Error).message}`);
    }
    this.pendingImport.set(null);
  }
}
