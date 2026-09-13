// src/components/MessagesView.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Course, Conversation, Message } from '../types.js';
import { apiFetch } from '../lib/api.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { ArrowLeft, RefreshCw, Send, MessageCircle, AlertCircle, Inbox, ChevronLeft } from 'lucide-react';

interface MessagesViewProps {
  courses: Course[];
  currentUserId: number;
  currentUserRole: 'learner' | 'instructor' | 'admin';
  messagesIntent: { courseId: number; instructorId: number } | null;
  onClearMessagesIntent: () => void;
}

const POLL_MS = 5000;

export const MessagesView: React.FC<MessagesViewProps> = ({
  courses,
  currentUserId,
  messagesIntent,
  onClearMessagesIntent,
}) => {
  const isOnline = useOnlineStatus();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);

  const [pendingNewThread, setPendingNewThread] = useState<{ courseId: number; instructorId: number } | null>(null);

  // Mobile single-pane navigation
  const [mobilePane, setMobilePane] = useState<'list' | 'thread'>('list');

  const fetchConversations = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const res = await apiFetch<{ conversations: Conversation[]; error?: string }>('/api/messages/conversations');
      if (!res.ok) {
        setError(res.data?.error || 'Failed to load conversations.');
        return;
      }
      setConversations(res.data.conversations);
      setError('');

      if (messagesIntent) {
        const matching = res.data.conversations.find(
          (c) => c.courseId === messagesIntent.courseId && c.instructorId === messagesIntent.instructorId,
        );
        if (matching) {
          setActiveConversationId(matching.id);
          setPendingNewThread(null);
          onClearMessagesIntent();
        } else if (activeConversationId !== null) {
          // Switch the open thread when a new target is picked mid-session.
          setActiveConversationId(null);
          setMobilePane('list');
          setPendingNewThread(messagesIntent);
        } else {
          setPendingNewThread(messagesIntent);
        }
      }
    } catch {
      // Net-silent: keep last known list when offline.
    } finally {
      setLoading(false);
    }
  }, [activeConversationId, messagesIntent, onClearMessagesIntent]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | undefined;

    const poll = async () => {
      if (cancelled || !navigator.onLine) return;
      await fetchConversations();
    };

    if (navigator.onLine) {
      poll();
      intervalId = window.setInterval(poll, POLL_MS);
    }

    return () => {
      cancelled = true;
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [fetchConversations]);

  const fetchThread = useCallback(
    async (conversationId: number, markRead: boolean) => {
      if (!navigator.onLine) return;
      try {
        const res = await apiFetch<{ conversation: unknown; messages: Message[] }>(
          `/api/messages/conversations/${conversationId}`,
        );
        if (res.ok) {
          setMessages(res.data.messages);
        }
        if (markRead) {
          await apiFetch(`/api/messages/conversations/${conversationId}/read`, { method: 'POST' });
          fetchConversations();
        }
      } catch {
        // Net-silent.
      }
    },
    [fetchConversations],
  );

  useEffect(() => {
    if (activeConversationId === null) return;
    let cancelled = false;
    let intervalId: number | undefined;

    const poll = async () => {
      if (cancelled || !navigator.onLine) return;
      await fetchThread(activeConversationId, true);
    };

    if (navigator.onLine) {
      poll();
      intervalId = window.setInterval(poll, POLL_MS);
    }

    return () => {
      cancelled = true;
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [activeConversationId, fetchThread]);

  const openConversation = (id: number) => {
    setActiveConversationId(id);
    setPendingNewThread(null);
    onClearMessagesIntent();
    setMobilePane('thread');
  };

  const handleSend = async () => {
    const text = content.trim();
    if (!text || sending) return;

    setSending(true);
    setError('');
    try {
      const body = activeConversationId
        ? { conversationId: activeConversationId, content: text }
        : pendingNewThread
          ? { courseId: pendingNewThread.courseId, instructorId: pendingNewThread.instructorId, content: text }
          : null;
      if (!body) return;

      const res = await apiFetch<{ conversationId: number; message: Message; error?: string }>('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(res.data?.error || 'Failed to send message.');
        return;
      }
      setContent('');
      if (pendingNewThread) {
        setPendingNewThread(null);
        onClearMessagesIntent();
        setActiveConversationId(res.data.conversationId);
        setMobilePane('thread');
      }
      fetchConversations();
      if (res.data.conversationId) {
        fetchThread(res.data.conversationId, true);
      }
    } catch {
      setError('Network error while sending — please try again.');
    } finally {
      setSending(false);
    }
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null;

  const pendingCourse = pendingNewThread ? (courses.find((c) => c.id === pendingNewThread.courseId) ?? null) : null;

  const renderSkeleton = (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <RefreshCw className="w-8 h-8 animate-spin text-accent mb-3" />
      <p className="text-sm font-mono text-ink-3">Loading conversations…</p>
    </div>
  );

  const renderThread = (conversation: Conversation | null) => {
    const counterpartName = conversation
      ? conversation.learnerId === currentUserId
        ? (conversation.instructorName ?? 'Instructor')
        : (conversation.learnerName ?? 'Learner')
      : (pendingCourse?.createdByName ?? 'Instructor');

    const courseTitle = conversation?.courseTitle ?? pendingCourse?.title ?? '';

    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Thread header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-rule bg-paper-2 rounded-t-xl">
          <button
            type="button"
            onClick={() => setMobilePane('list')}
            className="lg:hidden text-ink-2 hover:text-ink cursor-pointer"
            aria-label="Back to conversations"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink truncate">{counterpartName}</p>
            <p className="text-[11px] font-mono text-ink-3 truncate">{courseTitle}</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-paper min-h-0">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <MessageCircle className="w-8 h-8 text-ink-3 mb-2" />
              <p className="text-sm font-medium text-ink-2">No messages yet.</p>
              <p className="text-xs font-mono text-ink-3 mt-1">Send the first message to start this thread.</p>
            </div>
          ) : (
            messages.map((m) => {
              const mine = m.senderId === currentUserId;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm font-medium leading-relaxed shadow-sm ${
                      mine
                        ? 'bg-ochre text-white rounded-br-md'
                        : 'bg-paper-2 border border-rule text-ink rounded-bl-md'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <p className={`text-[10px] font-mono mt-1 ${mine ? 'text-white/70' : 'text-ink-3'}`}>
                      {new Date(m.createdAt).toLocaleString()} ·{' '}
                      {m.senderName ?? m.senderNameSnapshot ?? 'Former participant'}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-end gap-2 px-4 py-3 border-t border-rule bg-paper-2"
        >
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              conversation ? `Reply to ${counterpartName}…` : `Start a conversation with ${counterpartName}…`
            }
            rows={2}
            className="flex-1 resize-none rounded-xl border border-rule bg-white px-3 py-2 text-sm text-ink focus:ring-2 focus:ring-ochre/40 focus:border-ochre outline-none"
          />
          <button
            type="submit"
            disabled={sending || content.trim().length === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-navy text-white text-sm font-bold shadow-sm hover:bg-navy-2 disabled:opacity-40 transition-all cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">{sending ? '…' : 'Send'}</span>
          </button>
        </form>
      </div>
    );
  };

  const renderList = (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-5 py-3 border-b border-rule bg-paper-2 rounded-t-xl flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-ochre" />
        <h2 className="text-sm font-bold text-ink">Conversations</h2>
      </div>

      <div className="flex-1 overflow-y-auto bg-paper min-h-0">
        {loading && conversations.length === 0 ? (
          renderSkeleton
        ) : conversations.length === 0 && !pendingNewThread ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <Inbox className="w-10 h-10 text-ink-3 mb-3" />
            <p className="text-sm font-bold text-ink">No conversations yet</p>
            <p className="text-xs font-mono text-ink-3 mt-1">Open a course and press “Message Instructor” to start.</p>
          </div>
        ) : (
          <div className="divide-y divide-rule">
            {pendingNewThread && (
              <button
                type="button"
                onClick={() => setMobilePane('thread')}
                className="w-full flex items-center gap-3 px-5 py-3.5 text-left bg-ochre/5 hover:bg-ochre/10 transition-colors cursor-pointer"
              >
                <div className="w-9 h-9 rounded-full bg-ochre text-white flex items-center justify-center shrink-0">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink truncate">
                    New conversation with {pendingCourse?.createdByName ?? 'Instructor'}
                  </p>
                  <p className="text-[11px] font-mono text-ink-3 truncate">{pendingCourse?.title ?? ''}</p>
                </div>
                <span className="text-[10px] font-mono text-ochre font-bold uppercase">Draft</span>
              </button>
            )}
            {conversations.map((c) => {
              const name = c.learnerId === currentUserId ? c.instructorName : c.learnerName;
              const isActive = c.id === activeConversationId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openConversation(c.id)}
                  className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors cursor-pointer ${
                    isActive ? 'bg-ochre/10' : 'hover:bg-paper-2'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-navy text-white flex items-center justify-center shrink-0 text-xs font-bold">
                    {(name ?? '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-ink truncate">{name ?? 'Former participant'}</p>
                      {c.lastMessageAt && (
                        <span className="text-[10px] font-mono text-ink-3 shrink-0">
                          {new Date(c.lastMessageAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-ink-2 truncate">{c.lastMessage ?? c.courseTitle}</p>
                      {c.unreadCount > 0 && (
                        <span className="flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-ochre text-white text-[10px] font-bold leading-none shrink-0">
                          {c.unreadCount > 9 ? '9+' : c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-1">
        <div>
          <h1 className="text-xl font-display font-bold tracking-tight text-ink">Messages</h1>
          <p className="text-xs font-mono text-ink-3 mt-0.5">Private threads with your course instructors</p>
        </div>
        {!isOnline && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-ink-3 bg-ink/5 border border-rule rounded-full px-2.5 py-1">
            <AlertCircle className="w-3 h-3" /> Offline — send will sync next time you're online
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm font-medium text-error">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="bg-paper border border-rule rounded-2xl shadow-sm overflow-hidden">
        {!isOnline ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <AlertCircle className="w-8 h-8 text-ink-3 mb-3" />
            <p className="text-sm font-bold text-ink">You're offline</p>
            <p className="text-xs font-mono text-ink-3 mt-1">Messages will load automatically when you reconnect.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] h-[560px] max-h-[70vh]">
            {/* List pane — single pane on mobile unless a thread is open */}
            <div
              className={`${mobilePane === 'thread' && activeConversationId !== null ? 'hidden lg:block' : ''} min-h-0 border-r border-rule`}
            >
              {renderList}
            </div>
            {/* Thread pane */}
            {(mobilePane === 'thread' || activeConversationId !== null || pendingNewThread) && (
              <div className={`${mobilePane === 'list' ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col`}>
                {pendingNewThread && !activeConversationId ? renderThread(null) : renderThread(activeConversation)}
              </div>
            )}
            {!pendingNewThread && !activeConversation && mobilePane === 'list' && (
              <div className="hidden lg:flex flex-col items-center justify-center text-center px-8">
                <MessageCircle className="w-10 h-10 text-ink-3 mb-3" />
                <p className="text-sm font-bold text-ink">Select a conversation</p>
                <p className="text-xs font-mono text-ink-3 mt-1">Or open a course and press “Message Instructor”.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile back button when inside a thread */}
      {mobilePane === 'thread' && (
        <button
          type="button"
          onClick={() => setMobilePane('list')}
          className="lg:hidden mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-mono font-bold text-ink-3 hover:text-ink cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> ALL CONVERSATIONS
        </button>
      )}
    </div>
  );
};
