// src/lib/enrollment-sync.ts
// Reconciles the local enrolled-course list with the server's (DEF-007).
//
// Extracted as a pure function because the rule is subtle enough to regress
// silently, and because the call site in App.tsx is a large effect that is not
// worth unit-testing wholesale.

export interface ReconcileEnrolledInput {
  /** Enrolled course ids currently in local storage on this device. */
  localIds: number[];
  /** Enrolled course ids the server reported via GET /api/enrollments. */
  serverIds: number[];
  /** Whether the POST /api/sync flush in the same batch succeeded. */
  syncOk: boolean;
  /** Whether that flush had queued offline enrollments to replay. */
  hadPendingEnrollments: boolean;
}

function unique(ids: number[]): number[] {
  return Array.from(new Set(ids));
}

/**
 * Returns the enrolled-course ids that should be written back to local storage.
 *
 * A plain union can never propagate a *removal*. Once a course id is in local
 * storage, leaving that course on one device leaves it under "My courses" on
 * every other device forever: the server stops listing it, but the local copy
 * survives and the union keeps it. Since DEF-007 adds unenrollment, the server
 * list has to win when it can be trusted, or leaving a course is only half
 * applied.
 *
 * The server list is trusted only when the sync flush succeeded *and* there
 * were no queued offline enrollments to replay. The GET is issued in parallel
 * with the POST, so a course enrolled by that very flush may be missing from
 * the response; trusting the server in that window would make a brand-new
 * enrollment flicker out of the dashboard until the next reload. Falling back
 * to the union in that case cannot drop a pending enrollment, and removals are
 * still reconciled on the following sync once the queue has drained.
 */
export function reconcileEnrolledCourseIds({
  localIds,
  serverIds,
  syncOk,
  hadPendingEnrollments,
}: ReconcileEnrolledInput): number[] {
  const server = unique(serverIds);

  if (syncOk && !hadPendingEnrollments) {
    return server;
  }

  return unique([...localIds, ...server]);
}
