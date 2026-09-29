import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as schema from '../../db/schema.js';

// Mock the Drizzle client so the purge can be exercised without a live database
// (which is off-limits here). Every builder is a chainable promise: `.from()`,
// `.where()` and `.returning()` return the same object, and awaiting it yields
// the queued result. That mirrors how Drizzle's query builders are consumed.
const h = vi.hoisted(() => {
  const deleteCalls: { table: unknown; wheres: unknown[] }[] = [];
  const selectCalls: { table: unknown; wheres: unknown[] }[] = [];
  const selectResults: unknown[][] = [];

  // Drizzle's query builder is thenable and gains `from`/`where` as it is
  // called. Modelling it structurally keeps the mock honest without `any`.
  interface ThenableBuilder<T> extends Promise<T> {
    from: (table: unknown) => ThenableBuilder<T>;
    where: (cond: unknown) => ThenableBuilder<T>;
    returning: () => ThenableBuilder<T>;
  }

  function builder<T>(initial: T): ThenableBuilder<T> {
    const p = Promise.resolve(initial) as ThenableBuilder<T>;
    const chain = (): ThenableBuilder<T> => p;
    p.from = chain;
    p.where = chain;
    p.returning = chain;
    return p;
  }

  const tx = {
    select: (fields: unknown) => {
      const state = { table: null as unknown, wheres: [] as unknown[] };
      const p = builder(selectResults.shift() ?? []);
      p.from = (table: unknown) => {
        state.table = table;
        return p;
      };
      p.where = (cond: unknown) => {
        state.wheres.push(cond);
        p.then(() => selectCalls.push(state));
        return p;
      };
      void fields;
      return p;
    },
    delete: (table: unknown) => {
      const state = { table, wheres: [] as unknown[] };
      deleteCalls.push(state);
      const p = builder([] as unknown[]);
      p.where = (cond: unknown) => {
        state.wheres.push(cond);
        return p;
      };
      return p;
    },
  };

  return { deleteCalls, selectCalls, selectResults, tx };
});

vi.mock('../../db/index.js', () => ({
  db: {
    transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(h.tx),
  },
}));

const { unenrollUserFromCourse } = await import('./enrollment-service.js');

const deletedTables = () => h.deleteCalls.map((c) => c.table);

beforeEach(() => {
  h.deleteCalls.length = 0;
  h.selectCalls.length = 0;
  h.selectResults.length = 0;
});

describe('unenrollUserFromCourse — scope isolation (DEF-007)', () => {
  // Regression guard for the requirement that leaving one course must never
  // disturb the learner's other courses or the certificates they already hold.
  it('never deletes from issued_certificates', async () => {
    h.selectResults.push([{ id: 101 }], [{ id: 11 }]);

    await unenrollUserFromCourse(7, 1);

    expect(deletedTables()).not.toContain(schema.issuedCertificates);
  });

  it('only deletes from the four course-scoped progress tables', async () => {
    h.selectResults.push([{ id: 101 }], [{ id: 11 }]);

    await unenrollUserFromCourse(7, 1);

    expect(new Set(deletedTables())).toEqual(
      new Set([schema.quizAttempts, schema.lessonCompletions, schema.courseCompletions, schema.enrollments]),
    );
  });

  it('scopes every delete with a where clause', async () => {
    h.selectResults.push([{ id: 101 }], [{ id: 11 }]);

    await unenrollUserFromCourse(7, 1);

    for (const call of h.deleteCalls) {
      expect(call.wheres.length).toBeGreaterThan(0);
    }
  });

  it('resolves only the target course’s quiz and lesson ids', async () => {
    h.selectResults.push([{ id: 101 }], [{ id: 11 }]);

    await unenrollUserFromCourse(7, 1);

    // Two selects, in order: this course's quizzes, then its lessons.
    expect(h.selectCalls).toHaveLength(2);
    expect(h.selectCalls[0].table).toBe(schema.quizzes);
    expect(h.selectCalls[1].table).toBe(schema.lessons);
  });

  it('skips attempt/completion deletes for a course with no quiz or lessons', async () => {
    h.selectResults.push([], []);

    const result = await unenrollUserFromCourse(7, 1);

    // Only the enrollment and course completion are touched; an empty
    // IN () clause would be invalid SQL, so those deletes must be skipped.
    expect(new Set(deletedTables())).toEqual(new Set([schema.courseCompletions, schema.enrollments]));
    expect(result.removed).toEqual({
      quizAttempts: 0,
      lessonCompletions: 0,
      courseCompletions: 0,
      enrollments: 0,
    });
  });

  it('reports the counts for the target course only', async () => {
    h.selectResults.push([{ id: 101 }], [{ id: 11 }, { id: 12 }]);

    const result = await unenrollUserFromCourse(7, 1);

    expect(result.courseId).toBe(1);
    expect(result.success).toBe(true);
    expect(result.removed).toEqual({
      quizAttempts: 0,
      lessonCompletions: 0,
      courseCompletions: 0,
      enrollments: 0,
    });
    // The removed counts must not advertise a certificate deletion.
    expect('certificates' in result.removed).toBe(false);
  });
});
