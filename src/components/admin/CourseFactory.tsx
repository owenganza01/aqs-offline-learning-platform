// src/components/admin/CourseFactory.tsx
import React, { useState, useEffect } from 'react';
import { Course } from '../../types.js';
import { apiFetch } from '../../lib/api.js';
import { BookOpen, Plus, Trash2, Edit3, Award, FileText, Upload, Check, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CourseFactoryProps {
  token: string | null;
  courses: Course[];
  selectedCourse: Course | null;
  setSelectedCourse: (course: Course | null) => void;
  onRefreshCourses: () => void;
  loadCourseFullDetails: (id: number) => Promise<void>;
  courseSubTab: string;
  setCourseSubTab: (tab: string) => void;
  userRole?: string;
}

interface CourseStat {
  activeStudents?: number;
  averageScore?: number | null;
}

const LMS_SWATCH_TINTS: { bg: string; fg: string }[] = [
  { bg: '#E8EFF7', fg: '#3D5A80' },
  { bg: '#E8F4EC', fg: '#1D6B45' },
  { bg: '#F3ECDC', fg: '#7B4F0A' },
  { bg: '#E8EFF7', fg: '#222E40' },
];

const courseInitials = (title: string): string =>
  title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

const getCourseCategory = (course: Course): string => {
  if ((course as any).category) {
    return (course as any).category;
  }
  const text = `${course.title} ${course.description}`.toLowerCase();
  if (
    text.includes('quant') ||
    text.includes('math') ||
    text.includes('stat') ||
    text.includes('calculus') ||
    text.includes('probab') ||
    text.includes('algebra') ||
    text.includes('model') ||
    text.includes('science')
  ) {
    return 'Quantitative Sciences';
  }
  if (
    text.includes('agri') ||
    text.includes('crop') ||
    text.includes('soil') ||
    text.includes('farm') ||
    text.includes('estim') ||
    text.includes('yield')
  ) {
    return 'Agricultural Estimation';
  }
  if (
    text.includes('scale') ||
    text.includes('system') ||
    text.includes('dynamic') ||
    text.includes('tech') ||
    text.includes('digit') ||
    text.includes('programm')
  ) {
    return 'Systems & Technology';
  }
  return 'General Education';
};

const COL_GRID = '1fr 96px 96px 80px 112px';

export const CourseFactory: React.FC<CourseFactoryProps> = ({
  token,
  courses,
  selectedCourse,
  setSelectedCourse,
  onRefreshCourses,
  loadCourseFullDetails,
  courseSubTab,
  userRole,
}) => {
  const [showAddCourse, setShowAddCourse] = useState<boolean>(false);
  const [editingCourse, setEditingCourse] = useState<boolean>(false);
  const [courseForm, setCourseForm] = useState({ title: '', description: '', thumbnail: 'teal' });
  const [courseStats, setCourseStats] = useState<Record<number, CourseStat>>({});
  const [certConfig, setCertConfig] = useState<{
    enabled: boolean;
    title: string;
    issuer: string;
    requireCourseCompletion: boolean;
    requireAssessment: boolean;
    minAssessmentScore: number | null;
  } | null>(null);
  const [certLoading, setCertLoading] = useState<boolean>(false);
  const [certSaving, setCertSaving] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    const endpoint = userRole === 'instructor' ? '/api/instructor/analytics' : '/api/admin/analytics';
    apiFetch<{ courseStats?: (CourseStat & { id: number })[] }>(endpoint)
      .then(({ ok, data }) => {
        if (ok && data?.courseStats && !cancelled) {
          const map: Record<number, CourseStat> = {};
          data.courseStats.forEach((s) => {
            map[s.id] = { activeStudents: s.activeStudents, averageScore: s.averageScore };
          });
          setCourseStats(map);
        }
      })
      .catch(() => {
        // Non-critical — table falls back to dash placeholders.
      });
    return () => {
      cancelled = true;
    };
  }, [token, courses, userRole]);

  // Load certificate config when course is selected
  useEffect(() => {
    if (!token || !selectedCourse) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCertConfig(null);
      return;
    }
    setCertLoading(true);
    apiFetch(`/api/courses/${selectedCourse.id}/certificate-config`)
      .then(({ ok, data }) => {
        if (ok && data) {
          setCertConfig(data);
        }
      })
      .catch(() => {
        setCertConfig(null);
      })
      .finally(() => setCertLoading(false));
  }, [token, selectedCourse]);

  const handleSaveCertConfig = async () => {
    if (!token || !selectedCourse || !certConfig) return;
    setCertSaving(true);
    try {
      const { ok } = await apiFetch(`/api/courses/${selectedCourse.id}/certificate-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(certConfig),
      });
      if (ok) {
        // Saved successfully
      }
    } catch {
      // Non-critical
    } finally {
      setCertSaving(false);
    }
  };

  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [templateMsg, setTemplateMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleTemplateFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCourse || !token) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setTemplateMsg({ type: 'error', text: 'Please select a valid PDF file.' });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setTemplateMsg({ type: 'error', text: 'PDF file size must be under 10MB.' });
      return;
    }

    setUploadingTemplate(true);
    setTemplateMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/courses/${selectedCourse.id}/certificate-template`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setCertConfig((prev: any) =>
          prev
            ? {
                ...prev,
                templateFileName: file.name,
                templateDocumentId: data.documentId,
              }
            : null,
        );
        setTemplateMsg({ type: 'success', text: 'Certificate PDF template uploaded successfully!' });
      } else {
        setTemplateMsg({ type: 'error', text: data.error || 'Failed to upload template.' });
      }
    } catch {
      setTemplateMsg({ type: 'error', text: 'Network error uploading template.' });
    } finally {
      setUploadingTemplate(false);
      e.target.value = '';
    }
  };

  const handleRemoveTemplate = async () => {
    if (!selectedCourse || !token) return;
    if (!confirm('Are you sure you want to remove the custom certificate template?')) return;

    setUploadingTemplate(true);
    setTemplateMsg(null);
    try {
      const { ok, data } = await apiFetch(`/api/courses/${selectedCourse.id}/certificate-template`, {
        method: 'DELETE',
      });
      if (ok) {
        setCertConfig((prev: any) =>
          prev
            ? {
                ...prev,
                templateFileName: null,
                templateDocumentId: null,
              }
            : null,
        );
        setTemplateMsg({ type: 'success', text: 'Template removed. Platform default certificate will be used.' });
      } else {
        setTemplateMsg({ type: 'error', text: data?.error || 'Failed to remove template.' });
      }
    } catch {
      setTemplateMsg({ type: 'error', text: 'Network error removing template.' });
    } finally {
      setUploadingTemplate(false);
    }
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const payload = {
      title: courseForm.title,
      description: courseForm.description,
      thumbnail: courseForm.thumbnail,
    };

    try {
      const url = editingCourse && selectedCourse ? `/api/admin/courses/${selectedCourse.id}` : '/api/admin/courses';
      const method = editingCourse && selectedCourse ? 'PUT' : 'POST';

      const { ok, data } = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (ok) {
        onRefreshCourses();
        setShowAddCourse(false);
        setEditingCourse(false);
        setCourseForm({ title: '', description: '', thumbnail: 'teal' });

        if (method === 'PUT') {
          await loadCourseFullDetails(selectedCourse!.id);
        } else {
          setSelectedCourse(data);
        }
      }
    } catch (error) {
      console.error('Failed to save course:', error);
    }
  };

  const handleDeleteCourse = async (courseId: number) => {
    if (!token) return;
    if (
      !confirm(
        'Are you absolutely certain you want to delete this course, along with ALL its curriculum chapters, lessons, and exam quiz sheets? This action is irreversible.',
      )
    ) {
      return;
    }

    try {
      const { ok } = await apiFetch(`/api/admin/courses/${courseId}`, {
        method: 'DELETE',
      });
      if (ok) {
        setSelectedCourse(null);
        onRefreshCourses();
      }
    } catch (e) {
      console.error('Failed to delete course:', e);
    }
  };

  if (!selectedCourse) {
    return (
      <div className="space-y-6" id="course-factory-catalog-grid">
        {/* Page header */}
        <div>
          <h3 className="font-display text-[22px] text-text tracking-tight flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-steel" />
            <span>Your courses</span>
          </h3>
          <p className="text-[13px] text-text-2 mt-1">Manage and publish your course content.</p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <h4 className="text-sm font-semibold text-text">
            All courses <span className="font-normal text-text-3">{courses.length}</span>
          </h4>
          <button
            onClick={() => {
              setEditingCourse(false);
              setCourseForm({ title: '', description: '', thumbnail: 'teal' });
              setShowAddCourse(true);
            }}
            className="h-10 bg-steel hover:bg-[#2d4a70] text-white font-semibold text-[13px] px-4 rounded-lg border border-steel flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>New course</span>
          </button>
        </div>

        <AnimatePresence>
          {showAddCourse && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-white border border-stroke p-6 rounded-xl shadow-sm font-sans"
            >
              <h4 className="font-semibold text-text text-sm mb-4 border-b border-stroke pb-2">
                {editingCourse ? 'Modify Course' : 'Create New Course'}
              </h4>
              <form onSubmit={handleSaveCourse} className="space-y-4">
                <div>
                  <label
                    htmlFor="course-create-title"
                    className="field-label block text-[11px] font-bold uppercase text-text-3 mb-1.5 font-mono"
                  >
                    Course Title:
                  </label>
                  <input
                    id="course-create-title"
                    type="text"
                    required
                    value={courseForm.title}
                    onChange={(e) => setCourseForm((c) => ({ ...c, title: e.target.value }))}
                    className="w-full p-3 border-[1.5px] border-stroke rounded-lg text-sm text-text outline-none focus:border-steel focus:ring-2 focus:ring-steel/10 transition-all font-medium bg-white"
                    placeholder="e.g. Statistical Inference & Regression"
                  />
                </div>
                <div>
                  <label
                    htmlFor="course-create-description"
                    className="block text-[11px] font-bold uppercase text-text-3 mb-1.5 font-mono"
                  >
                    Short Description / Summary:
                  </label>
                  <textarea
                    id="course-create-description"
                    required
                    value={courseForm.description}
                    onChange={(e) => setCourseForm((c) => ({ ...c, description: e.target.value }))}
                    className="w-full p-3 border-[1.5px] border-stroke rounded-lg text-sm text-text h-24 outline-none focus:border-steel focus:ring-2 focus:ring-steel/10 transition-all text-text-2 leading-relaxed"
                    placeholder="Explain the quantitative metrics students will learn in simple terms..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-grow h-11 bg-steel hover:bg-[#2d4a70] font-semibold text-white text-[13px] rounded-lg transition-all shadow-sm active:scale-95 border border-steel cursor-pointer"
                  >
                    SAVE COURSE
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddCourse(false)}
                    className="w-28 h-11 bg-white hover:bg-canvas text-text-2 font-semibold text-[13px] rounded-lg border border-stroke transition-all active:scale-95 cursor-pointer"
                  >
                    CANCEL
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {courses.length === 0 ? (
          <div className="bg-white border border-stroke rounded-xl p-12 text-center shadow-sm">
            <BookOpen className="w-12 h-12 text-text-3 mx-auto mb-4" />
            <h4 className="text-sm font-semibold text-text">No active classrooms yet</h4>
            <p className="text-text-3 max-w-xs mx-auto mt-2 text-xs leading-relaxed font-sans">
              Start by clicking the "New course" button above to establish your first quantitative learning materials.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="bg-white border border-stroke rounded-xl overflow-hidden shadow-sm min-w-[720px]">
              <div
                className="grid border-b border-stroke px-4 py-2.5 text-[11px] uppercase tracking-wider text-text-3 font-semibold"
                style={{ gridTemplateColumns: COL_GRID }}
              >
                <span>Course</span>
                <span>Enrolled</span>
                <span>Avg. score</span>
                <span>Lessons</span>
                <span>Status</span>
              </div>

              {courses.map((course, idx) => {
                const unitsCount = course.lessons?.length || 0;
                const isPublished = unitsCount > 0;
                const stat = courseStats[course.id];
                const enrolled = stat?.activeStudents ?? null;
                const avgScore = stat?.averageScore ?? null;
                const tint = LMS_SWATCH_TINTS[idx % LMS_SWATCH_TINTS.length];
                return (
                  <div
                    key={course.id}
                    onClick={() => setSelectedCourse(course)}
                    className="grid px-4 py-3.5 border-b border-stroke items-center cursor-pointer hover:bg-canvas transition-colors last:border-b-0"
                    style={{ gridTemplateColumns: COL_GRID }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-[34px] h-[34px] rounded-md flex items-center justify-center font-mono text-[11px] font-medium flex-shrink-0"
                        style={{ background: tint.bg, color: tint.fg }}
                      >
                        {courseInitials(course.title)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-text truncate">{course.title}</div>
                        <div className="text-[11px] text-text-3">{getCourseCategory(course)}</div>
                      </div>
                    </div>
                    <div className="text-[12px] font-mono text-text-2">{enrolled === null ? '—' : enrolled}</div>
                    <div className="text-[12px] font-mono text-text-2">
                      {avgScore === null || avgScore === undefined ? '—' : `${avgScore}%`}
                    </div>
                    <div className="text-[12px] font-mono text-text-2">{unitsCount}</div>
                    <div>
                      {isPublished ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded bg-[#E8F4EC] text-success">
                          ● Published
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded bg-[#F0F2F5] text-text-3">
                          ○ Draft
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Course selected — show settings sub-tab
  return (
    <div className="w-full space-y-6">
      {courseSubTab === 'settings' && (
        <div className="bg-white border border-stroke p-6 rounded-xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-steel"></div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4">
            <div>
              <h3 className="text-xl font-display font-bold text-text tracking-tight">{selectedCourse.title}</h3>
              <p className="text-text-3 text-xs leading-relaxed mt-1">{selectedCourse.description}</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto self-stretch shrink-0 font-sans">
              <button
                onClick={() => {
                  setEditingCourse(true);
                  setCourseForm({
                    title: selectedCourse.title,
                    description: selectedCourse.description,
                    thumbnail: selectedCourse.thumbnail || 'teal',
                  });
                  setShowAddCourse(true);
                }}
                className="flex-1 sm:flex-initial h-10 bg-steel hover:bg-[#2d4a70] text-white font-semibold text-xs px-4 rounded-lg border border-steel flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>EDIT</span>
              </button>
              <button
                onClick={() => handleDeleteCourse(selectedCourse.id)}
                className="flex-1 sm:flex-initial h-10 bg-white hover:bg-error-bg text-error font-semibold text-xs px-4 rounded-lg border border-stroke flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>DELETE</span>
              </button>
            </div>
          </div>

          {showAddCourse && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="border-t border-stroke pt-4"
              >
                <h4 className="font-semibold text-text text-sm mb-4">Modify Course</h4>
                <form onSubmit={handleSaveCourse} className="space-y-4">
                  <div>
                    <label
                      htmlFor="course-settings-title"
                      className="block text-[11px] font-bold uppercase text-text-3 mb-1.5 font-mono"
                    >
                      Course Title:
                    </label>
                    <input
                      id="course-settings-title"
                      type="text"
                      required
                      value={courseForm.title}
                      onChange={(e) => setCourseForm((c) => ({ ...c, title: e.target.value }))}
                      className="w-full p-3 border-[1.5px] border-stroke rounded-lg text-sm text-text outline-none focus:border-steel focus:ring-2 focus:ring-steel/10 transition-all font-medium bg-white"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="course-settings-description"
                      className="block text-[11px] font-bold uppercase text-text-3 mb-1.5 font-mono"
                    >
                      Short Description / Summary:
                    </label>
                    <textarea
                      id="course-settings-description"
                      required
                      value={courseForm.description}
                      onChange={(e) => setCourseForm((c) => ({ ...c, description: e.target.value }))}
                      className="w-full p-3 border-[1.5px] border-stroke rounded-lg text-sm text-text-2 h-24 outline-none focus:border-steel focus:ring-2 focus:ring-steel/10 transition-all leading-relaxed"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-grow h-11 bg-steel hover:bg-[#2d4a70] font-semibold text-white text-[13px] rounded-lg transition-all shadow-sm active:scale-95 border border-steel cursor-pointer"
                    >
                      SAVE CHANGES
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddCourse(false)}
                      className="w-28 h-11 bg-white hover:bg-canvas text-text-2 font-semibold text-[13px] rounded-lg border border-stroke transition-all active:scale-95 cursor-pointer"
                    >
                      CANCEL
                    </button>
                  </div>
                </form>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}

      {/* Certificate Configuration */}
      {courseSubTab === 'settings' && selectedCourse && (
        <div className="bg-white border border-stroke p-6 rounded-xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-ochre"></div>
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-5 h-5 text-ochre" />
            <h3 className="text-lg font-display font-bold text-text tracking-tight">Certificate Configuration</h3>
          </div>

          {certLoading ? (
            <p className="text-text-3 text-sm">Loading certificate settings...</p>
          ) : certConfig ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={certConfig.enabled}
                    onChange={(e) => setCertConfig({ ...certConfig, enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-steel/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-30 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-steel"></div>
                </label>
                <span className="text-sm font-medium text-text">Enable Certificate</span>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-text-3 mb-1.5 font-mono">
                  Certificate Title
                </label>
                <input
                  type="text"
                  value={certConfig.title}
                  onChange={(e) => setCertConfig({ ...certConfig, title: e.target.value })}
                  className="w-full p-3 border-[1.5px] border-stroke rounded-lg text-sm text-text outline-none focus:border-steel focus:ring-2 focus:ring-steel/10 transition-all font-medium bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-text-3 mb-1.5 font-mono">Issuer</label>
                <input
                  type="text"
                  value={certConfig.issuer}
                  onChange={(e) => setCertConfig({ ...certConfig, issuer: e.target.value })}
                  className="w-full p-3 border-[1.5px] border-stroke rounded-lg text-sm text-text outline-none focus:border-steel focus:ring-2 focus:ring-steel/10 transition-all font-medium bg-white"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={certConfig.requireCourseCompletion}
                    onChange={(e) => setCertConfig({ ...certConfig, requireCourseCompletion: e.target.checked })}
                    id="req-completion"
                    className="w-4 h-4 text-steel bg-gray-100 border-gray-300 rounded focus:ring-steel focus:ring-2"
                  />
                  <label htmlFor="req-completion" className="text-sm text-text">
                    Require course completion
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={certConfig.requireAssessment}
                    onChange={(e) => setCertConfig({ ...certConfig, requireAssessment: e.target.checked })}
                    id="req-assessment"
                    className="w-4 h-4 text-steel bg-gray-100 border-gray-300 rounded focus:ring-steel focus:ring-2"
                  />
                  <label htmlFor="req-assessment" className="text-sm text-text">
                    Require assessment
                  </label>
                </div>
              </div>

              {certConfig.requireAssessment && (
                <div>
                  <label className="block text-[11px] font-bold uppercase text-text-3 mb-1.5 font-mono">
                    Minimum Assessment Score (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={certConfig.minAssessmentScore ?? ''}
                    onChange={(e) =>
                      setCertConfig({
                        ...certConfig,
                        minAssessmentScore: e.target.value === '' ? null : parseInt(e.target.value),
                      })
                    }
                    placeholder="Default: 70"
                    className="w-full p-3 border-[1.5px] border-stroke rounded-lg text-sm text-text outline-none focus:border-steel focus:ring-2 focus:ring-steel/10 transition-all font-medium bg-white"
                  />
                  <p className="text-[11px] text-text-3 mt-1">Leave empty to use default threshold (70%)</p>
                </div>
              )}

              {/* PDF Template Upload Section */}
              <div className="pt-3 border-t border-stroke">
                <label className="block text-[11px] font-bold uppercase text-text-3 mb-1.5 font-mono">
                  Custom Certificate Template (PDF)
                </label>
                <p className="text-xs text-text-3 mb-3">
                  Upload an existing PDF copy or template from your machine. The learner's name, course title,
                  verification code, and issue date will be stamped automatically when issued.
                </p>

                {templateMsg && (
                  <div
                    className={`p-3 rounded-lg text-xs font-medium mb-3 flex items-center gap-2 ${
                      templateMsg.type === 'success'
                        ? 'bg-success/10 text-success border border-success/30'
                        : 'bg-error/10 text-error border border-error/30'
                    }`}
                  >
                    {templateMsg.type === 'success' ? (
                      <Check className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{templateMsg.text}</span>
                  </div>
                )}

                {certConfig.templateFileName ? (
                  <div className="flex items-center justify-between p-3.5 bg-paper-2 border border-stroke rounded-xl">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-steel/10 text-steel flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text truncate">{certConfig.templateFileName}</p>
                        <p className="text-[11px] text-text-3 font-mono">Custom PDF template active</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <label className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-stroke hover:bg-white text-text cursor-pointer transition-all">
                        {uploadingTemplate ? 'Replacing...' : 'Replace'}
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          onChange={handleTemplateFileSelect}
                          disabled={uploadingTemplate}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handleRemoveTemplate}
                        disabled={uploadingTemplate}
                        title="Remove Template"
                        className="p-1.5 text-error hover:bg-error/10 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="border-2 border-dashed border-stroke hover:border-steel/50 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition-all bg-paper-2 hover:bg-white group">
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={handleTemplateFileSelect}
                        disabled={uploadingTemplate}
                        className="hidden"
                      />
                      <Upload className="w-6 h-6 text-text-3 group-hover:text-steel mb-2 transition-colors" />
                      <span className="text-xs font-semibold text-text group-hover:text-steel transition-colors">
                        {uploadingTemplate ? 'Uploading PDF...' : 'Click or drop a PDF certificate copy here'}
                      </span>
                      <span className="text-[10px] text-text-3 mt-0.5">Supports PDF up to 10MB</span>
                    </label>
                    <p className="text-[11px] text-text-3 mt-1.5 italic">
                      No custom template uploaded — the platform will generate an elegant styled certificate
                      automatically.
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={handleSaveCertConfig}
                disabled={certSaving}
                className="h-10 bg-ochre hover:bg-ochre/90 text-white font-semibold text-xs px-6 rounded-lg transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {certSaving ? 'Saving...' : 'Save Certificate Settings'}
              </button>
            </div>
          ) : (
            <p className="text-text-3 text-sm">Unable to load certificate configuration.</p>
          )}
        </div>
      )}
    </div>
  );
};
