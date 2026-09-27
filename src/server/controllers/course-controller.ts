import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth.js';
import * as courseListService from '../services/course-list-service.js';
import * as lessonService from '../services/lesson-service.js';
import { completeCourse } from '../services/course-service.js';
import * as courseAdminService from '../services/course-admin-service.js';
import * as courseCoverService from '../services/course-cover-service.js';
import { ALLOWED_IMAGE_MIME_TYPE_SET } from '../../lib/mime-types.js';

export async function listPublicCourses(_req: Request, res: Response): Promise<void> {
  try {
    const courses = await courseListService.listPublicCourses();
    res.json(courses);
  } catch (error: any) {
    console.error('Error fetching public courses:', error);
    res.status(500).json({ error: 'Failed to retrieve course catalogue.' });
  }
}

export async function listCourses(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { limit, offset } = courseListService.parsePagination(req);
    const { courses, count } = await courseListService.listCourses(limit, offset);
    res.setHeader('X-Total-Count', count);
    res.json(courses);
  } catch (error: any) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: 'Failed to retrieve courses.' });
  }
}

export async function getCourseById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.id);
    if (isNaN(courseId)) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }
    const detail = await courseListService.getCourseDetail(courseId, req.dbUser!.id);
    if (!detail) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }
    res.json(detail);
  } catch (error: any) {
    console.error('Error loading course details:', error);
    res.status(500).json({ error: 'Failed to load course details.' });
  }
}

export async function completeCourseHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.id);
    if (isNaN(courseId)) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }
    const result = await completeCourse(req.dbUser!.id, courseId);
    res.json({ success: true, completionId: result.completionId, completedAt: result.completedAt.toISOString() });
  } catch (error: any) {
    if (error.message?.startsWith('Course not completable:')) {
      res.status(422).json({ error: error.message });
      return;
    }
    console.error('Error in /api/courses/:id/complete:', error);
    res.status(500).json({ error: error.message || 'Failed to complete course.' });
  }
}

export async function completeLesson(req: AuthRequest, res: Response): Promise<void> {
  try {
    const lessonId = parseInt(req.params.id);
    if (isNaN(lessonId)) {
      res.status(400).json({ error: 'Invalid lesson ID' });
      return;
    }
    await lessonService.completeLesson(req.dbUser!.id, lessonId);
    res.json({ success: true, lessonId });
  } catch (error: any) {
    console.error('Error checking/creating lesson completion:', error);
    res.status(500).json({ error: 'Failed to complete lesson.' });
  }
}

// ---------------------------------------------------------------------------
// Course cover images (DEF-004)
// ---------------------------------------------------------------------------

/**
 * Guards that the caller may manage a course's cover: admins, or the
 * instructor who created it. Mirrors the certificate-template ownership rule.
 */
async function assertCanManageCourse(req: AuthRequest, courseId: number): Promise<{ error: string } | null> {
  const course = await courseAdminService.getCourseById(courseId);
  if (!course) return { error: 'Course not found' };
  if (req.dbUser!.role !== 'admin' && course.createdBy !== req.dbUser!.id) {
    return { error: 'Forbidden: You can only set a cover image for your own courses' };
  }
  return null;
}

export async function uploadCourseCover(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }

    const denied = await assertCanManageCourse(req, courseId);
    if (denied) {
      res.status(denied.error === 'Course not found' ? 404 : 403).json({ error: denied.error });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No image file uploaded.' });
      return;
    }

    // The multer fileFilter already screens this; re-checked here so the
    // controller stays correct if the route's filter is ever loosened.
    if (!ALLOWED_IMAGE_MIME_TYPE_SET.has(req.file.mimetype)) {
      res.status(400).json({ error: 'Only JPG, PNG or WebP images are supported.' });
      return;
    }

    const thumbnail = await courseCoverService.setCourseCoverImage(
      courseId,
      {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        buffer: req.file.buffer,
        size: req.file.size,
      },
      req.dbUser!.id,
    );

    res.status(201).json({ success: true, thumbnail });
  } catch (error: unknown) {
    console.error('Upload course cover error:', error);
    res.status(500).json({ error: 'Failed to upload course cover image.' });
  }
}

export async function removeCourseCover(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }

    const denied = await assertCanManageCourse(req, courseId);
    if (denied) {
      res.status(denied.error === 'Course not found' ? 404 : 403).json({ error: denied.error });
      return;
    }

    const thumbnail = await courseCoverService.clearCourseCoverImage(courseId);
    if (thumbnail === null) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    res.json({ success: true, thumbnail });
  } catch (error: unknown) {
    console.error('Remove course cover error:', error);
    res.status(500).json({ error: 'Failed to remove course cover image.' });
  }
}

/**
 * Streams a course cover.
 *
 * Intentionally open to any authenticated caller (no enrollment check) so the
 * Discover/Explore grid can show covers for courses a learner has not joined.
 * The `?token=` query parameter exists because <img src> cannot send an
 * Authorization header — same approach as the lesson document endpoint.
 */
export async function getCourseCover(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }

    const cover = await courseCoverService.getCourseCoverDocument(courseId);
    if (!cover) {
      // No stored cover: the client renders its tint placeholder instead.
      res.status(404).json({ error: 'No cover image for this course' });
      return;
    }

    res.setHeader('Content-Type', cover.metadata.mimeType);
    res.setHeader('Content-Length', cover.data.length);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(cover.data);
  } catch (error: unknown) {
    console.error('Fetch course cover error:', error);
    res.status(500).json({ error: 'Failed to retrieve course cover image.' });
  }
}
