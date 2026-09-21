// src/components/admin/LessonManager.tsx
import React, { useState } from 'react';
import { Course, Lesson } from '../../types.js';
import { apiFetch } from '../../lib/api.js';
import { toYouTubeEmbed } from '../../lib/utils.js';
import { RefreshCw, Upload, Plus, Trash2, FileText, ExternalLink } from 'lucide-react';

interface LessonManagerProps {
  token: string | null;
  selectedCourse: Course;
  onRefreshCourses: () => void;
  loadCourseFullDetails: (id: number) => Promise<void>;
  activeLesson?: Lesson | null;
  addMode?: boolean;
  onClose?: () => void;
}

export const LessonManager: React.FC<LessonManagerProps> = ({
  token,
  selectedCourse,
  onRefreshCourses,
  loadCourseFullDetails,
  activeLesson = null,
  addMode = false,
  onClose,
}) => {
  const [lessonForm, setLessonForm] = useState<{
    title: string;
    content: string;
    videoUrl: string;
    slidesUrl: string;
    sortOrder: number;
  }>(() =>
    activeLesson
      ? {
          title: activeLesson.title,
          content: activeLesson.content,
          videoUrl: activeLesson.videoUrl || '',
          slidesUrl: activeLesson.slidesUrl || '',
          sortOrder: activeLesson.sortOrder,
        }
      : {
          title: '',
          content: '',
          videoUrl: '',
          slidesUrl: '',
          sortOrder: selectedCourse.lessons?.length || 0,
        },
  );

  const [slideList, setSlideList] = useState<string[]>(() => {
    const raw = activeLesson?.slidesUrl || '';
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : [''];
  });

  const updateSlideList = (newList: string[]) => {
    setSlideList(newList);
    const serialized = newList
      .map((s) => s.trim())
      .filter(Boolean)
      .join(', ');
    setLessonForm((l) => ({ ...l, slidesUrl: serialized }));
  };

  const handleSlideItemChange = (index: number, val: string) => {
    if (val.includes(',') || val.includes('\n')) {
      const parts = val
        .split(/[,\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length > 1) {
        const updated = [...slideList];
        updated.splice(index, 1, ...parts);
        updateSlideList(updated);
        return;
      }
    }
    const updated = [...slideList];
    updated[index] = val;
    updateSlideList(updated);
  };

  const handleAddSlideLink = () => {
    updateSlideList([...slideList, '']);
  };

  const handleRemoveSlideItem = (index: number) => {
    const updated = slideList.filter((_, i) => i !== index);
    updateSlideList(updated.length > 0 ? updated : ['']);
  };

  const [uploadingSlides, setUploadingSlides] = useState<boolean>(false);
  const [uploadingVideo, setUploadingVideo] = useState<boolean>(false);

  const editingLessonId = activeLesson?.id ?? null;

  const contentMeta = activeLesson?.videoUrl
    ? 'Video lesson'
    : activeLesson?.content && activeLesson.content.trim()
      ? 'Reading'
      : 'No content yet';
  const hasContent = Boolean(
    (activeLesson?.content && activeLesson.content.trim()) || activeLesson?.videoUrl || activeLesson?.slidesUrl,
  );

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
        await loadCourseFullDetails(selectedCourse.id);
        onRefreshCourses();
        onClose?.();
      }
    } catch (err) {
      console.error('Failed to save lesson:', err);
    }
  };

  const handleUploadSlides = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingSlides(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      formData.append('lessonId', String(editingLessonId || 0));

      const { ok, data } = await apiFetch('/api/admin/documents/upload-batch', {
        method: 'POST',
        body: formData,
      });

      if (!ok) {
        throw new Error(data?.error || 'Upload failed');
      }

      if (data?.documents && data.documents.length > 0) {
        const newRefs = data.documents.map((d: { id: string }) => `doc:${d.id}`);
        const existing = slideList.filter((s) => s.trim().length > 0);
        updateSlideList([...existing, ...newRefs]);
      }
    } catch (err: any) {
      console.error('Failed to upload slide document(s):', err);
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

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-[22px]">
        <div>
          <h3 className="font-display text-[18px] text-text leading-snug">
            {addMode ? 'New lesson' : lessonForm.title || 'Untitled lesson'}
          </h3>
          <p className="text-[12px] text-text-3 mt-[3px]">
            Unit 1 · {contentMeta} · {hasContent ? 'Published' : 'Draft'}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="submit"
            form="lesson-editor-form"
            className="bg-steel hover:bg-[#2d4a70] text-white border border-steel rounded-[5px] px-[13px] py-[7px] text-[12.5px] font-semibold transition-colors shadow-sm active:scale-95 cursor-pointer"
          >
            Save changes
          </button>
        </div>
      </div>

      <form id="lesson-editor-form" onSubmit={handleSaveLesson} className="space-y-[20px]">
        <div>
          <label
            htmlFor="lesson-title"
            className="block text-[11px] font-bold uppercase tracking-[0.05em] text-text-3 mb-1.5 font-mono"
          >
            Lesson Title:
          </label>
          <input
            id="lesson-title"
            type="text"
            required
            value={lessonForm.title}
            onChange={(e) => setLessonForm((l) => ({ ...l, title: e.target.value }))}
            placeholder="e.g. Quantitative Assessment Metrics"
            className="w-full p-2.5 border-[1.5px] border-stroke rounded-[7px] text-sm text-text bg-white outline-none focus:ring-2 focus:ring-steel/10 focus:border-steel transition-all font-medium"
          />
        </div>
        <div>
          <label
            htmlFor="lesson-video-url"
            className="block text-[11px] font-bold uppercase tracking-[0.05em] text-text-3 mb-1.5 font-mono"
          >
            YouTube Video (Optional):
          </label>
          <input
            id="lesson-video-url"
            type="text"
            value={lessonForm.videoUrl}
            onChange={(e) => setLessonForm((l) => ({ ...l, videoUrl: e.target.value }))}
            onBlur={(e) => {
              const norm = toYouTubeEmbed(e.target.value);
              if (norm !== e.target.value) setLessonForm((l) => ({ ...l, videoUrl: norm || '' }));
            }}
            placeholder="Paste YouTube embed code or URL (from Share → Embed)"
            className="w-full p-2.5 border-[1.5px] border-stroke rounded-[7px] text-sm text-text bg-white outline-none focus:ring-2 focus:ring-steel/10 focus:border-steel transition-all font-medium"
          />
          <p className="text-[11px] text-text-3 mt-1 font-mono">
            Tip: On YouTube → Share → Embed → copy the code and paste here
          </p>
        </div>
        <div>
          <label
            htmlFor="lesson-video-file-ref"
            className="block text-[11px] font-bold uppercase tracking-[0.05em] text-text-3 mb-1.5 font-mono"
          >
            Upload Video File (Optional — plays offline):
          </label>
          <div className="space-y-2">
            <input
              id="lesson-video-file-ref"
              type="text"
              value={lessonForm.videoUrl.startsWith('doc:') ? lessonForm.videoUrl : ''}
              onChange={(e) => setLessonForm((l) => ({ ...l, videoUrl: e.target.value }))}
              placeholder="doc:... (set automatically when you upload below)"
              className="w-full p-2.5 border-[1.5px] border-stroke rounded-[7px] text-sm text-text bg-white outline-none focus:ring-2 focus:ring-steel/10 focus:border-steel transition-all font-medium"
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
                <span className="block text-xs text-text-3">MP4, MOV up to 10 GB · Videos 10–15 min recommended</span>
              </label>
            </div>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
            <label className="block text-[11px] font-bold uppercase tracking-[0.05em] text-text-3 font-mono">
              PowerPoint / Slides Links & Documents (Optional):
            </label>
            <span className="text-[11px] text-text-3 font-medium">
              Add multiple Google Slides links or upload PDFs/PPTs
            </span>
          </div>

          <div className="space-y-2">
            {slideList.map((item, idx) => {
              const isDoc = item.startsWith('doc:');
              return (
                <div key={idx} className="flex items-center gap-2">
                  {isDoc ? (
                    <div className="flex-1 min-w-0 flex items-center justify-between px-3 py-2 bg-paper-2 border border-stroke rounded-[7px] text-xs">
                      <div className="flex items-center gap-2 text-text font-mono truncate mr-2">
                        <FileText className="w-4 h-4 text-steel shrink-0" />
                        <span className="truncate font-semibold text-text">Uploaded File: {item}</span>
                      </div>
                      <span className="text-[10px] bg-steel/10 text-steel font-bold px-2 py-0.5 rounded-full shrink-0">
                        Document
                      </span>
                    </div>
                  ) : (
                    <div className="relative flex-1 min-w-0">
                      <input
                        type="url"
                        value={item}
                        onChange={(e) => handleSlideItemChange(idx, e.target.value)}
                        placeholder={`Slide Link #${idx + 1} (e.g. Google Slides link, OneDrive embed, or PDF URL)`}
                        className="w-full p-2.5 pr-8 border-[1.5px] border-stroke rounded-[7px] text-sm text-text bg-white outline-none focus:ring-2 focus:ring-steel/10 focus:border-steel transition-all font-medium"
                      />
                      {item && (
                        <a
                          href={item}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open link in new tab"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 hover:text-steel transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleRemoveSlideItem(idx)}
                    title="Remove this slide link/document"
                    className="h-10 w-10 shrink-0 border border-stroke hover:border-error hover:bg-error-bg text-text-3 hover:text-error rounded-[7px] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleAddSlideLink}
                className="h-9 px-3 border border-stroke hover:border-steel/50 bg-white hover:bg-canvas rounded-lg text-xs font-semibold flex items-center gap-1.5 text-text transition-all active:scale-95 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-steel" />
                <span>+ Add another slide link</span>
              </button>

              <div className="relative">
                <input
                  type="file"
                  id="slides-file-upload"
                  onChange={handleUploadSlides}
                  accept=".pdf,.ppt,.pptx,.key,.odp"
                  multiple
                  className="hidden"
                  disabled={uploadingSlides}
                />
                <label
                  htmlFor="slides-file-upload"
                  className={`h-9 px-3 border border-stroke bg-white hover:bg-canvas rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 select-none text-text ${uploadingSlides ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  {uploadingSlides ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-text-3" />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5 text-text-3" />
                      <span>Upload Document(s)</span>
                    </>
                  )}
                </label>
              </div>
            </div>
          </div>
        </div>
        <div>
          <label
            htmlFor="lesson-content"
            className="block text-[11px] font-bold uppercase tracking-[0.05em] text-text-3 mb-1.5 font-mono"
          >
            Detailed Course Readings Summary (Content Text/Markdown):
          </label>
          <textarea
            id="lesson-content"
            required
            value={lessonForm.content}
            onChange={(e) => setLessonForm((l) => ({ ...l, content: e.target.value }))}
            placeholder="Provide student reference textbooks or technical content summaries..."
            className="w-full p-[13px] border-[1.5px] border-stroke rounded-[7px] text-[13px] font-mono text-text-2 h-40 outline-none focus:ring-2 focus:ring-steel/10 focus:border-steel transition-all bg-white leading-relaxed resize-y"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="bg-white hover:bg-canvas text-text-2 font-semibold text-xs px-4 h-10 rounded-[7px] border border-stroke transition-all shadow-sm cursor-pointer"
          >
            ABANDON
          </button>
        </div>
      </form>
    </>
  );
};
