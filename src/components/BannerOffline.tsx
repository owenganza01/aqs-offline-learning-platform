// src/components/BannerOffline.tsx
import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { PouchDBService } from '../lib/pouchdb-service.js';
import { apiFetch } from '../lib/api.js';
import { withBackoff } from '../lib/retry.js';

interface BannerOfflineProps {
  onSyncComplete: () => void;
  token: string | null;
  onSyncStateChange?: (state: { syncing: boolean }) => void;
}

export const BannerOffline: React.FC<BannerOfflineProps> = ({ onSyncComplete, token, onSyncStateChange }) => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string>(
    navigator.onLine ? '' : 'Working offline. All answers and lessons completed will save locally.',
  );
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const triggerSync = async () => {
    if (!navigator.onLine || !token) {
      return;
    }

    setSyncing(true);
    setSyncStatus('idle');
    setSyncMessage('Synchronizing your offline learning to school servers...');
    onSyncStateChange?.({ syncing: true });

    try {
      // 1. Get queued items from local PouchDB
      const queue = await PouchDBService.getSyncQueue();

      if (queue.lessonCompletions.length === 0 && queue.quizSubmissions.length === 0) {
        setSyncing(false);
        setSyncStatus('idle');
        setSyncMessage('');
        return;
      }

      // 2. Submit to backend /api/sync with exponential backoff retry
      await withBackoff(
        async () => {
          const { ok, data } = await apiFetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(queue),
          });

          if (!ok) {
            throw new Error('Server sync response was not ok');
          }

          if (data.success) {
            // 3. Save official state back locally
            await PouchDBService.saveUserProgress(data.syncedCompletions, data.syncedAttempts);

            // 4. Clear the local sync queue since it has been stored on production DB
            await PouchDBService.clearSyncQueue();

            setSyncStatus('success');
            setSyncMessage(
              `Synced ${queue.lessonCompletions.length} lessons & ${queue.quizSubmissions.length} quizzes!`,
            );

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
        },
        {
          onRetry: (attempt, _err) => {
            setSyncMessage(`Retrying sync… attempt ${attempt + 1}`);
          },
        },
      );
    } catch (err) {
      console.error('Offline progress synchronization failed after all retries:', err);
      setSyncStatus('error');
      setSyncMessage('Failed to sync after multiple attempts. Please check your connection and try again later.');
    } finally {
      setSyncing(false);
      onSyncStateChange?.({ syncing: false });
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSyncMessage('Working offline. All answers and lessons completed will save locally.');
    } else {
      triggerSync();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [token]);

  return (
    <div className="w-full max-w-4xl mx-auto mb-6 px-4" id="connection-sync-banner">
      {!isOnline ? (
        <div className="bg-ochre-dim/80 border border-ochre/40 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-ochre/10 p-3 rounded-lg text-ochre shrink-0 border border-ochre/20">
              <WifiOff className="w-6 h-6" />
            </div>
            <div>
              <p className="text-base font-display font-bold text-[#6B5010] tracking-tight">Offline Mode Active</p>
              <p className="text-sm font-medium leading-relaxed text-[#7A5E18]/90 mt-0.5">
                {syncMessage ||
                  'No internet signal detected. Study freely; everything you do will sync when reconnected.'}
              </p>
            </div>
          </div>
          <span className="shrink-0 bg-ochre/10 text-[#8A6B20] px-4 py-1.5 rounded-full border border-ochre/30 text-xs font-mono font-bold uppercase">
            No Signal - Safe
          </span>
        </div>
      ) : syncMessage ? (
        <div
          className={`border p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm ${
            syncStatus === 'success'
              ? 'bg-success/10 border-success/30'
              : syncStatus === 'error'
                ? 'bg-error-bg border-error/30'
                : 'bg-ochre-dim/60 border-ochre/30'
          }`}
        >
          <div className="flex items-center gap-3 w-full">
            <div
              className={`p-3 rounded-lg shrink-0 border ${
                syncStatus === 'success'
                  ? 'bg-success/10 text-success border-success/30'
                  : syncStatus === 'error'
                    ? 'bg-error/10 text-error border-error/30'
                    : 'bg-ochre/10 text-ochre border-ochre/30'
              }`}
            >
              {syncStatus === 'success' ? (
                <CheckCircle className="w-6 h-6" />
              ) : syncStatus === 'error' ? (
                <AlertTriangle className="w-6 h-6" />
              ) : (
                <RefreshCw className="w-6 h-6 animate-spin" />
              )}
            </div>
            <div className="grow">
              <p className="text-base font-display font-bold tracking-tight text-ink">
                {syncStatus === 'success'
                  ? 'Sync Completed successfully!'
                  : syncStatus === 'error'
                    ? 'Unable to Synchronize'
                    : 'Internet Detected'}
              </p>
              <p className="text-sm font-medium leading-relaxed text-ink-2 mt-0.5 opacity-90">{syncMessage}</p>
            </div>
          </div>

          {token && (
            <button
              onClick={triggerSync}
              disabled={syncing}
              className={`shrink-0 h-12 min-w-[160px] text-sm font-bold px-5 rounded-full border flex items-center justify-center gap-2 active:scale-95 transition-all ${
                syncStatus === 'success'
                  ? 'bg-success text-white hover:opacity-90 border-success/40'
                  : 'bg-accent text-white hover:opacity-90 border-accent/40'
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
