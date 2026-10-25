import { SEED_SESSIONS } from './data/seed';
import { Session } from './db';
import { canonical, est1rm, fmtSets, lastTime, liftHistory, nextType, peaks, sessionPrs, suggestNames, topSet, weekStats, weekStreak } from './lifts';

const s = (id: number, date: string, type: Session['type'], ex: [string, [number, number][]][]): Session => ({
  id,
  date,
  type,
  exercises: ex.map(([name, sets]) => ({ name, sets: sets.map(([w, r]) => ({ w, r })) })),
});

describe('lifts', () => {
  it('maps logged spellings to one name', () => {
    expect(canonical('Leg Curl')).toBe('Leg Curls');
    expect(canonical('  pec   dec ')).toBe('Pec Fly');
    expect(canonical('Bench Press')).toBe('Bench Press');
  });

  it('picks the heaviest set, then most reps', () => {
    expect(topSet([{ w: 180, r: 5 }, { w: 180, r: 6 }, { w: 165, r: 10 }])).toEqual({ w: 180, r: 6 });
    expect(topSet([])).toBeUndefined();
  });

  it('skips 1RM for bodyweight and assisted sets', () => {
    expect(est1rm({ w: 300, r: 10 })).toBe(400);
    expect(est1rm({ w: 0, r: 5 })).toBeNull();
    expect(est1rm({ w: -25, r: 6 })).toBeNull();
  });

  it('formats sets compactly', () => {
    expect(fmtSets([{ w: 245, r: 10 }, { w: 245, r: 10 }, { w: 245, r: 10 }])).toBe('3×10 @ 245');
    expect(fmtSets([{ w: 0, r: 1.5 }, { w: -25, r: 6 }])).toBe('BW×1.5 · BW-25×6');
  });

  it('finds peaks across sessions and aliases', () => {
    const history = liftHistory([
      s(1, '2026-05-01', 'Legs', [['Leg Curl', [[170, 10], [190, 7]]]]),
      s(2, '2026-05-08', 'Legs', [['Leg Curls', [[190, 8]]]]),
      s(3, '2026-05-15', 'Legs', [['Leg Curls', [[180, 10]]]]),
    ]);
    expect(liftHistory([s(1, '2026-05-01', 'Push', [['bench press', [[95, 8]]], ['Bench Press', [[135, 5]]]])]).size).toBe(1);
    const [p] = peaks(history);
    expect(p).toMatchObject({ key: 'leg curls', name: 'Leg Curls', best: { w: 190, r: 8 }, date: '2026-05-08', sessions: 3 });
  });

  it('rotates Push → Pull → Legs, ignoring arm days', () => {
    expect(nextType([]).type).toBe('Push');
    expect(nextType([s(1, '2026-05-01', 'Push', [])]).type).toBe('Pull');
    expect(nextType([s(1, '2026-05-01', 'Pull', []), s(2, '2026-05-02', 'Arms', [])]).type).toBe('Legs');
    expect(nextType([s(1, '2026-05-02', 'Legs', []), s(2, '2026-05-01', 'Pull', [])]).type).toBe('Push');
    expect(nextType([s(2, '2026-05-03', 'Pull', []), s(1, '2026-05-03', 'Push', [])]).type).toBe('Legs');
  });

  it('finds last time, skipping the session being edited', () => {
    const all = [
      s(1, '2026-05-01', 'Push', [['Pec Dec', [[130, 10]]]]),
      s(2, '2026-05-08', 'Push', [['Pec Fly', [[140, 8]]]]),
      s(3, '2026-05-15', 'Push', [['Pec Fly', [[150, 8]]]]),
    ];
    expect(lastTime(all, 'pec fly', '2026-05-20')?.date).toBe('2026-05-15');
    expect(lastTime(all, 'Pec Fly', '2026-05-20', 3)?.date).toBe('2026-05-08');
    expect(lastTime(all, 'Pec Fly', '2026-05-05')?.date).toBe('2026-05-01');
  });

  it('suggests names from the chosen day type first', () => {
    const all = [
      s(1, '2026-05-01', 'Push', [['Incline DB', [[60, 10]]]]),
      s(2, '2026-05-02', 'Legs', [['Leg Press', [[300, 8]]]]),
      s(3, '2026-05-03', 'Push', [['Incline DB', [[60, 10]]]]),
    ];
    expect(suggestNames(all, 'Legs')).toEqual(['Leg Press', 'Incline DB']);
  });

  it('seed data is well-formed', () => {
    expect(SEED_SESSIONS.length).toBe(63);
    for (const session of SEED_SESSIONS) {
      expect(session.date).toMatch(/^2026-\d{2}-\d{2}$/);
      for (const ex of session.exercises) expect(ex.sets.length).toBeGreaterThan(0);
    }
  });

  it('finds PRs against earlier sessions only', () => {
    const a = s(1, '2026-10-01', 'Push', [['Bench Press', [[180, 5]]], ['Pec Dec', [[100, 10]]]]);
    const b = s(2, '2026-10-08', 'Push', [['bench press', [[185, 3]]], ['Pec Fly', [[100, 10]]], ['Dips', [[0, 12]]]]);
    expect(sessionPrs([a, b], b)).toEqual([{ name: 'bench press', top: { w: 185, r: 3 }, prev: { w: 180, r: 5 } }]);
    expect(sessionPrs([a, b], a)).toEqual([]);
  });

  it('buckets weeks from Monday and counts the streak', () => {
    const list = [
      s(1, '2026-10-06', 'Push', [['Bench', [[100, 10], [0, 10]]]]), // Tue
      s(2, '2026-10-11', 'Pull', [['Row', [[50, 10]]]]), // Sun, same week
      s(3, '2026-10-12', 'Legs', [['Squat', [[200, 5]]]]), // Mon, next week
    ];
    const weeks = weekStats(list, '2026-10-24', 4);
    expect(weeks.map((w) => w.start)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);
    expect(weeks.map((w) => w.sessions)).toEqual([0, 2, 1, 0]);
    expect(weeks[1].volume).toBe(500 + 1000);
    expect(weekStreak(weeks)).toBe(2);
  });
});
