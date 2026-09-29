import { describe, it, expect } from 'vitest';
import { reconcileEnrolledCourseIds } from './enrollment-sync.js';

// The original code unioned local and server ids unconditionally. That was safe
// while enrollment only ever grew, but DEF-007 added unenrollment — and a union
// can never propagate a removal, so leaving a course on one device left it in
// "My courses" on every other device. These tests pin the fix and, just as
// importantly, the offline behaviour it must not regress.

describe('reconcileEnrolledCourseIds', () => {
  describe('propagating a removal (cross-device unenroll)', () => {
    it('drops a course the server no longer lists', () => {
      // Left on device A; device B still has [1, 2] locally and the server
      // reports only [1]. The union would keep 2 forever.
      const result = reconcileEnrolledCourseIds({
        localIds: [1, 2],
        serverIds: [1],
        syncOk: true,
        hadPendingEnrollments: false,
      });
      expect(result).toEqual([1]);
    });

    it('removes a locally-only course the server never had', () => {
      const result = reconcileEnrolledCourseIds({
        localIds: [7],
        serverIds: [],
        syncOk: true,
        hadPendingEnrollments: false,
      });
      expect(result).toEqual([]);
    });

    it('picks up courses enrolled on another device', () => {
      const result = reconcileEnrolledCourseIds({
        localIds: [1],
        serverIds: [1, 5, 9],
        syncOk: true,
        hadPendingEnrollments: false,
      });
      expect(result).toEqual([1, 5, 9]);
    });
  });

  describe('offline enrollment must not be dropped', () => {
    it('keeps a queued enrollment when the sync flush had pending items', () => {
      // The GET is fired in parallel with the POST, so a course enrolled by
      // that flush may be absent from the response. Trusting the server here
      // would make the new enrollment flicker out of the dashboard.
      const result = reconcileEnrolledCourseIds({
        localIds: [1, 42],
        serverIds: [1],
        syncOk: true,
        hadPendingEnrollments: true,
      });
      expect(result).toEqual([1, 42]);
    });

    it('keeps local ids when the sync flush failed', () => {
      // The queued enrollment may not have reached the server at all.
      const result = reconcileEnrolledCourseIds({
        localIds: [1, 42],
        serverIds: [1],
        syncOk: false,
        hadPendingEnrollments: false,
      });
      expect(result).toEqual([1, 42]);
    });

    it('reconciles the removal on the following sync once the queue has drained', () => {
      // The fallback above defers the removal rather than losing it: with an
      // empty queue and a successful flush the server list wins.
      const result = reconcileEnrolledCourseIds({
        localIds: [1, 42],
        serverIds: [1],
        syncOk: true,
        hadPendingEnrollments: false,
      });
      expect(result).toEqual([1]);
    });
  });

  describe('hygiene', () => {
    it('de-duplicates ids when falling back to the union', () => {
      expect(
        reconcileEnrolledCourseIds({
          localIds: [1, 1, 2],
          serverIds: [2, 3],
          syncOk: true,
          hadPendingEnrollments: true,
        }),
      ).toEqual([1, 2, 3]);
    });

    it('de-duplicates ids when the server list is authoritative', () => {
      // Note the local-only id 1 is dropped here, which is the point: the
      // server not listing it means it was left on another device.
      expect(
        reconcileEnrolledCourseIds({
          localIds: [1, 1, 2],
          serverIds: [2, 3],
          syncOk: true,
          hadPendingEnrollments: false,
        }),
      ).toEqual([2, 3]);
    });

    it('handles empty inputs', () => {
      expect(
        reconcileEnrolledCourseIds({ localIds: [], serverIds: [], syncOk: true, hadPendingEnrollments: false }),
      ).toEqual([]);
    });
  });
});
