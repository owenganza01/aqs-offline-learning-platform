import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api.ts';
import { Users, Plus, RefreshCw, Copy, AlertCircle, CheckCircle } from 'lucide-react';

interface Cohort {
  id: number;
  instructorId: number;
  name: string;
  inviteCode: string;
  createdAt: string;
  memberCount: number;
}

interface CohortManagerProps {
  token: string | null;
}

export const CohortManager: React.FC<CohortManagerProps> = ({ token }) => {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [formName, setFormName] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [regenerating, setRegenerating] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const loadCohorts = async () => {
    if (!token) return;
    try {
      const { ok, data } = await apiFetch<Cohort[]>('/api/instructor/cohorts');
      if (ok && data) {
        setCohorts(data);
      }
    } catch {
      console.error('Failed to load cohorts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      setTimeout(() => loadCohorts(), 0);
    }
  }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !formName.trim()) return;
    setSubmitting(true);
    setFormError('');
    setFormSuccess('');
    try {
      const { ok, data } = await apiFetch('/api/instructor/cohorts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim() }),
      });
      if (ok) {
        setCohorts((prev) => [...prev, data]);
        setFormSuccess('Cohort created!');
        setFormName('');
      } else {
        setFormError(data?.error || 'Failed to create cohort');
      }
    } catch (err) {
      setFormError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegenerate = async (cohortId: number) => {
    if (!token) return;
    if (!window.confirm('Regenerate invite code? The old code will stop working immediately.')) return;
    setRegenerating(cohortId);
    try {
      const { ok, data } = await apiFetch(`/api/instructor/cohorts/${cohortId}/regenerate-code`, {
        method: 'POST',
      });
      if (ok) {
        setCohorts((prev) => prev.map((c) => (c.id === cohortId ? { ...c, inviteCode: data.inviteCode } : c)));
      } else {
        alert(data?.error || 'Failed to regenerate code');
      }
    } catch (_err) {
      console.error('Regenerate failed:', _err);
    } finally {
      setRegenerating(null);
    }
  };

  const handleCopyCode = async (code: string, id: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback: select the text manually
    }
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return d;
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Users className="w-5 h-5 text-pink-500" />
        <h2 className="text-lg font-black tracking-tight text-slate-900">My Cohorts</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Cohort list */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-700">
                {cohorts.length} cohort{cohorts.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={loadCohorts}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-sm">Loading cohorts...</div>
            ) : cohorts.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">No cohorts yet. Create your first one.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {cohorts.map((cohort) => (
                  <div key={cohort.id} className="px-6 py-5 space-y-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-slate-800">{cohort.name}</h3>
                        <span className="text-xs text-slate-500 font-medium">
                          {cohort.memberCount} member{cohort.memberCount !== 1 ? 's' : ''} · Created{' '}
                          {formatDate(cohort.createdAt)}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRegenerate(cohort.id)}
                        disabled={regenerating === cohort.id}
                        className="text-[10px] font-bold text-amber-600 hover:text-amber-500 underline uppercase cursor-pointer disabled:opacity-50"
                      >
                        {regenerating === cohort.id ? 'Regenerating...' : 'Regenerate Code'}
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="bg-slate-100 border border-slate-200 rounded-xl px-5 py-3 flex-1 flex items-center justify-between">
                        <span className="text-2xl font-bold font-mono tracking-[0.25em] text-slate-800 select-all">
                          {cohort.inviteCode}
                        </span>
                        <button
                          onClick={() => handleCopyCode(cohort.inviteCode, cohort.id)}
                          className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                          title="Copy code"
                        >
                          {copiedId === cohort.id ? (
                            <CheckCircle className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <Copy className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Create cohort form */}
        <div className="lg:col-span-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 lg:sticky lg:top-6">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-black text-slate-800">Create Cohort</h3>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Create a class group with a unique invite code for students to join.
            </p>

            {formSuccess && (
              <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-700">
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{formSuccess}</span>
              </div>
            )}
            {formError && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cohort Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Maths 101 — Morning Batch"
                  className="mt-1 w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !formName.trim()}
                className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {submitting ? 'Creating...' : 'Create Cohort'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
