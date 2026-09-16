// src/server/services/messaging-service.ts
import { db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { eq, and, asc, desc, inArray, sql } from 'drizzle-orm';
import { effectiveClosureStatus } from './closure-service.js';

export class MessagingError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'MessagingError';
    this.statusCode = statusCode;
  }
}

/** Resolve a display name, preferring the live user name over the stored snapshot. */
export function displayName(
  user?: { name: string | null; email: string } | null,
  snapshot?: string | null,
): string | null {
  if (user?.name) return user.name;
  if (snapshot) return snapshot;
  if (user?.email) return user.email;
  return null;
}

export async function getUserById(userId: number) {
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  return rows[0] ?? null;
}

/**
 * Atomic find-or-create of a (course_id, learner_id, instructor_id) thread.
 * Single INSERT .. ON CONFLICT DO UPDATE — no check-then-insert race.
 * Names are snapshotted at creation time and never refreshed.
 */
export async function getOrCreateConversation(
  courseId: number,
  learnerId: number,
  instructorId: number,
): Promise<typeof schema.conversations.$inferSelect> {
  const [course] = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
  if (!course) {
    throw new MessagingError('Course not found.', 404);
  }
  if (course.createdBy !== instructorId) {
    const [currentOwner] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, course.createdBy ?? -1));
    if (!currentOwner) {
      throw new MessagingError(
        'The instructor for this course is no longer available. Please contact an administrator.',
        409,
      );
    }
    throw new MessagingError(
      'This course has been transferred to a different instructor. Select "Message Instructor" again to reach the current instructor.',
      409,
    );
  }

  const [learner] = await db.select().from(schema.users).where(eq(schema.users.id, learnerId));
  if (!learner) {
    throw new MessagingError('Sender not found.', 404);
  }
  const [instructor] = await db.select().from(schema.users).where(eq(schema.users.id, instructorId));
  if (!instructor) {
    throw new MessagingError('Instructor not found.', 404);
  }

  const now = new Date();
  const [conversation] = await db
    .insert(schema.conversations)
    .values({
      courseId,
      learnerId,
      instructorId,
      learnerNameSnapshot: learner.name ?? learner.email,
      instructorNameSnapshot: instructor.name ?? instructor.email,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.conversations.courseId, schema.conversations.learnerId, schema.conversations.instructorId],
      set: { updatedAt: now },
    })
    .returning();

  return conversation;
}

/**
 * True when the learner has any recorded participation in the course even if
 * an explicit enrollments row is missing (legacy offline enrollments, or a row
 * that predates enrollment syncing). Keeps messaging usable for genuinely
 * active learners without re-opening the gate to unenrolled strangers.
 */
async function hasActiveParticipation(userId: number, courseId: number): Promise<boolean> {
  const lc = await db
    .select({ id: schema.lessonCompletions.id })
    .from(schema.lessonCompletions)
    .innerJoin(schema.lessons, eq(schema.lessonCompletions.lessonId, schema.lessons.id))
    .where(and(eq(schema.lessonCompletions.userId, userId), eq(schema.lessons.courseId, courseId)))
    .limit(1);
  if (lc.length > 0) return true;

  const qa = await db
    .select({ id: schema.quizAttempts.id })
    .from(schema.quizAttempts)
    .innerJoin(schema.quizzes, eq(schema.quizAttempts.quizId, schema.quizzes.id))
    .where(and(eq(schema.quizAttempts.userId, userId), eq(schema.quizzes.courseId, courseId)))
    .limit(1);
  if (qa.length > 0) return true;

  const cc = await db
    .select({ id: schema.courseCompletions.id })
    .from(schema.courseCompletions)
    .where(and(eq(schema.courseCompletions.userId, userId), eq(schema.courseCompletions.courseId, courseId)))
    .limit(1);
  if (cc.length > 0) return true;

  const cert = await db
    .select({ id: schema.issuedCertificates.id })
    .from(schema.issuedCertificates)
    .where(and(eq(schema.issuedCertificates.userId, userId), eq(schema.issuedCertificates.courseId, courseId)))
    .limit(1);
  return cert.length > 0;
}

/**
 * Authorization gate for sending a message into a conversation.
 * Applies symmetrically to BOTH participants:
 *   - the thread is fully read-only while the instructor is in closure
 *     (pending or closed) — same rule on the learner and instructor side;
 *   - a learner sender must have a current active enrollment for the course,
 *     OR any recorded participation in it (completions, attempts, certificate);
 *   - the sender must be a participant of the conversation.
 */
export async function assertCanSend(
  sender: typeof schema.users.$inferSelect,
  conversation: typeof schema.conversations.$inferSelect,
): Promise<void> {
  const isParticipant = conversation.learnerId === sender.id || conversation.instructorId === sender.id;
  if (!isParticipant) {
    throw new MessagingError('You are not part of this conversation.', 403);
  }

  await assertThreadGates(sender, {
    courseId: conversation.courseId,
    instructorId: conversation.instructorId,
  });
}

/**
 * Pre-insert gates for starting a NEW thread (courseId + instructorId payload).
 * Runs BEFORE the atomic find-or-create so a blocked sender never leaves an
 * empty conversation row behind.
 */
async function assertThreadGates(
  sender: typeof schema.users.$inferSelect,
  target: { courseId: number; instructorId: number | null },
): Promise<void> {
  const [instructor] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, target.instructorId ?? -1));
  if (instructor && effectiveClosureStatus(instructor) !== null) {
    throw new MessagingError(
      'Messaging is currently disabled for this conversation while the instructor account is closing.',
      403,
    );
  }

  // Learner senders must hold a current enrollment (or equivalent participation)
  // in the course. Sender id is never NULL here (a real authenticated user is
  // sending), so these checks are safe.
  if (sender.role === 'learner') {
    const enrolled = await db
      .select({ id: schema.enrollments.id })
      .from(schema.enrollments)
      .where(and(eq(schema.enrollments.userId, sender.id), eq(schema.enrollments.courseId, target.courseId)))
      .limit(1);
    if (enrolled.length === 0 && !(await hasActiveParticipation(sender.id, target.courseId))) {
      throw new MessagingError('You must be enrolled in this course to send messages.', 403);
    }
  }
}

export async function sendMessage(
  senderId: number,
  content: string,
  opts: { conversationId?: number; courseId?: number; instructorId?: number; learnerId?: number },
): Promise<{ conversation: typeof schema.conversations.$inferSelect; message: typeof schema.messages.$inferSelect }> {
  const sender = await getUserById(senderId);
  if (!sender) {
    throw new MessagingError('Sender not found.', 404);
  }

  let conversation: typeof schema.conversations.$inferSelect;
  if (opts.conversationId) {
    const rows = await db.select().from(schema.conversations).where(eq(schema.conversations.id, opts.conversationId));
    if (rows.length === 0) {
      throw new MessagingError('Conversation not found.', 404);
    }
    conversation = rows[0];
    await assertCanSend(sender, conversation);
  } else if (opts.courseId && opts.learnerId) {
    // Instructor-initiated thread: the sender must be the course instructor
    // (ownership is enforced in getOrCreateConversation) and the target learner
    // is the thread's learner participant.
    if (sender.role !== 'instructor' && sender.role !== 'admin') {
      throw new MessagingError('Only course instructors may start a conversation with a learner.', 403);
    }
    await assertThreadGates(sender, { courseId: opts.courseId, instructorId: sender.id });
    conversation = await getOrCreateConversation(opts.courseId, opts.learnerId, sender.id);
  } else if (opts.courseId && opts.instructorId) {
    await assertThreadGates(sender, { courseId: opts.courseId, instructorId: opts.instructorId });
    conversation = await getOrCreateConversation(opts.courseId, sender.id, opts.instructorId);
  } else {
    throw new MessagingError('Either conversationId or a course participant pair is required.', 400);
  }

  const now = new Date();
  const [message] = await db
    .insert(schema.messages)
    .values({
      conversationId: conversation.id,
      senderId: sender.id,
      senderNameSnapshot: sender.name ?? sender.email,
      content,
      isRead: false,
      createdAt: now,
    })
    .returning();

  await db.update(schema.conversations).set({ updatedAt: now }).where(eq(schema.conversations.id, conversation.id));

  return { conversation, message };
}

export async function listConversations(userId: number) {
  const rows = await db
    .select()
    .from(schema.conversations)
    .where(sql`${schema.conversations.learnerId} = ${userId} OR ${schema.conversations.instructorId} = ${userId}`)
    .orderBy(desc(schema.conversations.updatedAt));

  if (rows.length === 0) return [];

  const convIds = rows.map((c) => c.id);
  const courseIds = rows.map((c) => c.courseId);
  const userIds = Array.from(
    new Set(rows.flatMap((c) => [c.learnerId, c.instructorId]).filter((id): id is number => id !== null)),
  );

  const [courses, users, allMessages] = await Promise.all([
    db.select().from(schema.courses).where(inArray(schema.courses.id, courseIds)),
    db.select().from(schema.users).where(inArray(schema.users.id, userIds)),
    db.select().from(schema.messages).where(inArray(schema.messages.conversationId, convIds)),
  ]);

  const courseById = new Map(courses.map((c) => [c.id, c]));
  const userById = new Map(users.map((u) => [u.id, u]));

  const lastByConv = new Map<number, (typeof allMessages)[number]>();
  const unreadByConv = new Map<number, number>();
  for (const m of allMessages) {
    const last = lastByConv.get(m.conversationId);
    if (!last || m.createdAt > last.createdAt) {
      lastByConv.set(m.conversationId, m);
    }
    if (!m.isRead && m.senderId !== userId) {
      unreadByConv.set(m.conversationId, (unreadByConv.get(m.conversationId) ?? 0) + 1);
    }
  }

  return rows.map((c) => {
    const course = courseById.get(c.courseId);
    const last = lastByConv.get(c.id);
    return {
      id: c.id,
      courseId: c.courseId,
      courseTitle: course?.title ?? 'Course',
      learnerId: c.learnerId,
      learnerName: displayName(
        c.learnerId !== null ? (userById.get(c.learnerId) ?? null) : null,
        c.learnerNameSnapshot,
      ),
      instructorId: c.instructorId,
      instructorName: displayName(
        c.instructorId !== null ? (userById.get(c.instructorId) ?? null) : null,
        c.instructorNameSnapshot,
      ),
      lastMessage: last?.content ?? null,
      lastMessageAt: last?.createdAt.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      unreadCount: unreadByConv.get(c.id) ?? 0,
    };
  });
}

export async function getMessages(conversationId: number, userId: number) {
  const [conversation] = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId));
  if (!conversation) {
    throw new MessagingError('Conversation not found.', 404);
  }
  const isParticipant = conversation.learnerId === userId || conversation.instructorId === userId;
  if (!isParticipant) {
    throw new MessagingError('You are not part of this conversation.', 403);
  }

  const rows = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(asc(schema.messages.createdAt));

  const senderIds = Array.from(new Set(rows.filter((m) => m.senderId !== null).map((m) => m.senderId!)));
  const senders =
    senderIds.length > 0 ? await db.select().from(schema.users).where(inArray(schema.users.id, senderIds)) : [];
  const senderById = new Map(senders.map((u) => [u.id, u]));

  return {
    conversation: {
      id: conversation.id,
      courseId: conversation.courseId,
      learnerId: conversation.learnerId,
      instructorId: conversation.instructorId,
      updatedAt: conversation.updatedAt.toISOString(),
    },
    messages: rows.map((m) => ({
      ...m,
      senderName: displayName(m.senderId !== null ? (senderById.get(m.senderId) ?? null) : null, m.senderNameSnapshot),
    })),
  };
}

export async function markAsRead(conversationId: number, userId: number): Promise<number> {
  const [conversation] = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId));
  if (!conversation) {
    throw new MessagingError('Conversation not found.', 404);
  }
  const isParticipant = conversation.learnerId === userId || conversation.instructorId === userId;
  if (!isParticipant) {
    throw new MessagingError('You are not part of this conversation.', 403);
  }

  const result = await db
    .update(schema.messages)
    .set({ isRead: true })
    .where(
      and(
        eq(schema.messages.conversationId, conversationId),
        sql`${schema.messages.senderId} IS DISTINCT FROM ${userId}`,
      ),
    )
    .returning({ id: schema.messages.id });

  return result.length;
}

export async function getUnreadTotal(userId: number): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.messages)
    .innerJoin(schema.conversations, eq(schema.messages.conversationId, schema.conversations.id))
    .where(
      and(
        sql`(${schema.conversations.learnerId} = ${userId} OR ${schema.conversations.instructorId} = ${userId})`,
        eq(schema.messages.isRead, false),
        sql`${schema.messages.senderId} IS DISTINCT FROM ${userId}`,
      ),
    );
  return rows[0]?.count ?? 0;
}
