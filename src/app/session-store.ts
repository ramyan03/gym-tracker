import { Injectable, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { liveQuery } from 'dexie';
import { from } from 'rxjs';
import { Session, db } from './db';
import { TYPES, liftHistory, peaks } from './lifts';

const TYPES_SET = new Set<string>(TYPES);

@Injectable({ providedIn: 'root' })
export class SessionStore {
  /** All sessions, oldest first; null until IndexedDB answers. */
  readonly sessions = toSignal(from(liveQuery(() => db.sessions.orderBy('date').toArray())), {
    initialValue: null,
  });

  readonly all = computed(() => this.sessions() ?? []);
  readonly history = computed(() => liftHistory(this.all()));
  readonly peaks = computed(() => peaks(this.history()));

  readonly byDate = computed(() => {
    const map = new Map<string, Session[]>();
    for (const s of this.all()) map.set(s.date, [...(map.get(s.date) ?? []), s]);
    return map;
  });

  get(id: number): Session | undefined {
    return this.all().find((s) => s.id === id);
  }

  save(session: Session): Promise<number> {
    return db.sessions.put(session);
  }

  delete(id: number): Promise<void> {
    return db.sessions.delete(id);
  }

  exportJson(): string {
    const sessions = this.all().map(({ id, ...rest }) => rest);
    return JSON.stringify({ app: 'gym-log', version: 1, exported: new Date().toISOString(), sessions }, null, 1);
  }

  /** Replaces every session with the file's contents. Throws on anything malformed. */
  async importJson(text: string): Promise<number> {
    const parsed = JSON.parse(text);
    const sessions: unknown = Array.isArray(parsed) ? parsed : parsed?.sessions;
    if (!Array.isArray(sessions) || !sessions.every(isSession)) throw new Error('Not a gym-log export');
    const clean = sessions.map(({ date, type, exercises }) => ({ date, type, exercises }));
    await db.transaction('rw', db.sessions, async () => {
      await db.sessions.clear();
      await db.sessions.bulkAdd(clean);
    });
    return clean.length;
  }
}

function isSession(s: any): s is Session {
  return (
    typeof s?.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(s.date) &&
    TYPES_SET.has(s.type) &&
    Array.isArray(s.exercises) &&
    s.exercises.every(
      (e: any) =>
        typeof e?.name === 'string' &&
        Array.isArray(e.sets) &&
        e.sets.every((x: any) => typeof x?.w === 'number' && typeof x?.r === 'number'),
    )
  );
}
