import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.ts';
import * as courseAdminService from '../services/course-admin-service.ts';
import * as lessonAdminService from '../services/lesson-admin-service.ts';

export async function createCourse(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { title, description, thumbnail } = req.body;
    if (!title || !description) {
      res.status(400).json({ error: 'Title and description are required.' });
      return;
    }
    const course = await courseAdminService.createCourse(title, description, thumbnail, req.dbUser!.id);
    res.status(201).json(course);
  } catch (error: unknown) {
    console.error('CMS Course creation error:', error);
    res.status(500).json({ error: 'Failed to create course.' });
  }
}

export async function updateCourse(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.id);
    const { title, description, thumbnail } = req.body;
    if (isNaN(courseId)) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }
    const course = await courseAdminService.getCourseById(courseId);
    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }
    if (req.dbUser!.role !== 'admin' && course.createdBy !== req.dbUser!.id) {
      res.status(403).json({ error: 'Forbidden: You can only edit your own courses' });
      return;
    }
    const updated = await courseAdminService.updateCourse(courseId, { title, description, thumbnail });
    res.json(updated);
  } catch (error: unknown) {
    console.error('CMS Course edit error:', error);
    res.status(500).json({ error: 'Failed to update course.' });
  }
}

export async function deleteCourse(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.id);
    if (isNaN(courseId)) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }
    const course = await courseAdminService.getCourseById(courseId);
    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }
    if (req.dbUser!.role !== 'admin' && course.createdBy !== req.dbUser!.id) {
      res.status(403).json({ error: 'Forbidden: You can only delete your own courses' });
      return;
    }
    await courseAdminService.deleteCourse(courseId);
    res.json({ success: true, message: 'Course deleted successfully', courseId });
  } catch (error: unknown) {
    console.error('CMS Course deletion error:', error);
    res.status(500).json({ error: 'Failed to delete course.' });
  }
}

export async function createLesson(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.courseId);
    const { title, content, videoUrl, slidesUrl, sortOrder } = req.body;
    if (isNaN(courseId) || !title || !content) {
      res.status(400).json({ error: 'Course ID, title and content are required.' });
      return;
    }
    const lesson = await lessonAdminService.createLesson(courseId, { title, content, videoUrl, slidesUrl, sortOrder });
    res.status(201).json(lesson);
  } catch (error: unknown) {
    console.error('CMS Lesson creation error:', error);
    res.status(500).json({ error: 'Failed to create lesson.' });
  }
}

export async function updateLesson(req: AuthRequest, res: Response): Promise<void> {
  try {
    const lessonId = parseInt(req.params.id);
    const courseId = parseInt(req.params.courseId);
    const { title, content, videoUrl, slidesUrl, sortOrder } = req.body;
    if (isNaN(lessonId)) {
      res.status(400).json({ error: 'Invalid lesson ID' });
      return;
    }
    if (req.dbUser!.role !== 'admin') {
      const course = await courseAdminService.getCourseById(courseId);
      if (!course || course.createdBy !== req.dbUser!.id) {
        res.status(403).json({ error: 'Forbidden: You can only edit lessons in your own courses' });
        return;
      }
    }
    const updated = await lessonAdminService.updateLesson(lessonId, courseId, {
      title,
      content,
      videoUrl,
      slidesUrl,
      sortOrder,
    });
    if (!updated) {
      res.status(404).json({ error: 'Lesson not found' });
      return;
    }
    res.json(updated);
  } catch (error: unknown) {
    console.error('CMS Lesson edit error:', error);
    res.status(500).json({ error: 'Failed to update lesson.' });
  }
}

export async function reorderLessons(req: AuthRequest, res: Response): Promise<void> {
  try {
    const courseId = parseInt(req.params.courseId);
    const { orderedIds } = req.body;
    if (isNaN(courseId)) {
      res.status(400).json({ error: 'Invalid course ID' });
      return;
    }
    const parsedIds = orderedIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id));
    await lessonAdminService.reorderLessons(courseId, parsedIds);
    res.json({ success: true, message: 'Curriculum reordered successfully' });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('CMS Reorder curriculum error:', error);
    res.status(500).json({ error: 'Failed to reorder lessons.' });
  }
}

export async function deleteLesson(req: AuthRequest, res: Response): Promise<void> {
  try {
    const lessonId = parseInt(req.params.id);
    const courseId = parseInt(req.params.courseId);
    if (isNaN(lessonId)) {
      res.status(400).json({ error: 'Invalid lesson ID' });
      return;
    }
    if (req.dbUser!.role !== 'admin') {
      const course = await courseAdminService.getCourseById(courseId);
      if (!course || course.createdBy !== req.dbUser!.id) {
        res.status(403).json({ error: 'Forbidden: You can only delete lessons in your own courses' });
        return;
      }
    }
    const deleted = await lessonAdminService.deleteLesson(lessonId, courseId);
    if (!deleted) {
      res.status(404).json({ error: 'Lesson not found' });
      return;
    }
    res.json({ success: true, message: 'Lesson deleted successfully' });
  } catch (error: unknown) {
    console.error('CMS Lesson deletion error:', error);
    res.status(500).json({ error: 'Failed to delete lesson.' });
  }
}
