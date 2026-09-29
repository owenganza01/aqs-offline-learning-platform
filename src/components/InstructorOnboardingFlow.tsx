// src/components/InstructorOnboardingFlow.tsx
import { useState, type FormEvent } from 'react';
import { User } from '../types.js';
import { apiFetch } from '../lib/api.js';
import {
  GraduationCap,
  Loader2,
  Send,
  Clock,
  XCircle,
  RefreshCw,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';

interface InstructorOnboardingFlowProps {
  user: User | null;
  token: string | null;
  onContinueAsLearner: () => void;
  onProfileUpdated: () => void;
}

function formatDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function InstructorOnboardingFlow({
  user,
  token,
  onContinueAsLearner,
  onProfileUpdated,
}: InstructorOnboardingFlowProps) {
  const [name, setName] = useState(user?.name || '');
  const [organization, setOrganization] = useState(user?.organization || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [submitting, setSubmitting] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [error, setError] = useState('');

  const status = user?.onboardingStatus || 'onboarding';

  if (status === 'pending_approval') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center bg-appbg text-ink px-4 py-16">
        <div className="max-w-md w-full bg-paper border border-rule rounded-3xl shadow-lg relative overflow-hidden text-center">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-ochre" />
          <div className="p-8 sm:p-9">
            <div className="bg-paper-2 border border-rule w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-5 shadow-xs text-ochre">
              <Clock className="w-8 h-8 text-ochre" />
            </div>
            <h1 className="font-display text-2xl font-bold text-ink tracking-tight">Under Review</h1>
            <p className="mt-1.5 text-sm text-ink-2 font-medium">{user?.name || user?.email}</p>

            <div className="mt-6 bg-paper-2 border border-rule rounded-xl p-5 text-left">
              <p className="text-sm text-ink-2 leading-relaxed">
                Your instructor request was submitted on{' '}
                <span className="font-bold text-ink">{formatDate(user?.submittedAt)}</span>. An administrator will
                review it soon. You&apos;ll be notified once approved.
              </p>
            </div>

            <button
              type="button"
              onClick={onContinueAsLearner}
              className="mt-8 w-full h-11 bg-ochre hover:bg-ochre/90 active:scale-[0.98] text-white font-bold text-sm rounded-xl transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2"
            >
              <GraduationCap className="w-4 h-4" />
              <span>Continue as a Learner</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center bg-appbg text-ink px-4 py-16">
        <div className="max-w-md w-full bg-paper border border-rule rounded-3xl shadow-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-error" />
          <div className="p-8 sm:p-9 text-center">
            <div className="bg-error-bg border border-error/20 w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-5 shadow-xs text-error">
              <XCircle className="w-8 h-8 text-error" />
            </div>
            <h1 className="font-display text-2xl font-bold text-ink tracking-tight">Application Not Approved</h1>
            <p className="mt-1.5 text-sm text-ink-2 font-medium">{user?.name || user?.email}</p>

            <div className="mt-6 bg-error-bg border border-error/20 rounded-xl p-5 text-left" role="alert">
              <p className="text-xs font-bold uppercase tracking-wider text-error mb-1.5">Reason</p>
              <p className="text-sm text-ink-2 leading-relaxed">{user?.rejectionReason || 'No reason was provided.'}</p>
            </div>

            <div className="mt-8 space-y-3">
              <button
                type="button"
                disabled={reopening}
                onClick={async () => {
                  setReopening(true);
                  setError('');
                  try {
                    const { ok, data } = await apiFetch('/api/instructor/onboard/reopen', { method: 'PUT' });
                    if (ok) {
                      onProfileUpdated();
                    } else {
                      setError(data?.error || 'Failed to reopen your application. Please try again.');
                    }
                  } catch {
                    setError('Network error — please try again.');
                  } finally {
                    setReopening(false);
                  }
                }}
                className="w-full h-11 bg-navy hover:bg-navy-2 active:scale-[0.98] text-white font-bold text-sm rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {reopening ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span>Edit and Resubmit</span>
              </button>

              <button
                type="button"
                onClick={onContinueAsLearner}
                className="w-full h-11 border border-rule bg-paper-2 hover:bg-paper active:scale-[0.98] text-ink font-bold text-sm rounded-xl transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2"
              >
                <GraduationCap className="w-4 h-4" />
                <span>Continue as a Learner</span>
              </button>
            </div>

            {error && (
              <p className="mt-4 text-xs font-semibold text-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // status === 'onboarding' (or unknown) — profile form
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !bio.trim()) return;

    setSubmitting(true);
    setError('');
    try {
      const { ok, data } = await apiFetch('/api/instructor/onboard', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          bio: bio.trim(),
          organization: organization.trim() || undefined,
        }),
      });
      if (ok) {
        onProfileUpdated();
      } else {
        setError(data?.error || 'Failed to submit your profile. Please try again.');
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-appbg text-ink px-4 py-16">
      <div className="max-w-md w-full bg-paper border border-rule rounded-3xl shadow-lg relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-ochre" />

        <div className="p-8 sm:p-9">
          <div className="flex items-center gap-3">
            <div className="bg-paper-2 border border-rule w-14 h-14 rounded-2xl flex items-center justify-center shadow-xs text-ochre shrink-0">
              <Sparkles className="w-7 h-7 text-ochre" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-ink tracking-tight">Instructor Onboarding</h1>
              <p className="text-xs text-ink-2 font-medium mt-0.5">Complete a few details to get started.</p>
            </div>
          </div>

          <p className="mt-6 text-sm text-ink-2 leading-relaxed">
            Tell us about yourself. An administrator will review your profile before you can access the Instructor
            Portal.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="instructor-onboard-name"
                className="block text-[10px] font-bold uppercase text-ink-3 mb-1.5 font-mono"
              >
                Full Name <span className="text-error">*</span>
              </label>
              <input
                id="instructor-onboard-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Amina Diallo"
                className="w-full h-11 px-4 rounded-xl border border-rule bg-paper text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-ochre/30 focus:border-ochre"
              />
            </div>

            <div>
              <label
                htmlFor="instructor-onboard-org"
                className="block text-[10px] font-bold uppercase text-ink-3 mb-1.5 font-mono"
              >
                Organization <span className="text-ink-3/60 font-medium">(optional)</span>
              </label>
              <input
                id="instructor-onboard-org"
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="e.g. University of Nairobi"
                className="w-full h-11 px-4 rounded-xl border border-rule bg-paper text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-ochre/30 focus:border-ochre"
              />
            </div>

            <div>
              <label
                htmlFor="instructor-onboard-bio"
                className="block text-[10px] font-bold uppercase text-ink-3 mb-1.5 font-mono"
              >
                Bio <span className="text-error">*</span>
              </label>
              <textarea
                id="instructor-onboard-bio"
                required
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                placeholder="Tell us about your teaching experience and the courses you plan to create."
                className="w-full px-4 py-3 rounded-xl border border-rule bg-paper text-sm text-ink placeholder:text-ink-3 resize-none focus:outline-none focus:ring-2 focus:ring-ochre/30 focus:border-ochre"
              />
            </div>

            {error && (
              <p className="text-xs font-semibold text-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !bio.trim() || !name.trim()}
              className="w-full h-11 bg-ochre hover:bg-ochre/90 active:scale-[0.98] disabled:bg-ink-3/40 disabled:text-white/60 text-white font-bold text-sm rounded-xl transition-all shadow-sm cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>{submitting ? 'Submitting...' : 'Submit for Review'}</span>
            </button>

            <div className="pt-2 border-t border-rule flex items-start gap-2.5 pt-4">
              <ShieldCheck className="w-4 h-4 text-success shrink-0 mt-0.5" />
              <p className="text-[11px] text-ink-3 leading-relaxed">
                You can still use the learner dashboard while your review is in progress.
              </p>
            </div>

            <button
              type="button"
              onClick={onContinueAsLearner}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-ink-3 hover:text-ink underline cursor-pointer py-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Continue as a Learner</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
