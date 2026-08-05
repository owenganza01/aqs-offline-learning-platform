// src/components/admin/LessonManager.tsx
import React, { useState } from 'react';
import { Course, Lesson } from '../../types.ts';
import { apiFetch } from '../../lib/api.ts';
import { toYouTubeEmbed } from '../../lib/utils.ts';
import { Plus, Trash2, ArrowUp, ArrowDown, Edit3, RefreshCw, Download, FileText, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LessonManagerProps {
  token: string | null;
  selectedCourse: Course;
  onRefreshCourses: () => void;
  loadCourseFullDetails: (id: number) => Promise<void>;
}

export const LessonManager: React.FC<LessonManagerProps> = ({
  token,
  selectedCourse,
  onRefreshCourses,
  loadCourseFullDetails,
}) => {
  const [showAddLesson, setShowAddLesson] = useState<boolean>(false);
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null);
  const [lessonForm, setLessonForm] = useState({ title: '', content: '', videoUrl: '', slidesUrl: '', sortOrder: 0 });
  const [uploadingSlides, setUploadingSlides] = useState<boolean>(false);
  const [uploadingVideo, setUploadingVideo] = useState<boolean>(false);

  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedCourse) return;

    const payload = {
      courseId: selectedCourse.id,
      title: lessonForm.title,
      content: lessonForm.content,
      videoUrl: toYouTubeEmbed(lessonForm.videoUrl),
      slidesUrl: lessonForm.slidesUrl || null,
      sortOrder: lessonForm.sortOrder,
    };

    try {
      const url = editingLessonId
        ? `/api/admin/courses/${selectedCourse.id}/lessons/${editingLessonId}`
        : `/api/admin/courses/${selectedCourse.id}/lessons`;
      const method = editingLessonId ? 'PUT' : 'POST';

      const { ok } = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (ok) {
        setShowAddLesson(false);
        setEditingLessonId(null);
        setLessonForm({ title: '', content: '', videoUrl: '', slidesUrl: '', sortOrder: 0 });
        await loadCourseFullDetails(selectedCourse.id);
        onRefreshCourses();
      }
    } catch (err) {
      console.error('Failed to save lesson:', err);
    }
  };

  const handleUploadSlides = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingSlides(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('lessonId', String(editingLessonId || 0));

      const { ok, data } = await apiFetch('/api/admin/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!ok) {
        throw new Error(data?.error || 'Upload failed');
      }

      setLessonForm((l) => ({ ...l, slidesUrl: `doc:${data.id}` }));
    } catch (err: any) {
      console.error('Failed to upload slide document:', err);
      alert(`Failed to upload: ${err.message || 'Please try again.'}`);
    } finally {
      setUploadingSlides(false);
      const input = document.getElementById('slides-file-upload') as HTMLInputElement | null;
      if (input) input.value = '';
    }
  };

  const handleUploadVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingVideo(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('lessonId', String(editingLessonId || 0));

      const { ok, data } = await apiFetch('/api/admin/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!ok) {
        throw new Error(data?.error || 'Upload failed');
      }

      setLessonForm((l) => ({ ...l, videoUrl: `doc:${data.id}` }));
    } catch (err: any) {
      console.error('Failed to upload video:', err);
      alert(`Failed to upload: ${err.message || 'Please try again.'}`);
    } finally {
      setUploadingVideo(false);
      const input = document.getElementById('video-file-upload') as HTMLInputElement | null;
      if (input) input.value = '';
    }
  };

  const handleEditLessonSetup = (lesson: Lesson) => {
    setEditingLessonId(lesson.id);
    setLessonForm({
      title: lesson.title,
      content: lesson.content,
      videoUrl: lesson.videoUrl || '',
      slidesUrl: lesson.slidesUrl || '',
      sortOrder: lesson.sortOrder,
    });
    setShowAddLesson(true);
  };

  const handleDeleteLesson = async (lessonId: number) => {
    if (!token || !selectedCourse) return;
    if (!confirm('Are you sure you want to delete this syllabus lesson?')) return;

    try {
      const { ok } = await apiFetch(`/api/admin/courses/${selectedCourse.id}/lessons/${lessonId}`, {
        method: 'DELETE',
      });
      if (ok) {
        await loadCourseFullDetails(selectedCourse.id);
        onRefreshCourses();
      }
    } catch (e) {
      console.error('Failed to delete lesson:', e);
    }
  };

  const handleMoveLesson = async (index: number, direction: 'up' | 'down') => {
    if (!selectedCourse || !token) return;
    const currentLessons = selectedCourse.lessons ? [...selectedCourse.lessons] : [];
    if (currentLessons.length === 0) return;

    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= currentLessons.length) return;

    const firstLesson = currentLessons[index];
    const secondLesson = currentLessons[targetIdx];
    const originalFirstOrder = firstLesson.sortOrder;
    firstLesson.sortOrder = secondLesson.sortOrder;
    secondLesson.sortOrder = originalFirstOrder;
    currentLessons[index] = secondLesson;
    currentLessons[targetIdx] = firstLesson;

    try {
      const { ok } = await apiFetch(`/api/admin/courses/${selectedCourse.id}/lessons/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: currentLessons.map((l) => l.id) }),
      });

      if (ok) {
        await loadCourseFullDetails(selectedCourse.id);
        onRefreshCourses();
      }
    } catch (e) {
      console.error('Failed to reorder lessons:', e);
    }
  };

  return (
    <div className="bg-white border border-stroke p-6 rounded-xl shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-steel"></div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 pb-2 border-b border-stroke">
        <h4 className="font-bold text-text text-xs font-sans uppercase tracking-widest font-mono flex items-center gap-2">
          <FileText className="w-4 h-4 text-steel" />
          <span>Curriculum Syllabus Chapters ({selectedCourse.lessons?.length || 0})</span>
        </h4>
        <button
          onClick={() => {
            setEditingLessonId(null);
            setLessonForm({
              title: '',
              content: '',
              videoUrl: '',
              slidesUrl: '',
              sortOrder: selectedCourse.lessons?.length || 0,
            });
            setShowAddLesson(true);
          }}
          className="w-full sm:w-auto h-10 bg-steel hover:bg-[#2d4a70] text-white font-semibold text-xs px-4 rounded-lg border border-steel flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>ADD LESSON MATERIAL</span>
        </button>
      </div>

      <AnimatePresence>
        {showAddLesson && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-canvas border border-stroke p-5 rounded-xl mb-4 font-sans text-sm shadow-inner"
          >
            <h5 className="font-semibold text-text mb-3 text-xs tracking-tight uppercase border-b border-stroke pb-1.5">
              {editingLessonId ? '✏️ Modify Lesson Unit' : '✨ Create New Curriculum Unit'}
            </h5>
            <form onSubmit={handleSaveLesson} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase text-text-3 mb-1.5 font-mono">
                  Lesson Title:
                </label>
                <input
                  type="text"
                  required
                  value={lessonForm.title}
                  onChange={(e) => setLessonForm((l) => ({ ...l, title: e.target.value }))}
                  placeholder="e.g. Quantitative Assessment Metrics"
                  className="w-full p-2.5 border-[1.5px] border-stroke rounded-lg text-sm text-text bg-white outline-none focus:ring-2 focus:ring-steel/10 focus:border-steel transition-all font-medium"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-text-3 mb-1.5 font-mono">
                  YouTube Video (Optional):
                </label>
                <input
                  type="text"
                  value={lessonForm.videoUrl}
                  onChange={(e) => setLessonForm((l) => ({ ...l, videoUrl: e.target.value }))}
                  onBlur={(e) => {
                    const norm = toYouTubeEmbed(e.target.value);
                    if (norm !== e.target.value) setLessonForm((l) => ({ ...l, videoUrl: norm || '' }));
                  }}
                  placeholder="Paste YouTube embed code or URL (from Share → Embed)"
                  className="w-full p-2.5 border-[1.5px] border-stroke rounded-lg text-sm text-text bg-white outline-none focus:ring-2 focus:ring-steel/10 focus:border-steel transition-all font-medium"
                />
                <p className="text-[11px] text-text-3 mt-1 font-mono">
                  Tip: On YouTube → Share → Embed → copy the code and paste here
                </p>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-text-3 mb-1.5 font-mono">
                  Upload Video File (Optional — plays offline):
                </label>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={lessonForm.videoUrl.startsWith('doc:') ? lessonForm.videoUrl : ''}
                    onChange={(e) => setLessonForm((l) => ({ ...l, videoUrl: e.target.value }))}
                    placeholder="doc:... (set automatically when you upload below)"
                    className="w-full p-2.5 border-[1.5px] border-stroke rounded-lg text-sm text-text bg-white outline-none focus:ring-2 focus:ring-steel/10 focus:border-steel transition-all font-medium"
                    readOnly
                  />
                  <div className="relative">
                    <input
                      type="file"
                      id="video-file-upload"
                      onChange={handleUploadVideo}
                      accept="video/*,.mp4,.webm,.ogv,.mov"
                      className="hidden"
                      disabled={uploadingVideo}
                    />
                    <label
                      htmlFor="video-file-upload"
                      className={`block w-full border-[1.5px] border-dashed border-stroke rounded-lg p-7 text-center cursor-pointer transition-colors select-none ${
                        uploadingVideo ? 'opacity-50 pointer-events-none' : 'hover:border-steel hover:bg-steel-lt'
                      }`}
                    >
                      <span className="w-10 h-10 rounded-full bg-canvas flex items-center justify-center mx-auto mb-2.5">
                        {uploadingVideo ? (
                          <RefreshCw className="w-[18px] h-[18px] animate-spin text-text-3" />
                        ) : (
                          <Upload className="w-[18px] h-[18px] text-text-3" />
                        )}
                      </span>
                      <span className="block text-[13px] font-semibold text-text mb-[3px]">
                        {uploadingVideo ? 'Uploading…' : 'Upload lesson video'}
                      </span>
                      <span className="block text-xs text-text-3">
                        MP4, MOV up to 10 GB · Videos 10–15 min recommended
                      </span>
                    </label>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-text-3 mb-1.5 font-mono">
                  PowerPoint / Slides Link or Upload Document (Optional):
                </label>
                <div className="flex flex-col md:flex-row gap-2">
                  <input
                    type="text"
                    value={lessonForm.slidesUrl}
                    onChange={(e) => setLessonForm((l) => ({ ...l, slidesUrl: e.target.value }))}
                    placeholder="e.g. Google Slides link, OneDrive PowerPoint embed URL, PDF link"
                    className="flex-grow p-2.5 border-[1.5px] border-stroke rounded-lg text-sm text-text bg-white outline-none focus:ring-2 focus:ring-steel/10 focus:border-steel transition-all font-medium"
                  />
                  <div className="relative shrink-0">
                    <input
                      type="file"
                      id="slides-file-upload"
                      onChange={handleUploadSlides}
                      accept=".pdf,.ppt,.pptx,.key,.odp"
                      className="hidden"
                      disabled={uploadingSlides}
                    />
                    <label
                      htmlFor="slides-file-upload"
                      className={`h-10 px-4 border-[1.5px] border-stroke bg-white hover:bg-canvas rounded-lg text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 select-none ${uploadingSlides ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      {uploadingSlides ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-text-3" />
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 text-text-3 rotate-180" />
                          <span>Upload PPT/PDF</span>
                        </>
                      )}
                    </label>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-text-3 mb-1.5 font-mono">
                  Detailed Course Readings Summary (Content Text/Markdown):
                </label>
                <textarea
                  required
                  value={lessonForm.content}
                  onChange={(e) => setLessonForm((l) => ({ ...l, content: e.target.value }))}
                  placeholder="Provide student reference textbooks or technical content summaries..."
                  className="w-full p-2.5 border-[1.5px] border-stroke rounded-lg text-sm text-text-2 h-44 outline-none focus:ring-2 focus:ring-steel/10 focus:border-steel transition-all bg-white font-medium leading-relaxed"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="bg-steel hover:bg-[#2d4a70] text-white font-semibold text-xs px-4 h-10 rounded-lg transition-all shadow-sm active:scale-95 border border-steel cursor-pointer"
                >
                  SAVE MATERIALS
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddLesson(false);
                    setEditingLessonId(null);
                  }}
                  className="bg-white hover:bg-canvas text-text-2 font-semibold text-xs px-4 h-10 rounded-lg border border-stroke transition-all shadow-sm cursor-pointer"
                >
                  ABANDON
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {(selectedCourse.lessons || []).length === 0 ? (
        <div className="text-center py-8 border border-dashed border-stroke rounded-xl bg-canvas/50">
          <p className="text-xs italic text-text-3">No lessons built yet. Click ADD LESSON MATERIAL above.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {(selectedCourse.lessons || []).map((lesson, index) => (
            <div
              key={lesson.id}
              className="bg-canvas/60 border border-stroke p-4 rounded-xl flex items-center justify-between gap-4 font-sans shadow-sm"
            >
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <span className="font-mono font-bold text-text-3 text-xs shrink-0">{index + 1}.</span>
                <div className="min-w-0">
                  <p className="font-semibold text-text text-xs truncate">{lesson.title}</p>
                  <p className="text-[10px] text-text-3 font-mono font-semibold mt-1">
                    ID #{lesson.id} • Order index: {lesson.sortOrder}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 font-mono">
                <button
                  onClick={() => handleMoveLesson(index, 'up')}
                  disabled={index === 0}
                  title="Move up"
                  className="p-1.5 bg-white border border-stroke hover:bg-canvas rounded-lg disabled:opacity-30 active:scale-95 cursor-pointer shadow-sm"
                >
                  <ArrowUp className="w-3.5 h-3.5 text-text-2" />
                </button>
                <button
                  onClick={() => handleMoveLesson(index, 'down')}
                  disabled={index === (selectedCourse.lessons || []).length - 1}
                  title="Move down"
                  className="p-1.5 bg-white border border-stroke hover:bg-canvas rounded-lg disabled:opacity-30 active:scale-95 cursor-pointer shadow-sm"
                >
                  <ArrowDown className="w-3.5 h-3.5 text-text-2" />
                </button>
                <button
                  onClick={() => handleEditLessonSetup(lesson)}
                  title="Edit"
                  className="p-1.5 bg-steel-lt border border-steel/30 hover:bg-steel/20 rounded-lg ml-1 active:scale-95 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5 text-steel" />
                </button>
                <button
                  onClick={() => handleDeleteLesson(lesson.id)}
                  title="Delete"
                  className="p-1.5 bg-error-bg border border-error/20 hover:bg-error/15 rounded-lg active:scale-95 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-error" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
