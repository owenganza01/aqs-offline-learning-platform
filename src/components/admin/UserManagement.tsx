// src/components/admin/UserManagement.tsx
import React, { useState, useEffect } from 'react';
import { User } from '../../types.js';
import { apiFetch } from '../../lib/api.js';
import { Users, UserPlus, Shield, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';

interface UserManagementProps {
  token: string | null;
  currentUserId?: number;
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-rose-100 text-rose-700 border-rose-200',
  instructor: 'bg-steel-lt text-steel border-steel/30',
  learner: 'bg-[#E8F4EC] text-success border-success/30',
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

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Users className="w-5 h-5 text-steel" />
        <h2 className="text-lg font-display font-bold tracking-tight text-text">Manage users</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: User list */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-stroke rounded-xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-stroke flex items-center justify-between">
              <span className="text-sm font-semibold text-text">
                {users.length} user{users.length !== 1 ? 's' : ''}
              </span>
              <button onClick={loadUsers} className="text-text-3 hover:text-text cursor-pointer" title="Refresh">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            {loading ? (
              <div className="p-8 text-center text-text-3 text-sm">Loading users...</div>
            ) : (
              <div className="divide-y divide-stroke">
                {users.map((user) => (
                  <div key={user.id} className="px-6 py-3 flex items-center gap-4 hover:bg-canvas transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
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
                      </div>
                      <span className="text-xs text-text-3 truncate block">{user.email}</span>
                    </div>
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
                ))}
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
    </div>
  );
};
