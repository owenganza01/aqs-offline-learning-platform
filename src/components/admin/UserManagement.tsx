// src/components/admin/UserManagement.tsx
import React, { useState, useEffect } from 'react';
import { User } from '../../types.js';
import { apiFetch } from '../../lib/api.js';
import {
  Users,
  UserPlus,
  Shield,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Loader2,
  UserX,
} from 'lucide-react';

interface UserManagementProps {
  token: string | null;
  currentUserId?: number;
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-rose-100 text-rose-700 border-rose-200',
  instructor: 'bg-steel-lt text-steel border-steel/30',
  learner: 'bg-[#E8F4EC] text-success border-success/30',
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending_approval: {
    label: 'Pending Approval',
    className: 'bg-[#FDF3E0] text-warning border-warning/30',
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-error-bg text-error border-error/30',
  },
  onboarding: {
    label: 'Onboarding',
    className: 'bg-steel-lt text-steel border-steel/30',
  },
  active: {
    label: 'Active',
    className: 'bg-success/10 text-success border-success/30',
  },
};

export const UserManagement: React.FC<UserManagementProps> = ({ token, currentUserId }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [roleUpdating, setRoleUpdating] = useState<number | null>(null);
  const [actingOn, setActingOn] = useState<number | null>(null);
  const [declineTarget, setDeclineTarget] = useState<User | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [declineError, setDeclineError] = useState('');
  const [closeTarget, setCloseTarget] = useState<User | null>(null);
  const [closeRetentionDays, setCloseRetentionDays] = useState(14);
  const [closeReason, setCloseReason] = useState('');
  const [closeError, setCloseError] = useState('');

  const loadUsers = async () => {
    if (!token) return;
    try {
      const { ok, data } = await apiFetch<User[]>('/api/admin/users');
      if (ok && data) {
        setUsers(data);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      setTimeout(() => loadUsers(), 0);
    }
  }, [token]);

  const handleRoleChange = async (userId: number, newRole: string) => {
    if (!token) return;
    setRoleUpdating(userId);
    try {
      const { ok, data } = await apiFetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (ok) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole as User['role'] } : u)));
      } else {
        alert(data?.error || 'Failed to change role');
        loadUsers();
      }
    } catch (err) {
      console.error('Role change failed:', err);
      loadUsers();
    } finally {
      setRoleUpdating(null);
    }
  };

  const handleCreateInstructor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !formName.trim() || !formEmail.trim()) return;

    setSubmitting(true);
    setFormError('');
    setFormSuccess('');

    try {
      const { ok, data } = await apiFetch('/api/admin/instructors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim(), email: formEmail.trim().toLowerCase() }),
      });
      if (ok) {
        setFormSuccess(
          `Instructor "${formName}" created. They will receive a pending invitation — sign in with Google to activate.`,
        );
        setFormName('');
        setFormEmail('');
        loadUsers();
      } else {
        setFormError(data?.error || 'Failed to create instructor');
      }
    } catch (err) {
      setFormError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (user: User) => {
    if (!token) return;
    setActingOn(user.id);
    try {
      const { ok, data } = await apiFetch(`/api/admin/users/${user.id}/approve`, { method: 'PUT' });
      if (ok) {
        const updated = data?.dbUser as User | undefined;
        setUsers((prev) => prev.map((u) => (u.id === user.id ? (updated ?? { ...u, onboardingStatus: 'active' }) : u)));
      } else {
        alert(data?.error || 'Failed to approve instructor');
        loadUsers();
      }
    } catch (err) {
      console.error('Approve failed:', err);
      loadUsers();
    } finally {
      setActingOn(null);
    }
  };

  const openDecline = (user: User) => {
    setDeclineTarget(user);
    setDeclineReason('');
    setDeclineError('');
  };

  const submitDecline = async () => {
    if (!token || !declineTarget) return;
    if (!declineReason.trim()) {
      setDeclineError('Please enter a reason before declining.');
      return;
    }

    setActingOn(declineTarget.id);
    setDeclineError('');
    try {
      const { ok, data } = await apiFetch(`/api/admin/users/${declineTarget.id}/decline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: declineReason.trim() }),
      });
      if (ok) {
        const updated = data?.dbUser as User | undefined;
        setUsers((prev) =>
          prev.map((u) => (u.id === declineTarget.id ? (updated ?? { ...u, onboardingStatus: 'rejected' }) : u)),
        );
        setDeclineTarget(null);
      } else {
        setDeclineError(data?.error || 'Failed to decline instructor');
      }
    } catch (err) {
      console.error('Decline failed:', err);
      setDeclineError('Network error — please try again');
    } finally {
      setActingOn(null);
    }
  };

  const openClose = (user: User) => {
    setCloseTarget(user);
    setCloseRetentionDays(14);
    setCloseReason('');
    setCloseError('');
  };

  const submitClose = async () => {
    if (!token || !closeTarget) return;

    setActingOn(closeTarget.id);
    setCloseError('');
    try {
      const { ok, data } = await apiFetch(`/api/admin/users/${closeTarget.id}/close-initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retentionDays: closeRetentionDays,
          reason: closeReason.trim() || undefined,
        }),
      });
      if (ok) {
        const updated = data?.dbUser as User | undefined;
        if (updated) {
          setUsers((prev) => prev.map((u) => (u.id === closeTarget.id ? updated : u)));
        } else {
          loadUsers();
        }
        setCloseTarget(null);
      } else {
        setCloseError(data?.error || 'Failed to initiate closure');
      }
    } catch (err) {
      console.error('Close account failed:', err);
      setCloseError('Network error — please try again');
    } finally {
      setActingOn(null);
    }
  };

  const activeUsers = users.filter((u) => u.onboardingStatus === 'active');

  // Instructors in the application pipeline (not yet an active user):
  // onboarding (profile not submitted), pending_approval (awaiting review),
  // or rejected. Shown in the Instructor Applications queue only, never in
  // the active Users list.
  const instructorApplicants = users
    .filter((u) => u.role === 'instructor' && u.onboardingStatus && u.onboardingStatus !== 'active')
    .sort((a, b) => {
      const order: Record<string, number> = { pending_approval: 0, onboarding: 1, rejected: 2 };
      return (order[a.onboardingStatus!] ?? 3) - (order[b.onboardingStatus!] ?? 3);
    });

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Users className="w-5 h-5 text-steel" />
        <h2 className="text-lg font-display font-bold tracking-tight text-text">Manage users</h2>
      </div>

      {/* Instructor applicant review queue */}
      <div className="bg-white border border-stroke rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-stroke flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-steel" />
            <span className="text-sm font-semibold text-text">
              Instructor Applications ({instructorApplicants.length})
            </span>
          </div>
          <button onClick={loadUsers} className="text-text-3 hover:text-text cursor-pointer" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-text-3 text-sm">Loading applicants...</div>
        ) : instructorApplicants.length === 0 ? (
          <div className="p-8 text-center text-text-3 text-sm">
            No instructor applications in the pipeline right now.
          </div>
        ) : (
          <div className="divide-y divide-stroke">
            {instructorApplicants.map((user) => (
              <div key={user.id} className="px-6 py-4 flex items-start gap-4 hover:bg-canvas transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-text truncate">{user.name || 'Unnamed'}</span>
                    {user.onboardingStatus && STATUS_META[user.onboardingStatus] && (
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase border ${STATUS_META[user.onboardingStatus].className}`}
                      >
                        {STATUS_META[user.onboardingStatus].label}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-text-3 truncate block mt-0.5">{user.email}</span>
                  {user.bio && <p className="text-xs text-text-2 leading-relaxed mt-1.5 line-clamp-2">{user.bio}</p>}
                  {user.organization && (
                    <p className="text-[11px] text-text-3 mt-1">Organization: {user.organization}</p>
                  )}
                  {user.submittedAt && (
                    <p className="text-[11px] text-text-3 mt-0.5">
                      Submitted {new Date(user.submittedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {user.onboardingStatus === 'pending_approval' && (
                    <>
                      <button
                        type="button"
                        disabled={actingOn === user.id}
                        onClick={() => handleApprove(user)}
                        className="inline-flex items-center gap-1.5 h-9 px-3 bg-success hover:opacity-90 text-white text-xs font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {actingOn === user.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle className="w-3.5 h-3.5" />
                        )}
                        <span>Approve</span>
                      </button>
                      <button
                        type="button"
                        disabled={actingOn === user.id}
                        onClick={() => openDecline(user)}
                        className="inline-flex items-center gap-1.5 h-9 px-3 bg-error-bg hover:bg-error/20 text-error text-xs font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Decline</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: User list */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-stroke rounded-xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-stroke flex items-center justify-between">
              <span className="text-sm font-semibold text-text">
                {activeUsers.length} active user{activeUsers.length !== 1 ? 's' : ''}
              </span>
              <button onClick={loadUsers} className="text-text-3 hover:text-text cursor-pointer" title="Refresh">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            {loading ? (
              <div className="p-8 text-center text-text-3 text-sm">Loading users...</div>
            ) : (
              <div className="divide-y divide-stroke">
                {activeUsers.map((user) => {
                  const statusMeta =
                    user.role === 'instructor' && user.onboardingStatus
                      ? STATUS_META[user.onboardingStatus]
                      : undefined;
                  return (
                    <div key={user.id} className="px-6 py-3 flex items-center gap-4 hover:bg-canvas transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-text truncate">{user.name || 'Unnamed'}</span>
                          {user.id === currentUserId && (
                            <span className="text-[9px] font-bold bg-steel-lt text-steel px-1.5 py-0.5 rounded-full uppercase">
                              You
                            </span>
                          )}
                          {user.uid.startsWith('pending-') && (
                            <span className="text-[9px] font-bold bg-[#F3ECDC] text-warning px-1.5 py-0.5 rounded-full uppercase">
                              Pending
                            </span>
                          )}
                          {statusMeta && user.onboardingStatus !== 'active' && (
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase border ${statusMeta.className}`}
                            >
                              {statusMeta.label}
                            </span>
                          )}
                          {user.closureStatus === 'pending' && (
                            <span className="text-[9px] font-bold bg-[#FDF3E0] text-warning border border-warning/30 px-1.5 py-0.5 rounded-full uppercase">
                              Closing
                              {user.closureDeadline &&
                                ` · until ${new Date(user.closureDeadline).toLocaleDateString()}`}
                            </span>
                          )}
                          {user.closureStatus === 'closed' && (
                            <span className="text-[9px] font-bold bg-error-bg text-error border border-error/30 px-1.5 py-0.5 rounded-full uppercase">
                              Closed
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-text-3 truncate block">{user.email}</span>
                      </div>
                      {user.role === 'instructor' && !user.closureEffective && user.id !== currentUserId && (
                        <button
                          type="button"
                          disabled={actingOn === user.id}
                          onClick={() => openClose(user)}
                          title="Close instructor account"
                          className="inline-flex items-center gap-1.5 h-9 px-3 bg-error-bg hover:bg-error/20 text-error text-xs font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>Close</span>
                        </button>
                      )}
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        disabled={user.id === currentUserId || roleUpdating === user.id}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${ROLE_COLORS[user.role] || ROLE_COLORS.learner}`}
                      >
                        <option value="learner">Learner</option>
                        <option value="instructor">Instructor</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Add instructor form */}
        <div className="lg:col-span-4">
          <div className="bg-white border border-stroke rounded-xl p-6 space-y-5 lg:sticky lg:top-6 shadow-sm">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-steel" />
              <h3 className="text-sm font-display font-bold text-text">Add Instructor</h3>
            </div>
            <p className="text-[11px] text-text-3 leading-relaxed">
              Creates a pending account. The instructor must sign in with Google using this email to activate their
              account.
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

            <form onSubmit={handleCreateInstructor} className="space-y-3">
              <div>
                <label
                  htmlFor="new-instructor-name"
                  className="text-[10px] font-bold text-text-3 uppercase tracking-wider"
                >
                  Name
                </label>
                <input
                  id="new-instructor-name"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Dr. Smith"
                  className="mt-1 w-full h-10 px-3 bg-white border-[1.5px] border-stroke rounded-lg text-sm text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-steel/10 focus:border-steel"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="new-instructor-email"
                  className="text-[10px] font-bold text-text-3 uppercase tracking-wider"
                >
                  Email
                </label>
                <input
                  id="new-instructor-email"
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="instructor@school.edu"
                  className="mt-1 w-full h-10 px-3 bg-white border-[1.5px] border-stroke rounded-lg text-sm text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-steel/10 focus:border-steel"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !formName.trim() || !formEmail.trim()}
                className="w-full h-10 bg-steel hover:bg-[#2d4a70] text-white text-sm font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {submitting ? 'Creating...' : 'Create Instructor'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Decline reason modal */}
      {declineTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="decline-modal-title"
        >
          <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={() => setDeclineTarget(null)} />
          <div className="bg-white border border-stroke rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative z-10 p-6">
            <h3 id="decline-modal-title" className="text-lg font-display font-bold text-text tracking-tight">
              Decline Application
            </h3>
            <p className="text-xs text-text-3 mt-1 leading-relaxed">
              Let {declineTarget.name || declineTarget.email} know why their instructor application is not approved.
              They will see this message.
            </p>

            <div className="mt-4">
              <label htmlFor="decline-reason" className="text-[10px] font-bold text-text-3 uppercase tracking-wider">
                Reason <span className="text-error">*</span>
              </label>
              <textarea
                id="decline-reason"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={4}
                required
                placeholder="e.g. Teaching credentials could not be verified."
                className="mt-1 w-full px-3 py-2.5 bg-white border-[1.5px] border-stroke rounded-lg text-sm text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-steel/10 focus:border-steel resize-none"
              />
            </div>

            {declineError && (
              <p className="mt-2 text-xs font-semibold text-error" role="alert">
                {declineError}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={submitDecline}
                disabled={actingOn === declineTarget.id}
                className="flex-1 h-10 bg-error hover:opacity-90 text-white text-sm font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer inline-flex items-center justify-center gap-1.5"
              >
                {actingOn === declineTarget.id ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting...
                  </>
                ) : (
                  'Decline & Notify'
                )}
              </button>
              <button
                type="button"
                onClick={() => setDeclineTarget(null)}
                disabled={actingOn === declineTarget.id}
                className="h-10 px-4 bg-paper-2 hover:bg-rule text-text text-sm font-semibold rounded-lg transition-all border border-stroke cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Close instructor account modal */}
      {closeTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="close-modal-title"
        >
          <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={() => setCloseTarget(null)} />
          <div className="bg-white border border-stroke rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative z-10 p-6">
            <h3 id="close-modal-title" className="text-lg font-display font-bold text-text tracking-tight">
              Close Instructor Account
            </h3>
            <p className="text-xs text-text-3 mt-1 leading-relaxed">
              Closing <span className="font-semibold text-text">{closeTarget.name || closeTarget.email}</span> will
              immediately block sign-in, stop new enrollments across their courses, and begin a retention countdown.
              Existing learners keep access until the deadline, then their courses become read-only unless transferred
              to another instructor.
            </p>

            <div className="mt-4">
              <label htmlFor="close-retention" className="text-[10px] font-bold text-text-3 uppercase tracking-wider">
                Content retention period (days)
              </label>
              <input
                id="close-retention"
                type="number"
                min={7}
                max={30}
                step={1}
                value={closeRetentionDays}
                onChange={(e) => setCloseRetentionDays(parseInt(e.target.value) || 14)}
                className="mt-1 w-full h-10 px-3 bg-white border-[1.5px] border-stroke rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-steel/10 focus:border-steel"
              />
              <p className="text-[11px] text-text-3 mt-1">Between 7 and 30 days (default 14).</p>
            </div>

            <div className="mt-3">
              <label htmlFor="close-reason" className="text-[10px] font-bold text-text-3 uppercase tracking-wider">
                Reason <span className="text-text-3">(optional)</span>
              </label>
              <textarea
                id="close-reason"
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                rows={3}
                placeholder="e.g. Instructor left the school."
                className="mt-1 w-full px-3 py-2.5 bg-white border-[1.5px] border-stroke rounded-lg text-sm text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-steel/10 focus:border-steel resize-none"
              />
            </div>

            {closeError && (
              <p className="mt-2 text-xs font-semibold text-error" role="alert">
                {closeError}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={submitClose}
                disabled={actingOn === closeTarget.id}
                className="flex-1 h-10 bg-error hover:opacity-90 text-white text-sm font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer inline-flex items-center justify-center gap-1.5"
              >
                {actingOn === closeTarget.id ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Closing...
                  </>
                ) : (
                  'Close Account'
                )}
              </button>
              <button
                type="button"
                onClick={() => setCloseTarget(null)}
                disabled={actingOn === closeTarget.id}
                className="h-10 px-4 bg-paper-2 hover:bg-rule text-text text-sm font-semibold rounded-lg transition-all border border-stroke cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
