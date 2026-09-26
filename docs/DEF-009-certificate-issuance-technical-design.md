# DEF-009 — Certificate Issuance, Revocation and Verification: Technical Design

**Defect:** DEF-009
**Status:** Design complete, pending implementation
**Branch:** `production`
**Date:** 2026-09-26
**Owner:** Owen

---

## 1. Decision record

These five requirements decisions were made by the Team Lead and are treated as settled
inputs to this design.

| #   | Question                         | Decision                                                                                                                                                                                                                                   |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Revocation                       | **Admin-only** revocation using `status` + `revoked_at` + `revoked_by` + `revocation_reason`. Course creators retain authority over certificate _configuration_ and issuance settings, but not over revoking an already-issued credential. |
| 2   | Certificate vs. account deletion | **Pseudonymised preservation** of the achievement record. **PROVISIONAL — pending confirmation from the owner of data-protection/compliance requirements.** See §7.                                                                        |
| 3   | Verification / download          | **Permanent public verification ID** (safe to print, does not grant PDF download) + **authenticated download** of the personalised PDF.                                                                                                    |
| 4   | Granularity                      | **One certificate per course.** No module-level certificates.                                                                                                                                                                              |
| 5   | Score semantics                  | **Course completion + qualifying assessment score.** Configurations with `requireCourseCompletion = false` intentionally omit the completion requirement; the qualifying score remains the gate.                                           |
| —   | Enrolment gate                   | `checkEligibility` must enforce enrolment itself rather than relying on callers.                                                                                                                                                           |

> **On decision 2.** This is an engineering default, not a compliance determination.
> `learnerNameSnapshot` is itself personal data, so "preserve the certificate" and
> "preserve the learner's identity" are separate obligations and the design models them
> separately (§7). The implementation is structured so that reverting to hard deletion is
> a single, clearly marked code path if compliance concludes otherwise. This must not be
> reported as a satisfied compliance requirement.

---

## 2. Scope

In scope:

- Revocation data model, service and admin API.
- Eligibility semantics (enrolment gate + completion + qualifying score).
- Separation of public verification from authenticated download.
- Rate limiting of the public verification endpoint.
- Pseudonymous preservation of certificates on learner erasure (provisional).
- Fixing the two already-merged schema/analytics defects is **done**, see §11.

Out of scope:

- Module-level certificates (rejected by decision 4).
- Module/lesson-level progress already tracked by `lesson_completions`.
- Any change to `course-service.getCourseCompletionStatus` last-attempt semantics
  (that is course completion policy, not certificate policy — see §5.4).
- Migration-history reconciliation for 0015–0029 (separate workstream, §9).

---

## 3. Current state (as-is)

| Concern                  | Location                                                          | Current behaviour                                                                                   |
| ------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Eligibility — assessment | `certificate-service.ts:113-133`                                  | `Math.max(...attempts.map(a => a.score))` — **best** attempt                                        |
| Eligibility — completion | `certificate-service.ts:101-110`                                  | Requires a `course_completions` row                                                                 |
| Eligibility — enrolment  | `certificate-service.ts:91-140`                                   | **Never checked.** Relies on upstream callers                                                       |
| No-quiz hole             | `certificate-service.ts:132`                                      | If `requireAssessment` and the course has no quiz, the requirement is **silently satisfied**        |
| Uniqueness               | `schema.ts:201`                                                   | Now aligned to `(user_id, course_id)` (commit `52983a8`)                                            |
| Issuance conflict target | `certificate-service.ts:197-199`                                  | `onConflictDoNothing({ target: [userId, courseId] })`                                               |
| Verification             | `certificate-service.ts:291-324`                                  | Exact-match lookup, returns no revocation state                                                     |
| Public download          | `routes/certificates.ts:77` → `certificate-controller.ts:175-197` | **Unauthenticated.** Anyone with the code gets the personalised PDF                                 |
| Code printed on PDF      | `pdf-certificate-generator.ts:81-89, 312-325`                     | The download credential is printed on the artifact it unlocks                                       |
| Code entropy             | `certificate-service.ts:143-151`                                  | `AQS-CERT-` + 8 chars of 32 = 40 bits                                                               |
| Verification rate limit  | `rate-limit.ts:76`                                                | Keyed on `req.path`, so each candidate code gets a fresh bucket — **no enumeration protection**     |
| Revocation               | —                                                                 | **Does not exist.** No status column; `verifyCertificate` cannot distinguish a withdrawn credential |
| Erasure                  | `0023:83`, `0027:29`                                              | `DELETE FROM issued_certificates WHERE user_id = v_user_id;`                                        |
| Erasure FK               | `schema.ts:183-185`                                               | `userId` `NOT NULL` `ON DELETE CASCADE`                                                             |
| PII in snapshot          | `schema.ts:191`                                                   | `learnerNameSnapshot` `NOT NULL`                                                                    |
| Messaging coupling       | `messaging-service.ts:144-146`                                    | Certificate existence is a participation signal for messaging permission                            |

### 3.1 The core defect

`course-service.ts:60-61` derives `lastQuizScore` and `quizPassed` from the **last** attempt
and `isCompletable = allLessonsComplete && quizPassed`. `certificate-service.ts:123` uses the
**best** attempt. A learner who scores 90 then re-sits and scores 40 therefore:

- **satisfies** the certificate score gate (best = 90), and
- **can never** obtain `course_completions` (last attempt failed),

so with `requireCourseCompletion = true` they are permanently ineligible, while with
`requireCourseCompletion = false` they receive a certificate for a course they never
completed. Both branches are wrong.

---

## 4. Target data model

### 4.1 `issued_certificates` — additive changes only

```sql
ALTER TABLE issued_certificates
  ADD COLUMN IF NOT EXISTS status              text        NOT NULL DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS revoked_at          timestamp,
  ADD COLUMN IF NOT EXISTS revoked_by          integer     REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revocation_reason   text,
  ADD COLUMN IF NOT EXISTS subject_pseudonym   text;

-- status is a closed set, not free text
ALTER TABLE issued_certificates
  ADD CONSTRAINT issued_certificates_status_check
  CHECK (status IN ('valid', 'revoked'));

-- a revoked row must be fully explained; a valid row must not carry revocation metadata
ALTER TABLE issued_certificates
  ADD CONSTRAINT issued_certificates_revocation_consistency
  CHECK (
    (status = 'valid'  AND revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
    OR
    (status = 'revoked' AND revoked_at IS NOT NULL AND revocation_reason IS NOT NULL)
  );
```

`subject_pseudonym` holds a stable, non-reversible surrogate for the learner
(§7). It is **not** an identifier and is never returned by any API.

### 4.2 Uniqueness must become _partial_ — a direct consequence of decisions 1 + 4

Decision 1 allows a valid certificate to become revoked. Decision 4 allows only one
certificate per course. Combined, the current unconditional unique index on
`(user_id, course_id)` would mean **a revoked certificate permanently blocks re-issue** for
that learner/course, which contradicts the purpose of revocation.

The constraint is therefore narrowed to _one **active** certificate per course_, with
revoked rows retained as history:

```sql
DROP INDEX IF EXISTS issued_certificates_user_course_unique;

-- history lookup (non-unique)
CREATE INDEX IF NOT EXISTS issued_certificates_user_course_idx
  ON issued_certificates (user_id, course_id);

-- one ACTIVE certificate per learner/course
CREATE UNIQUE INDEX IF NOT EXISTS issued_certificates_user_course_valid_unique
  ON issued_certificates (user_id, course_id)
  WHERE status = 'valid';
```

Corresponding Drizzle declaration:

```ts
uniqueIndex('issued_certificates_user_course_valid_unique')
  .on(table.userId, table.courseId)
  .where(sql`${table.status} = 'valid'`),
```

and the issuance conflict handler becomes:

```ts
.onConflictDoNothing({
  target: [schema.issuedCertificates.userId, schema.issuedCertificates.courseId],
  targetWhere: sql`${schema.issuedCertificates.status} = 'valid'`,
})
```

This is a **breaking change to the uniqueness contract** and must be applied in the same
release as revocation, not before it.

### 4.3 No event log

Decision 1 chose the status-column approach. The existing snapshot columns already give
immutability of the issued facts. An `issued_certificate_events` table is deliberately **not**
introduced; it can be added later without conflict if audit depth is later required.

---

## 5. Behaviour changes

### 5.1 Eligibility (decision 5 + enrolment gate)

`checkEligibility` becomes self-contained:

```
eligible =
     enrolment exists for (userId, courseId)                      [NEW]
 AND (NOT requireCourseCompletion OR course_completions row exists)
 AND (NOT requireAssessment      OR bestScore >= minAssessmentScore)
```

Implementation notes:

- **Enrolment gate** — query `enrollments` for `(userId, courseId)`. On failure return
  reason `'Not enrolled in this course'`. This removes the current dependency on every
  caller having enforced enrolment upstream.
- **Completion** — unchanged query against `course_completions`; that row is the
  authoritative record and already implies a passing last attempt.
- **Assessment** — keep `Math.max` (best attempt). Combined with the completion requirement
  this is coherent: completion is the hard gate, the best score is the additional qualifier.
  For `requireCourseCompletion = false` the score is the sole gate, as decided.
- **Effective minimum** — `minAssessmentScore ?? 70`, unchanged. Consider surfacing the
  effective value in the snapshot (already recorded as `minAssessmentScore`, which may be
  `null`); recommend additionally snapshotting the _resolved_ threshold. _(Minor, optional.)_

### 5.2 Revocation (decision 1)

New service functions:

```ts
revokeCertificate(certificateId: number, actorId: number, reason: string): Promise<IssuedCertificate>
restoreCertificate(certificateId: number, actorId: number): Promise<IssuedCertificate>
listRevokedCertificates(actorId: number): Promise<...>
```

Rules:

- Authorisation is enforced in the **controller**: `req.dbUser.role !== 'admin'` → `403`.
  This is deliberately stricter than the `admin || course.createdBy === user.id` guard used
  by the configuration endpoints (`certificate-controller.ts:20, 47`), per decision 1.
- `revokeCertificate` is idempotent-safe: revoking an already-revoked certificate throws a
  `409` rather than overwriting the original `revoked_at` / `revoked_by` / reason. The first
  revocation of record is not silently replaced.
- `restoreCertificate` sets `status = 'valid'` and **clears** all three revocation columns to
  satisfy the §4.1 consistency constraint. It does **not** delete the row, so the
  revoke/restore history is not preserved in this design — accepted trade-off of decision 1,
  recorded here so it is not mistaken for an oversight.
- `verifyCertificate` gains a `revoked` boolean and `revokedAt` to its return shape.
  A revoked certificate returns `valid: false, revoked: true` — it must not read as valid.

### 5.3 Verification and download (decision 3)

| Endpoint                                           | Auth                  | Change                                                                                                                |
| -------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GET /api/certificates/verify/:verificationCode`   | public                | **Keep.** Permanent. Add `revoked`/`revokedAt`. Response is already redacted (initials, course, title, issuer, date). |
| `GET /api/certificates/download/:verificationCode` | public                | **Remove.** This is the endpoint that makes the printed code a download credential.                                   |
| `GET /api/certificates/mine`                       | `requireAuth`         | **New.** Learner's own certificates, newest first, with certificate id + verification code.                           |
| `GET /api/certificates/:id/download`               | `requireAuth`         | **New.** Owner-or-admin only. Serves the personalised PDF.                                                            |
| `POST /api/certificates/:id/revoke`                | `requireAuth` + admin | **New.** Body `{ reason }`.                                                                                           |
| `POST /api/certificates/:id/restore`               | `requireAuth` + admin | **New.**                                                                                                              |

Because download is now authenticated, printing the verification code on the PDF is no
longer a credential leak — the code is a _verification_ identifier, not an _access_ one.
`pdf-certificate-generator.ts` needs no change; it should additionally print the verification
URL so a holder knows where to check it.

**Migration/compat note:** removing the public download route is a breaking API change for
any client that links to it directly. The learner UI must be updated in the same change. If a
transitional period is required, keep the old route for one release returning `410 Gone` with
a pointer to the authenticated endpoint.

### 5.4 Deliberately unchanged

`course-service.getCourseCompletionStatus` keeps last-attempt semantics. A learner who
passes then fails remains uncompletable. That is existing course-completion policy and is
out of DEF-009's scope; changing it would alter course completion for every feature, not
just certificates.

### 5.5 Open sub-decision — the no-quiz hole

`certificate-service.ts:132` treats `requireAssessment = true` on a course with no quiz as
**satisfied**. Under decision 5 the qualifying score is meant to be the gate, so silently
passing the gate when no assessment exists contradicts the intent.

Options: (a) fail closed — ineligible with reason `'No assessment configured for this
course'`; (b) keep current behaviour and document it.

**Recommendation: (a) fail closed.** It is the safer default and matches the stated intent
that the score is the gate. This needs a quick confirmation before implementation, and it
also requires deciding whether issuance should be blocked at configuration time
(`requireAssessment = true` on a quiz-less course) or at eligibility time.

---

## 6. Security changes

1. **Rate limiting (decision 3, explicitly in scope).** The current limiter keys on
   `req.path` (`rate-limit.ts:76`), so each distinct candidate code consumes a fresh bucket
   and 20 req/min per code provides no protection against enumeration. Introduce a limiter
   keyed on **client IP** for `/api/certificates/verify/:verificationCode`, at a materially
   lower rate. Keying must ignore the path parameter.
2. **Download requires authentication** (§5.3), removing the personalised-PDF exposure
   entirely.
3. **Verification entropy.** 40 bits (`certificate-service.ts:143-151`) is adequate against
   online guessing once IP-keyed limiting is in place. Not changing the alphabet or length in
   this defect; noted for future hardening.
4. **Pseudonym non-reversibility** (§7) — `subject_pseudonym` must be a salted hash, not a
   plain hash of the email, since email addresses are guessable.
5. **Revocation reason is free text from an admin** and is rendered in the admin UI. It must
   be length-bounded (e.g. 500 chars) and React-escaped like all other user-supplied text.

---

## 7. Data protection (decision 2 — PROVISIONAL)

### 7.1 Two separate obligations

| Obligation                                                                                                          | Handling                                                                            |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Preserve the **achievement record** (that a credential was issued, for what course, when, under which requirements) | Row is retained.                                                                    |
| Erase the **learner's identifying personal data**                                                                   | `userId` nulled, `learnerNameSnapshot` pseudonymised, `subject_pseudonym` retained. |

### 7.2 Schema changes

```sql
-- userId becomes nullable so the row can outlive the user
ALTER TABLE issued_certificates
  ALTER COLUMN user_id DROP NOT NULL;

-- FK becomes SET NULL (was CASCADE) so deleting a user orphans rather than deletes
ALTER TABLE issued_certificates
  DROP CONSTRAINT IF EXISTS issued_certificates_user_id_users_id_fkey;
ALTER TABLE issued_certificates
  ADD CONSTRAINT issued_certificates_user_id_users_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
```

`revoked_by` is already `ON DELETE SET NULL`, so an erased revoker does not break the row.

### 7.3 Erasure procedure change

`wipe_learner_data` (`0023:83`, `0027:29`) currently hard-deletes. Replace with:

```sql
-- PROVISIONAL (decision 2, pending compliance confirmation):
-- preserve the achievement record, erase the learner's identity.
UPDATE issued_certificates
   SET user_id                = NULL,
       learner_name_snapshot  = 'REDACTED',
       subject_pseudonym      = <salted hash captured before wipe>
 WHERE user_id = v_user_id;
```

The salt must be captured **before** the identifying columns are overwritten, and the salt
itself is a project secret that is not deleted on learner erasure — otherwise the pseudonym
cannot be shown to be stable.

### 7.4 Reverting to hard deletion

If compliance concludes deletion is required, the single change is to restore the
`DELETE FROM issued_certificates WHERE user_id = v_user_id;` statement and revert §7.2. The
pseudonym column can remain harmlessly `NULL`. **No other part of the design depends on this
choice** — this is why it is isolated.

### 7.5 Downstream impacts

- **`verifyCertificate` initials break.** `learnerNameSnapshot` becomes `'REDACTED'`, so the
  initials computation at `certificate-service.ts:309-314` yields `"RE"`. The verify response
  must omit `learnerInitials` for pseudonymised certificates rather than display `RE`.
- **Messaging permission changes.** `messaging-service.ts:144-146` treats certificate
  existence as participation evidence. With `userId` nulled the join no longer matches, so an
  erased learner's certificate stops granting messaging access to that course. Since the
  learner is erased, this is almost certainly correct — but it is a behaviour change in
  **messaging**, a feature owned by another developer, and must be raised with them.
- **Analytics counts are preserved.** The Defect 3 fix counts certificates by `course_id`,
  which is untouched by erasure, so institutional reporting survives. This is a benefit of
  decision 2 over deletion.
- **Unique index with NULL `user_id`.** Postgres treats NULLs as distinct, so two erased
  learners' certificates for the same course will not collide under the §4.2 partial index.
  No action needed, but this is why `learnerNameSnapshot` cannot be left `NOT NULL` and
  repopulated with a duplicate name.

---

## 8. Migrations required

| Migration                            | Contents                                                       | Notes                            |
| ------------------------------------ | -------------------------------------------------------------- | -------------------------------- |
| `0030_certificate_revocation`        | §4.1 columns, status check, revocation consistency check       | Additive                         |
| `0031_certificate_partial_unique`    | §4.2 index swap                                                | **Must ship with/after `0030`**  |
| `0032_certificate_pseudonymisation`  | §7.2 nullable `user_id`, FK to `SET NULL`, `subject_pseudonym` | Provisional; reversible per §7.4 |
| `0033_wipe_certificate_preservation` | §7.3 procedure body                                            | Provisional                      |

`0032` and `0033` implement the provisional decision 2 and should be committed on a clearly
labelled branch or with a `PROVISIONAL:` commit prefix so they are trivial to identify and
revert.

---

## 9. Dependency: migration-history reconciliation (0015–0029)

**Blocks** applying the table above, because `npm run db:migrate` currently applies no
migration after `0015_mushy_leech` (decision: journal all 15).

Out of scope for this design. Recorded here so the dependency is explicit:

- `drizzle/meta/_journal.json` ends at `idx 15` / `0015_mushy_leech`; 15 files on disk are
  unregistered (`0015_add_indexes_and_fk_fixes.sql` plus `0016`–`0029`), covering certificates
  **and** instructor onboarding, closure, messaging, and sync idempotency.
- Teammate-owned migrations must **not** have their SQL edited to fit the journal.
- `drizzle/meta/` snapshots exist only for 0008–0010 and 0014–0016, so `drizzle-kit generate`
  diffs against a 0016 snapshot. Regenerating snapshots is a separate documented concern, to
  be handled deliberately rather than as a side effect.
- Before any journal edit, confirm the applied state in each relevant environment; where a
  database was migrated out-of-band, re-journaling can fail on re-execution.

---

## 10. Test plan

**Eligibility**

- Enrolled + completed + best score ≥ minimum → eligible.
- Not enrolled → ineligible, reason `'Not enrolled in this course'`, **even if** completed
  and scored (proves the gate is self-contained).
- Best score below minimum → ineligible.
- `requireCourseCompletion = false` → completion ignored, score is the sole gate.
- No quiz with `requireAssessment = true` → per §5.5 decision.
- Regression for the 90-then-40 learner, asserting the outcome matches §5.1.

**Revocation**

- Admin revokes → `status = 'revoked'`, all three columns populated, timestamp/reason recorded.
- Instructor attempts to revoke → `403`.
- `verifyCertificate` on a revoked certificate → `valid: false, revoked: true`.
- Revoking twice → `409`, original values intact.
- Restore → `valid`, all revocation columns `NULL`.
- Re-issue after revocation → **succeeds** (proves the partial unique index).

**Verification / download**

- Public verify with a valid code → redacted payload, `revoked: false`.
- Public download endpoint → `404`/`410`, no PDF served.
- Authenticated owner download → PDF served.
- Non-owner authenticated download → `403`.
- IP-keyed rate limit: N+1 requests from one IP across **different** codes → `429`
  (this is the test that fails today).
- PDF still renders and contains the verification code and URL.

**Data protection (provisional)**

- Wipe learner → certificate row survives, `user_id IS NULL`, name is `REDACTED`,
  `subject_pseudonym` stable.
- Verify response omits `learnerInitials` for a pseudonymised certificate.
- Analytics still counts the certificate after wipe.
- Two different erased learners, same course → no unique-index violation.

**Migration behaviour (required by the agreed order, on a local database only)**

- Fresh database: `npm run db:migrate` applies 0000 → 0033 cleanly.
- Already-migrated database: re-running is a no-op.
- Schema push path: `drizzle-kit push` produces a schema matching migrations 0021/0031
  (this is the class of drift that commit `52983a8` fixed).

---

## 11. Already completed

| Commit    | Change                                                                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `52983a8` | `issued_certificates` uniqueness aligned to `(user_id, course_id)` per migration 0021. Removes SQLSTATE 42P10 on issuance against a schema-built database. |
| `631d7dc` | Admin analytics now returns `certificatesIssued` (total and per-course). The KPI no longer resolves to 0 and the per-course column renders.                |

Both verified: 39 passed / 1 skipped, ESLint 0 errors, `tsc` unchanged (2 pre-existing
`redis-store.ts` errors), `npm run build` exit 0.

---

## 12. Risks

| Risk                                                                                                  | Severity | Mitigation                                                    |
| ----------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------- |
| Partial unique index not shipped with revocation support → re-issue silently blocked or double-issued | High     | §4.2, one release, one migration pair                         |
| Removing the public download route breaks bookmarked links / external references                      | Medium   | `410 Gone` transition period (§5.3)                           |
| Wipe behaviour change affects messaging participation                                                 | Medium   | Raise with messaging owner before `0033`                      |
| Provisional decision 2 reversed by compliance after implementation                                    | Medium   | Isolated to `0032`/`0033`, revert path in §7.4                |
| Journal reconciliation changes teammate migration order                                               | Medium   | Separate workstream, teammate awareness, no SQL edits         |
| `revoked_by` becomes NULL if the revoking admin is later erased                                       | Low      | Accepted; audit depth intentionally not in this design (§4.3) |
| Restore destroys the prior revocation record                                                          | Low      | Accepted and recorded (§5.2)                                  |

---

## 13. Implementation sequence

1. `0030` + `0031` revocation and partial unique index, with tests.
2. Revocation service + admin routes, with tests.
3. Eligibility rework (enrolment gate, no-quiz decision), with tests.
4. `GET /api/certificates/mine` + authenticated download; remove public download; update
   learner UI; IP-keyed rate limit.
5. `0032` + `0033` provisional pseudonymisation, on a labelled branch, with tests.
6. Migration-history reconciliation 0015–0029 (separate workstream, §9).
7. Fresh + already-migrated database verification on local PostgreSQL only.
8. Defect Log updated **only** after the above are actually tested.

---

## 14. Before implementation begins

- [ ] Confirm the §5.5 no-quiz decision (recommendation: fail closed).
- [ ] Confirm whether the public download route gets a `410` transition period or is removed outright.
- [ ] Raise the messaging-participation impact (§7.5) with the messaging feature owner.
- [ ] Confirm a local PostgreSQL instance is available for the §10 migration tests.
- [ ] Obtain a compliance contact for decision 2 (§1).
