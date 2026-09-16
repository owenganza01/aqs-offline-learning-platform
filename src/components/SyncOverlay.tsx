// src/components/SyncOverlay.tsx
import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { RefreshCw, CheckCircle, AlertTriangle, GraduationCap, FileCheck, PenLine, X } from 'lucide-react';
import { PouchDBService } from '../lib/pouchdb-service.js';
import { apiFetch } from '../lib/api.js';
import { withBackoff } from '../lib/retry.js';

interface SyncOverlayProps {
  onClose: () => void;
  onSynced: () => void;
}

type StepId = 'prep' | 'sync' | 'save' | 'refresh';

export const SyncOverlay: React.FC<SyncOverlayProps> = ({ onClose, onSynced }) => {
  const [lessons, setLessons] = useState<number>(0);
  const [quizzes, setQuizzes] = useState<number>(0);
  const [enrollments, setEnrollments] = useState<number>(0);
  const [phase, setPhase] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [currentStep, setCurrentStep] = useState<StepId | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const queue = await PouchDBService.getSyncQueue();
      if (cancelled) return;
      setLessons(queue.lessonCompletions.length);
      setQuizzes(queue.quizSubmissions.length);
      setEnrollments((queue.enrollments || []).length);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const total = lessons + quizzes + enrollments;

  const runSync = async () => {
    setPhase('running');
    setErrorMessage('');
    setCurrentStep('prep');
    const queue = await PouchDBService.getSyncQueue();
    setLessons(queue.lessonCompletions.length);
    setQuizzes(queue.quizSubmissions.length);
    setEnrollments(queue.enrollments.length);

    if (queue.lessonCompletions.length + queue.quizSubmissions.length + queue.enrollments.length === 0) {
      setPhase('success');
      return;
    }

    try {
      setCurrentStep('sync');
      await withBackoff(async () => {
        const { ok, data } = await apiFetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(queue),
        });
        if (!ok) throw new Error(data?.error || 'Server sync response was not ok');
        if (!data.success) throw new Error('Sync failed server side');

        setCurrentStep('save');
        await PouchDBService.saveUserProgress(data.syncedCompletions, data.syncedAttempts);
        await PouchDBService.clearSyncQueue();
      });

      setCurrentStep('refresh');
      setPhase('success');
      onSynced();
    } catch (err) {
      console.error('Manual sync failed:', err);
      setPhase('error');
      setErrorMessage(
        'Sync failed after multiple attempts. Your progress stays safely queued on this device — retry when your connection is stable.',
      );
    } finally {
      setCurrentStep(null);
    }
  };

  useEffect(() => {
    // Kick off the sync in a deferred tick so the overlay can paint its
    // initial "reading queue" state first (no cascade of synchronous renders).
    const timer = window.setTimeout(() => {
      void runSync();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stepRows: { id: StepId | 'success' | 'error'; label: string; detail?: string }[] = [
    {
      id: 'prep',
      label: 'Reading offline queue',
      detail: `${lessons} lessons · ${quizzes} quizzes · ${enrollments} enrollments`,
    },
    { id: 'sync', label: 'Uploading to school servers', detail: 'Backed by secure, retrying connection' },
    { id: 'save', label: 'Storing official server state', detail: 'Sync queue cleared on this device' },
    { id: 'refresh', label: 'Refreshing your progress', detail: 'Loading the latest from the server' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-navy/80 backdrop-blur-sm"
        onClick={phase === 'running' ? undefined : onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-md rounded-2xl bg-paper border border-rule shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-5 border-b border-rule bg-paper-2 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-ochre/10 text-ochre border border-ochre/20 flex items-center justify-center">
              <RefreshCw className={`w-4 h-4 ${phase === 'running' ? 'animate-spin' : ''}`} />
            </span>
            <div>
              <h2 className="text-sm font-display font-bold tracking-tight text-ink">Sync Learning Progress</h2>
              <p className="text-[11px] font-mono text-ink-3">
                {phase === 'running'
                  ? 'Do not close this window'
                  : phase === 'success'
                    ? 'All caught up'
                    : 'Retry available'}
              </p>
            </div>
          </div>
          {(phase !== 'running' || total === 0) && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close sync overlay"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Queue summary */}
          <div className="flex items-center gap-2 text-xs font-mono text-ink-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 border border-rule px-2.5 py-1">
              <GraduationCap className="w-3 h-3 text-ochre" /> {enrollments} enrollment{enrollments === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 border border-rule px-2.5 py-1">
              <FileCheck className="w-3 h-3 text-ochre" /> {lessons} lesson{lessons === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 border border-rule px-2.5 py-1">
              <PenLine className="w-3 h-3 text-ochre" /> {quizzes} quiz{quizzes === 1 ? '' : 'es'}
            </span>
          </div>

          {/* Progress steps */}
          <div className="space-y-2">
            {stepRows.map((step) => {
              const done =
                phase === 'success' ||
                (phase === 'error' && stepRows.indexOf(step) < stepRows.findIndex((s) => s.id === 'sync'));
              const active = phase === 'running' && currentStep === step.id;
              const isErrorStep = phase === 'error' && step.id === 'sync';
              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors ${
                    active || isErrorStep
                      ? 'border-ochre/40 bg-ochre/5'
                      : done
                        ? 'border-success/30 bg-success/5'
                        : 'border-rule bg-paper-2'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      isErrorStep
                        ? 'text-error bg-error/10'
                        : done
                          ? 'text-success bg-success/10'
                          : active
                            ? 'text-ochre bg-ochre/10'
                            : 'text-ink-3 bg-ink/5'
                    }`}
                  >
                    {isErrorStep ? (
                      <AlertTriangle className="w-3 h-3" />
                    ) : done ? (
                      <CheckCircle className="w-3 h-3" />
                    ) : active ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : null}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${isErrorStep ? 'text-error' : 'text-ink'}`}>{step.label}</p>
                    <p className="text-[11px] font-mono text-ink-3">{step.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Error / retry */}
          {phase === 'error' && (
            <div className="flex items-start gap-2 text-sm font-medium text-error">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed">{errorMessage}</p>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            {phase === 'error' && (
              <button
                type="button"
                onClick={runSync}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-ochre text-white text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
            )}
            {(phase === 'success' || phase === 'idle') && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-navy text-white text-sm font-bold hover:bg-navy-2 transition-colors cursor-pointer"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default SyncOverlay;
