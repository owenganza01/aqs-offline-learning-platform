// src/components/admin/UserManagement.tsx
import React, { useState, useEffect } from 'react';
import { User } from '../../types.ts';
import { apiFetch } from '../../lib/api.ts';
import { Users, UserPlus, Shield, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';

interface UserManagementProps {
  token: string | null;
  currentUserId?: number;
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-rose-100 text-rose-700 border-rose-200',
  instructor: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  learner: 'bg-emerald-100 text-emerald-700 border-emerald-200',
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
        <Users className="w-5 h-5 text-pink-500" />
        <h2 className="text-lg font-black tracking-tight text-slate-900">Manage Users</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: User list */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-700">
                {users.length} user{users.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={loadUsers}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-sm">Loading users...</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {users.map((user) => (
                  <div key={user.id} className="px-6 py-3 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800 truncate">{user.name || 'Unnamed'}</span>
                        {user.id === currentUserId && (
                          <span className="text-[9px] font-bold bg-pink-100 text-pink-600 px-1.5 py-0.5 rounded-full uppercase">
                            You
                          </span>
                        )}
                        {user.uid.startsWith('pending-') && (
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full uppercase">
                            Pending
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 truncate block">{user.email}</span>
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
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 lg:sticky lg:top-6">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-indigo-500" />
              <h3 className="text-sm font-black text-slate-800">Add Instructor</h3>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Creates a pending account. The instructor must sign in with Google using this email to activate their
              account.
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

            <form onSubmit={handleCreateInstructor} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Dr. Smith"
                  className="mt-1 w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="instructor@school.edu"
                  className="mt-1 w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !formName.trim() || !formEmail.trim()}
                className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
