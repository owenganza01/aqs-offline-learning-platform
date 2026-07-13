// src/components/admin/LessonManager.tsx
import React, { useState } from 'react';
import { Course, Lesson } from '../../types.ts';
import { apiFetch } from '../../lib/api.ts';
import { toYouTubeEmbed } from '../../lib/utils.ts';
import { Plus, Trash2, ArrowUp, ArrowDown, Edit3, RefreshCw, Download, FileText } from 'lucide-react';
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
    <div className="bg-white border border-slate-150 p-6 rounded-[2rem] shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-pink-500"></div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 pb-2 border-b border-slate-100">
        <h4 className="font-bold text-slate-800 text-xs font-sans uppercase tracking-widest font-mono flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-600" />
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
          className="w-full sm:w-auto h-10 bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs px-4 rounded-xl border border-pink-700/20 flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
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
            className="bg-slate-50 border border-slate-200 p-5 rounded-2.5xl mb-4 font-sans text-sm shadow-inner"
          >
            <h5 className="font-bold text-slate-800 mb-3 text-xs tracking-tight uppercase border-b border-slate-200 pb-1.5">
              {editingLessonId ? '✏️ Modify Lesson Unit' : '✨ Formulate New Curriculum Unit'}
            </h5>
            <form onSubmit={handleSaveLesson} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1 font-mono">
                  Lesson Title:
                </label>
                <input
                  type="text"
                  required
                  value={lessonForm.title}
                  onChange={(e) => setLessonForm((l) => ({ ...l, title: e.target.value }))}
                  placeholder="e.g. Quantitative Assessment Metrics"
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition-all font-semibold text-slate-855"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1 font-mono">
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
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition-all font-semibold text-slate-855"
                />
                <p className="text-[9px] text-slate-400 mt-1 font-mono">
                  Tip: On YouTube → Share → Embed → copy the code and paste here
                </p>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1 font-mono">
                  PowerPoint / Slides Link or Upload Document (Optional):
                </label>
                <div className="flex flex-col md:flex-row gap-2">
                  <input
                    type="text"
                    value={lessonForm.slidesUrl}
                    onChange={(e) => setLessonForm((l) => ({ ...l, slidesUrl: e.target.value }))}
                    placeholder="e.g. Google Slides link, OneDrive PowerPoint embed URL, PDF link"
                    className="flex-grow p-2.5 border border-slate-200 rounded-xl text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition-all font-semibold text-slate-855"
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
                      className={`h-10 px-4 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 select-none ${uploadingSlides ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      {uploadingSlides ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 text-slate-500 rotate-180" />
                          <span>Upload PPT/PDF</span>
                        </>
                      )}
                    </label>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1 font-mono">
                  Detailed Course Readings Summary (Content Text/Markdown):
                </label>
                <textarea
                  required
                  value={lessonForm.content}
                  onChange={(e) => setLessonForm((l) => ({ ...l, content: e.target.value }))}
                  placeholder="Provide student reference textbooks or technical content summaries..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs bg-white h-44 outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition-all text-slate-755 font-medium leading-relaxed"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs px-4 h-10 rounded-xl transition-all shadow-sm active:scale-95 border border-pink-700/20 cursor-pointer"
                >
                  SAVE MATERIALS
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddLesson(false);
                    setEditingLessonId(null);
                  }}
                  className="bg-white hover:bg-slate-100 text-slate-600 font-bold text-xs px-4 h-10 rounded-xl border border-slate-200 transition-all shadow-sm cursor-pointer"
                >
                  ABANDON
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {(selectedCourse.lessons || []).length === 0 ? (
        <div className="text-center py-8 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <p className="text-xs italic text-slate-500">No lessons built yet. Click ADD LESSON MATERIAL above.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {(selectedCourse.lessons || []).map((lesson, index) => (
            <div
              key={lesson.id}
              className="bg-slate-50/60 border border-slate-150 p-4 rounded-2xl flex items-center justify-between gap-4 font-sans shadow-sm"
            >
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <span className="font-mono font-black text-slate-450 text-xs shrink-0">{index + 1}.</span>
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 text-xs truncate">{lesson.title}</p>
                  <p className="text-[10px] text-slate-500 font-mono font-semibold mt-1">
                    ID #{lesson.id} • Order index: {lesson.sortOrder}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 font-mono">
                <button
                  onClick={() => handleMoveLesson(index, 'up')}
                  disabled={index === 0}
                  title="Move up"
                  className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg disabled:opacity-30 active:scale-95 cursor-pointer shadow-sm"
                >
                  <ArrowUp className="w-3.5 h-3.5 text-slate-600" />
                </button>
                <button
                  onClick={() => handleMoveLesson(index, 'down')}
                  disabled={index === (selectedCourse.lessons || []).length - 1}
                  title="Move down"
                  className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg disabled:opacity-30 active:scale-95 cursor-pointer shadow-sm"
                >
                  <ArrowDown className="w-3.5 h-3.5 text-slate-600" />
                </button>
                <button
                  onClick={() => handleEditLessonSetup(lesson)}
                  title="Edit"
                  className="p-1.5 bg-indigo-50 border border-indigo-150 hover:bg-indigo-100 rounded-lg ml-1 active:scale-95 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5 text-indigo-650" />
                </button>
                <button
                  onClick={() => handleDeleteLesson(lesson.id)}
                  title="Delete"
                  className="p-1.5 bg-red-50 border border-red-150 hover:bg-red-100 rounded-lg active:scale-95 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
