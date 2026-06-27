// src/components/ProfileEditModal.tsx
import React, { useState, useEffect } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase.ts';
import { User } from '../types.ts';
import { X, UploadCloud, Loader2, Check, User as UserIcon } from 'lucide-react';
import { motion } from 'motion/react';

interface ProfileEditModalProps {
  user: User | null;
  token: string | null;
  onClose: () => void;
  onProfileUpdated: () => void;
}

export const ProfileEditModal: React.FC<ProfileEditModalProps> = ({
  user,
  token,
  onClose,
  onProfileUpdated,
}) => {
  const [nameInput, setNameInput] = useState(user?.name || '');
  const [uploading, setUploading] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    if (user?.name) {
      setNameInput(user.name);
    }
  }, [user]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
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
    if (!file.type.startsWith("image/")) {
      setMsg({ text: "Please select an image file (PNG/JPG).", error: true });
      return;
    }

    setUploading(true);
    setMsg(null);

    try {
      const fileExtension = file.name.split('.').pop() || 'png';
      const storageRef = ref(storage, `avatars/${user.uid}-${Date.now()}.${fileExtension}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      const response = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ avatarUrl: downloadURL })
      });

      if (response.ok) {
        setMsg({ text: "Photo updated successfully!", error: false });
        onProfileUpdated();
      } else {
        const errData = await response.json();
        setMsg({ text: errData.error || "Failed to update photo.", error: true });
      }
    } catch (error: any) {
      console.error("Profile image upload failed:", error);
      setMsg({ text: "Upload failed. Please check internet.", error: true });
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
      const response = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: nameInput.trim() })
      });

      if (response.ok) {
        setMsg({ text: "Name updated successfully!", error: false });
        onProfileUpdated();
      } else {
        const errData = await response.json();
        setMsg({ text: errData.error || "Failed to update name.", error: true });
      }
    } catch (error) {
      console.error("Name update failed:", error);
      setMsg({ text: "Failed to save name.", error: true });
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop overlay */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal Dialog Card */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-[2rem] border border-slate-100 shadow-2xl w-full max-w-md overflow-hidden relative z-10 p-6 md:p-8"
      >
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 rounded-full cursor-pointer transition-all active:scale-90"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center mb-6">
          <h3 className="text-xl font-bold text-slate-900 font-sans tracking-tight">
            Edit My Profile
          </h3>
          <p className="text-xs font-semibold text-slate-400 mt-1">
            Personalize your student identity card
          </p>
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
                ? 'border-indigo-500 bg-indigo-50/60 scale-102' 
                : 'border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-indigo-400'
            }`}
            style={{ overflow: 'hidden' }}
          >
            {uploading && (
              <div className="absolute inset-0 bg-slate-900/75 backdrop-blur-[1px] flex flex-col items-center justify-center text-white z-20">
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
              <div className="w-full h-full bg-gradient-to-br from-emerald-500 to-indigo-600 text-white font-extrabold text-3xl flex items-center justify-center">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : user?.email?.slice(0, 2).toUpperCase()}
              </div>
            )}

            <label 
              htmlFor="modal-avatar-file-input" 
              className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-[9px] font-black tracking-wider cursor-pointer transition-opacity z-10"
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
          <p className="text-[10px] text-slate-400 mt-2 font-semibold">
            Drag and drop photo or click to upload
          </p>
        </div>

        {/* Profile Name form */}
        <form onSubmit={handleSaveName} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5 font-mono">My Full Name:</label>
            <input
              type="text"
              required
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              placeholder="e.g. John Doe"
              className="w-full h-11 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-sans font-semibold text-sm outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition-all"
            />
          </div>

          {msg && (
            <div className={`p-3 border rounded-xl text-xs font-semibold flex items-center gap-2 ${
              msg.error 
                ? 'bg-red-50 border-red-100 text-red-700' 
                : 'bg-emerald-50 border-emerald-100 text-emerald-700'
            }`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${msg.error ? 'bg-red-500' : 'bg-emerald-500 animate-ping'}`} />
              <p className="truncate">{msg.text}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={savingName || uploading}
              className="h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all active:scale-95 flex-grow disabled:opacity-50"
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
              className="h-11 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl cursor-pointer transition-all border border-slate-200"
            >
              CLOSE
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
