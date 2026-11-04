import Dexie, { Table } from 'dexie';
import { SEED_SESSIONS } from './data/seed';

export type WorkoutType = 'Push' | 'Pull' | 'Legs' | 'Arms' | 'Upper';

/** One set: weight (lb, negative = assisted) × reps (halves allowed). */
export interface LiftSet {
  w: number;
  r: number;
  note?: string;
}

export interface Exercise {
  name: string;
  sets: LiftSet[];
}

export interface Session {
  id?: number;
  date: string; // YYYY-MM-DD
  type: WorkoutType;
  exercises: Exercise[];
}

export type SeedSession = Omit<Session, 'id'>;

class GymDb extends Dexie {
  sessions!: Table<Session, number>;

  constructor() {
    super('gym-log');
    this.version(1).stores({ sessions: '++id, date, type' });
    // v2: the seed grew to Nov 2. Add seed days this device doesn't have yet,
    // leaving any day already logged in the app untouched.
    this.version(2)
      .stores({ sessions: '++id, date, type' })
      .upgrade(async (tx) => {
        const table = tx.table<Session, number>('sessions');
        const have = new Set((await table.toArray()).map((s) => s.date));
        await table.bulkAdd(SEED_SESSIONS.filter((s) => !have.has(s.date)));
      });
    // Runs once, when the database is first created on this device.
    this.on('populate', (tx) => tx.table('sessions').bulkAdd(SEED_SESSIONS));
  }
}

export const db = new GymDb();
