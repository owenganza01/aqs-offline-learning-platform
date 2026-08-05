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
        <Users className="w-5 h-5 text-steel" />
        <h2 className="text-lg font-display font-bold tracking-tight text-text">Cohorts</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Cohort list */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-stroke rounded-xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-stroke flex items-center justify-between">
              <span className="text-sm font-semibold text-text">
                {cohorts.length} cohort{cohorts.length !== 1 ? 's' : ''}
              </span>
              <button onClick={loadCohorts} className="text-text-3 hover:text-text cursor-pointer" title="Refresh">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            {loading ? (
              <div className="p-8 text-center text-text-3 text-sm">Loading cohorts...</div>
            ) : cohorts.length === 0 ? (
              <div className="p-8 text-center text-text-3 text-sm">No cohorts yet. Create your first one.</div>
            ) : (
              <div className="divide-y divide-stroke">
                {cohorts.map((cohort) => (
                  <div key={cohort.id} className="px-6 py-5 space-y-3 hover:bg-canvas transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-text">{cohort.name}</h3>
                        <span className="text-xs text-text-3 font-medium">
                          {cohort.memberCount} member{cohort.memberCount !== 1 ? 's' : ''} · Created{' '}
                          {formatDate(cohort.createdAt)}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRegenerate(cohort.id)}
                        disabled={regenerating === cohort.id}
                        className="text-[10px] font-bold text-warning hover:text-warning/80 underline uppercase cursor-pointer disabled:opacity-50"
                      >
                        {regenerating === cohort.id ? 'Regenerating...' : 'Regenerate Code'}
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="bg-canvas border border-stroke rounded-xl px-5 py-3 flex-1 flex items-center justify-between">
                        <span className="text-2xl font-bold font-mono tracking-[0.25em] text-text select-all">
                          {cohort.inviteCode}
                        </span>
                        <button
                          onClick={() => handleCopyCode(cohort.inviteCode, cohort.id)}
                          className="text-text-3 hover:text-text cursor-pointer p-1"
                          title="Copy code"
                        >
                          {copiedId === cohort.id ? (
                            <CheckCircle className="w-5 h-5 text-success" />
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
          <div className="bg-white border border-stroke rounded-xl p-6 space-y-5 lg:sticky lg:top-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-steel" />
              <h3 className="text-sm font-display font-bold text-text">Create Cohort</h3>
            </div>
            <p className="text-[11px] text-text-3 leading-relaxed">
              Create a class group with a unique invite code for students to join.
            </p>

            {formSuccess && (
              <div className="flex items-start gap-2 bg-success/10 border border-success/30 rounded-xl p-3 text-xs text-success">
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{formSuccess}</span>
              </div>
            )}
            {formError && (
              <div className="flex items-start gap-2 bg-error-bg border border-error/30 rounded-xl p-3 text-xs text-error">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label htmlFor="new-cohort-name" className="text-[10px] font-bold text-text-3 uppercase tracking-wider">
                  Cohort Name
                </label>
                <input
                  id="new-cohort-name"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Maths 101 — Morning Batch"
                  className="mt-1 w-full h-10 px-3 bg-white border-[1.5px] border-stroke rounded-lg text-sm text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-steel/10 focus:border-steel"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !formName.trim()}
                className="w-full h-10 bg-steel hover:bg-[#2d4a70] text-white text-sm font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
