// src/components/BannerOffline.tsx
import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { PouchDBService } from '../lib/pouchdb-service.ts';

interface BannerOfflineProps {
  onSyncComplete: () => void;
  token: string | null;
}

export const BannerOffline: React.FC<BannerOfflineProps> = ({ onSyncComplete, token }) => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Automatically attempt sync when network resumes
      triggerSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('idle');
      setSyncMessage('Working offline. All answers and lessons completed will save locally.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    if (!navigator.onLine) {
      setSyncMessage('Working offline. All answers and lessons completed will save locally.');
    } else {
      triggerSync();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [token]);

  const triggerSync = async () => {
    if (!navigator.onLine || !token) {
      return;
    }

    setSyncing(true);
    setSyncStatus('idle');
    setSyncMessage('Synchronizing your offline learning to school servers...');

    try {
      // 1. Get queued items from local PouchDB
      const queue = await PouchDBService.getSyncQueue();

      if (queue.lessonCompletions.length === 0 && queue.quizSubmissions.length === 0) {
        setSyncing(false);
        setSyncStatus('idle');
        setSyncMessage('');
        return;
      }

      // 2. Submit to backend /api/sync
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(queue)
      });

      if (!response.ok) {
        throw new Error('Server sync response was not ok');
      }

      const result = await response.json();

      if (result.success) {
        // 3. Save official state back locally
        await PouchDBService.saveUserProgress(result.syncedCompletions, result.syncedAttempts);
        
        // 4. Clear the local sync queue since it has been stored on production DB
        await PouchDBService.clearSyncQueue();

        setSyncStatus('success');
        setSyncMessage(`Synced ${queue.lessonCompletions.length} lessons & ${queue.quizSubmissions.length} quizzes!`);
        
        // Let main app refresh its state
        onSyncComplete();

        // Clear success message after 5 seconds
        setTimeout(() => {
          setSyncMessage('');
          setSyncStatus('idle');
        }, 5000);
      } else {
        throw new Error('Sync failed server side');
      }
    } catch (err) {
      console.error('Offline progress synchronization failed:', err);
      setSyncStatus('error');
      setSyncMessage('Failed to sync. We will retry automatically when signal is stronger.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div 
      className="w-full max-w-4xl mx-auto mb-6 px-4" 
      id="connection-sync-banner"
    >
      {!isOnline ? (
        <div className="bg-amber-50/80 border border-amber-200/80 p-4 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/10 p-3 rounded-2xl text-amber-600 shrink-0 border border-amber-500/20">
              <WifiOff className="w-6 h-6" />
            </div>
            <div>
              <p className="text-base font-bold text-amber-900 font-sans tracking-tight">
                Offline Mode Active
              </p>
              <p className="text-sm font-medium leading-relaxed text-amber-805/90 mt-0.5">
                {syncMessage || 'No internet signal detected. Study freely; everything you do will sync when reconnected.'}
              </p>
            </div>
          </div>
          <span className="shrink-0 bg-amber-500/10 text-amber-700 px-4 py-1.5 rounded-full border border-amber-200 text-xs font-mono font-bold uppercase">
            No Signal - Safe
          </span>
        </div>
      ) : syncMessage ? (
        <div className={`border p-4 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm backdrop-blur-sm ${
          syncStatus === 'success' 
            ? 'bg-emerald-50/80 border-emerald-200/80 text-emerald-950' 
            : syncStatus === 'error'
            ? 'bg-rose-50/80 border-rose-200/80 text-rose-950'
            : 'bg-indigo-50/80 border-indigo-200/80 text-indigo-950'
        }`}>
          <div className="flex items-center gap-3 w-full">
            <div className={`p-3 rounded-2xl shrink-0 border ${
              syncStatus === 'success' 
                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' 
                : syncStatus === 'error'
                ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                : 'bg-indigo-500/10 text-indigo-650 border-indigo-500/20'
            }`}>
              {syncStatus === 'success' ? (
                <CheckCircle className="w-6 h-6" />
              ) : syncStatus === 'error' ? (
                <AlertTriangle className="w-6 h-6" />
              ) : (
                <RefreshCw className="w-6 h-6 animate-spin" />
              )}
            </div>
            <div className="grow">
              <p className="text-base font-bold font-sans tracking-tight">
                {syncStatus === 'success' 
                  ? 'Sync Completed successfully!' 
                  : syncStatus === 'error'
                  ? 'Unable to Synchronize'
                  : 'Internet Detected'}
              </p>
              <p className="text-sm font-medium leading-relaxed text-slate-600 mt-0.5 opacity-90">
                {syncMessage}
              </p>
            </div>
          </div>

          {token && (
            <button
              onClick={triggerSync}
              disabled={syncing}
              className={`shrink-0 h-12 min-w-[160px] text-sm font-bold px-5 rounded-full border flex items-center justify-center gap-2 active:scale-95 transition-all ${
                syncStatus === 'success'
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500 border-emerald-700/30'
                  : 'bg-indigo-650 text-white hover:bg-indigo-600 border-indigo-700/30'
              }`}
              style={{ minHeight: '48px' }}
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span>SYNC NOW</span>
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
};
