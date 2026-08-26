// src/components/ProfileEditModal.tsx
import React, { useState, useEffect, useRef } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase.js';
import { User } from '../types.js';
import { apiFetch } from '../lib/api.js';
import { X, UploadCloud, Loader2, Check, LogOut } from 'lucide-react';
import { motion } from 'motion/react';

interface ProfileEditModalProps {
  user: User | null;
  token: string | null;
  onClose: () => void;
  onProfileUpdated: () => void;
  onLogout?: () => void;
}

export const ProfileEditModal: React.FC<ProfileEditModalProps> = ({
  user,
  token,
  onClose,
  onProfileUpdated,
  onLogout,
}) => {
  const [nameInput, setNameInput] = useState(user?.name || '');
  const [uploading, setUploading] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user?.name) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNameInput(user.name);
    }
  }, [user]);

  // Dialog focus management: focus the panel on open, close on Escape, restore focus on unmount.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await handleUploadFile(file);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await handleUploadFile(file);
    }
  };

  const handleUploadFile = async (file: File) => {
    if (!user || !token) return;
    if (!file.type.startsWith('image/')) {
      setMsg({ text: 'Please select an image file (PNG/JPG).', error: true });
      return;
    }

    setUploading(true);
    setMsg(null);

    try {
      const fileExtension = file.name.split('.').pop() || 'png';
      const storageRef = ref(storage, `avatars/${user.uid}-${Date.now()}.${fileExtension}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      const { ok, data } = await apiFetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: downloadURL }),
      });

      if (ok) {
        setMsg({ text: 'Photo updated successfully!', error: false });
        onProfileUpdated();
      } else {
        setMsg({ text: data?.error || 'Failed to update photo.', error: true });
      }
    } catch (error: any) {
      console.error('Profile image upload failed:', error);
      setMsg({ text: 'Upload failed. Please check internet.', error: true });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !token || !nameInput.trim()) return;

    setSavingName(true);
    setMsg(null);

    try {
      const { ok, data } = await apiFetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameInput.trim() }),
      });

      if (ok) {
        setMsg({ text: 'Name updated successfully!', error: false });
        onProfileUpdated();
      } else {
        setMsg({ text: data?.error || 'Failed to update name.', error: true });
      }
    } catch (error) {
      console.error('Name update failed:', error);
      setMsg({ text: 'Failed to save name.', error: true });
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop overlay */}
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Dialog Card */}
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-edit-title"
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-paper-2 rounded-2xl border border-rule shadow-2xl w-full max-w-md overflow-hidden relative z-10 p-6 md:p-8"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-6 right-6 p-2 bg-paper hover:bg-rule text-ink-3 hover:text-ink rounded-full cursor-pointer transition-all active:scale-90"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center mb-6">
          <h3 id="profile-edit-title" className="text-xl font-display font-bold text-ink tracking-tight">
            Edit My Profile
          </h3>
          <p className="text-xs font-semibold text-ink-3 mt-1">Personalize your profile</p>
        </div>

        {/* Profile picture editor */}
        <div className="flex flex-col items-center mb-6">
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`group relative w-24 h-24 rounded-full flex items-center justify-center border-3 border-dashed transition-all ${
              dragActive
                ? 'border-ochre bg-ochre-dim/60 scale-102'
                : 'border-rule bg-paper hover:bg-white hover:border-ochre'
            }`}
            style={{ overflow: 'hidden' }}
          >
            {uploading && (
              <div className="absolute inset-0 bg-navy/75 backdrop-blur-[1px] flex flex-col items-center justify-center text-white z-20">
                <Loader2 className="w-5 h-5 animate-spin text-white mb-1" />
                <span className="text-[8px] font-bold tracking-wider font-mono">LOADING...</span>
              </div>
            )}

            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name || 'User profile'}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full bg-accent text-white font-extrabold text-3xl flex items-center justify-center">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : user?.email?.slice(0, 2).toUpperCase()}
              </div>
            )}

            <label
              htmlFor="modal-avatar-file-input"
              className="absolute inset-0 bg-navy/80 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-[9px] font-black tracking-wider cursor-pointer transition-opacity z-10"
            >
              <UploadCloud className="w-4 h-4 text-white mb-1" />
              <span>UPLOAD</span>
            </label>
          </div>

          <input
            type="file"
            id="modal-avatar-file-input"
            className="hidden"
            accept="image/*"
            onChange={handleFileChange}
          />
          <p className="text-[10px] text-ink-3 mt-2 font-semibold">Drag and drop photo or click to upload</p>
        </div>

        {/* Profile Name form */}
        <form onSubmit={handleSaveName} className="space-y-4">
          <div>
            <label htmlFor="profile-name" className="block text-[10px] font-bold uppercase text-ink-3 mb-1.5 font-mono">
              My Full Name:
            </label>
            <input
              id="profile-name"
              type="text"
              required
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="e.g. John Doe"
              className="w-full h-11 px-3.5 bg-paper border border-rule rounded-lg text-ink font-medium text-sm outline-none focus:bg-white focus:ring-2 focus:ring-ochre/25 focus:border-ochre transition-all"
            />
          </div>

          {msg && (
            <div
              className={`p-3 border rounded-lg text-xs font-semibold flex items-center gap-2 ${
                msg.error ? 'bg-error-bg border-error/30 text-error' : 'bg-success/10 border-success/30 text-success'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${msg.error ? 'bg-error' : 'bg-success animate-ping'}`} />
              <p className="truncate">{msg.text}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={savingName || uploading}
              className="h-11 bg-accent hover:opacity-90 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all active:scale-95 flex-grow disabled:opacity-50"
            >
              {savingName ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Check className="w-4 h-4 text-white" />
              )}
              <span>SAVE CHANGES</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-4 bg-paper hover:bg-white text-ink-2 font-bold text-xs rounded-lg cursor-pointer transition-all border border-rule"
            >
              CLOSE
            </button>
          </div>

          {onLogout && (
            <div className="border-t border-rule mt-6 pt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                className="inline-flex items-center gap-2 text-xs font-bold text-error hover:underline cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-error" />
                <span>Sign Out of Account</span>
              </button>
            </div>
          )}
        </form>
      </motion.div>
    </div>
  );
};
