// src/components/InstructorSettings.tsx
import React, { useState } from 'react';
import { User } from '../types.js';
import { ProfileEditModal } from './ProfileEditModal.js';
import { Settings, Mail, Building2, AlignLeft, UserRound, Pencil } from 'lucide-react';
import { motion } from 'motion/react';

interface InstructorSettingsProps {
  user: User | null;
  token: string | null;
  onProfileUpdated?: () => void;
}

export const InstructorSettings: React.FC<InstructorSettingsProps> = ({ user, token, onProfileUpdated }) => {
  const [showEdit, setShowEdit] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-2xl space-y-6 font-sans"
      id="instructor-settings"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stroke pb-5">
        <div>
          <h3 className="text-lg font-display font-bold text-text tracking-tight flex items-center gap-2">
            <Settings className="w-5 h-5 text-steel" />
            <span>Settings</span>
          </h3>
          <p className="text-xs text-text-3 mt-1 font-medium">Manage your instructor profile and account details.</p>
        </div>
      </div>

      <div className="bg-white border border-stroke rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-steel-lt text-steel flex items-center justify-center font-bold text-xl shrink-0 border border-steel/20">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <span>{(user?.name || user?.email || 'I').slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-base font-display font-bold text-text">{user?.name || 'Instructor'}</h4>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-steel bg-steel-lt border border-steel/20 rounded-full px-2 py-0.5">
                <UserRound className="w-3 h-3" />
                Instructor
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[13px] text-text-3 mt-1">
              <Mail className="w-3.5 h-3.5" />
              <span className="truncate">{user?.email || '—'}</span>
            </div>
            {user?.organization && (
              <div className="flex items-center gap-1.5 text-[13px] text-text-3 mt-1">
                <Building2 className="w-3.5 h-3.5" />
                <span>{user.organization}</span>
              </div>
            )}
            {user?.bio && (
              <div className="flex items-start gap-1.5 text-[13px] text-text-3 mt-1">
                <AlignLeft className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{user.bio}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-stroke flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[12px] text-text-3 font-medium">
            Update your display name and avatar photo. These appear to learners in course and messaging views.
          </p>
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-steel hover:bg-[#2d4a70] text-white font-semibold text-xs rounded-lg shadow-md transition-all hover:shadow-lg active:scale-95 border border-steel cursor-pointer"
          >
            <Pencil className="w-4 h-4" />
            <span>EDIT PROFILE</span>
          </button>
        </div>
      </div>

      {showEdit && (
        <ProfileEditModal
          user={user}
          token={token}
          onClose={() => setShowEdit(false)}
          onProfileUpdated={() => {
            setShowEdit(false);
            onProfileUpdated?.();
          }}
        />
      )}
    </motion.div>
  );
};

export default InstructorSettings;
