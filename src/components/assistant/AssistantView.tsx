import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Send,
  Trash2,
  User,
  Plus,
  RotateCcw,
  AlertCircle,
  ExternalLink,
  BookOpen,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import {
  ChatMessage,
  AppView,
  UserProfile,
  LearningRoadmapRecord,
  AssessmentAttemptRecord,
  LessonKnowledgeCheckAttemptRecord,
  AssistantConversationSummary,
} from '../../types';
import { SmilingCloudMascot3D } from '../common/PastelIllustrations';
import {
  AssistantClientError,
  AssistantLessonContext,
  createAssistantConversation,
  deleteAssistantConversation,
  fetchAssistantConversations,
  generateClientTurnId,
  loadEphemeralAssistantState,
  saveEphemeralAssistantState,
  streamAssistantMessage,
} from '../../lib/assistantClient';

export interface PersistedAssistantUiState {
  ownerUserId: string | null;
  loadedFromServer: boolean;
  storageMode: 'table' | 'roadmap_fallback' | 'ephemeral';
  conversations: AssistantConversationSummary[];
  activeConversationId: string | null;
  messagesByConversation: Record<string, ChatMessage[]>;
  draftByConversation: Record<string, string>;
}

export const EMPTY_ASSISTANT_UI_STATE: PersistedAssistantUiState = {
  ownerUserId: null,
  loadedFromServer: false,
  storageMode: 'table',
  conversations: [],
  activeConversationId: null,
  messagesByConversation: {},
  draftByConversation: {},
};

interface AssistantViewProps {
  onNavigate: (view: AppView) => void;
  externalPrompt?: string;
  onClearExternalPrompt?: () => void;
  isAuthenticated: boolean;
  authUserId: string | null;
  accessToken?: string | null;
  user: UserProfile;
  activeRoadmap: LearningRoadmapRecord | null;
  activeStudyLesson: { stageId: string; lessonId: string } | null;
  assessmentAttempts: AssessmentAttemptRecord[];
  knowledgeCheckAttempts: LessonKnowledgeCheckAttemptRecord[];
  persistedState: PersistedAssistantUiState;
  onUpdatePersistedState: React.Dispatch<React.SetStateAction<PersistedAssistantUiState>>;
}

export const AssistantView: React.FC<AssistantViewProps> = ({
  externalPrompt,
  onClearExternalPrompt,
  isAuthenticated,
  authUserId,
  accessToken,
  user,
  activeRoadmap,
  activeStudyLesson,
  assessmentAttempts,
  knowledgeCheckAttempts,
  persistedState,
  onUpdatePersistedState,
}) => {
  const [isTyping, setIsTyping] = useState(false);
  const [streamingReplyText, setStreamingReplyText] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [errorBanner, setErrorBanner] = useState<{
    message: string;
    retryPrompt?: string;
    retryTurnId?: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const sendingLockRef = useRef(false);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  const lastDispatchedExternalPromptRef = useRef<string | null>(null);

  const draftKey = persistedState.activeConversationId ?? '__draft__';
  const inputValue = persistedState.draftByConversation[draftKey] ?? '';

  const setDraftValue = useCallback(
    (nextValue: string) => {
      onUpdatePersistedState((prev) => {
        const key = prev.activeConversationId ?? '__draft__';
        if ((prev.draftByConversation[key] ?? '') === nextValue) return prev;
        return {
          ...prev,
          ownerUserId: authUserId ?? prev.ownerUserId,
          draftByConversation: {
            ...prev.draftByConversation,
            [key]: nextValue,
          },
        };
      });
    },
    [authUserId, onUpdatePersistedState]
  );

  // Derive current/next active lesson context dynamically
  const resolvedLessonInfo = useMemo(() => {
    if (!activeRoadmap?.roadmapData?.stages) return null;
    const stages = activeRoadmap.roadmapData.stages;

    if (activeStudyLesson) {
      const stage = stages.find((s) => s.id === activeStudyLesson.stageId);
      const lesson = stage?.lessons.find((l) => l.id === activeStudyLesson.lessonId);
      if (stage && lesson) {
        return {
          roadmapId: activeRoadmap.id,
          stageId: stage.id,
          stageTitle: stage.title,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
        };
      }
    }

    for (const stage of stages) {
      const incomplete = stage.lessons.find((l) => !l.completed);
      if (incomplete) {
        return {
          roadmapId: activeRoadmap.id,
          stageId: stage.id,
          stageTitle: stage.title,
          lessonId: incomplete.id,
          lessonTitle: incomplete.title,
        };
      }
    }

    const firstStage = stages[0];
    const firstLesson = firstStage?.lessons[0];
    if (firstStage && firstLesson) {
      return {
        roadmapId: activeRoadmap.id,
        stageId: firstStage.id,
        stageTitle: firstStage.title,
        lessonId: firstLesson.id,
        lessonTitle: firstLesson.title,
      };
    }

    return null;
  }, [activeRoadmap, activeStudyLesson]);

  const lessonContextPayload: AssistantLessonContext | undefined = useMemo(() => {
    if (!activeRoadmap?.id) return undefined;
    if (activeStudyLesson) {
      return {
        roadmapId: activeRoadmap.id,
        stageId: activeStudyLesson.stageId,
        lessonId: activeStudyLesson.lessonId,
      };
    }
    return {
      roadmapId: activeRoadmap.id,
    };
  }, [activeRoadmap?.id, activeStudyLesson]);

  // Extract latest weak areas from real assessment & knowledge check attempts
  const latestKnowledgeGaps = useMemo(() => {
    const gaps: string[] = [];
    for (const q of knowledgeCheckAttempts) {
      for (const g of q.knowledgeGaps) {
        if (g.trim() && !gaps.includes(g.trim())) gaps.push(g.trim());
      }
    }
    for (const a of assessmentAttempts) {
      for (const g of a.knowledgeGaps) {
        if (g.trim() && !gaps.includes(g.trim())) gaps.push(g.trim());
      }
    }
    return gaps.slice(0, 4);
  }, [knowledgeCheckAttempts, assessmentAttempts]);

  // Personalized suggested questions grounded in student's primary direction, lesson, gaps & goal
  const suggestedQuestions = useMemo(() => {
    const prompts: string[] = [];
    const primaryFocus = (user.primaryDirection ?? '').trim() || user.fieldOfStudy;

    if (resolvedLessonInfo) {
      prompts.push(`Explain "${resolvedLessonInfo.lessonTitle}" step by step.`);
    } else if (primaryFocus) {
      prompts.push(`Explain a core concept in ${primaryFocus} simply.`);
    } else if (user.learningInterests[0]) {
      prompts.push(`Give me a clear beginner overview of ${user.learningInterests[0]}.`);
    }

    if (latestKnowledgeGaps.length > 0) {
      prompts.push(`Help me practice "${latestKnowledgeGaps[0]}" with hints.`);
    } else if (resolvedLessonInfo) {
      prompts.push(`Give me 2 practice questions on ${resolvedLessonInfo.lessonTitle}.`);
    } else {
      prompts.push('Give me a quick practice exercise with hints.');
    }

    if ((user.primaryDirection ?? '').trim() || user.careerGoal) {
      const targetFocus = (user.primaryDirection ?? '').trim() || user.careerGoal;
      prompts.push(`Recommend verified resources for ${targetFocus}.`);
    } else {
      prompts.push('Recommend verified study resources for my track.');
    }

    prompts.push('Create a focused weekly study plan for my level.');
    return prompts;
  }, [
    resolvedLessonInfo,
    user.primaryDirection,
    user.fieldOfStudy,
    user.learningInterests,
    user.careerGoal,
    latestKnowledgeGaps,
  ]);

  // Dynamic welcoming message when starting a new conversation
  const welcomeGreetingText = useMemo(() => {
    if (!isAuthenticated) {
      return 'Hi there! Sign in with your Skillora account so I can tailor explanations, practice exercises, and verified study resources to your profile, active roadmap, and diagnostic progress.';
    }

    const greetingName = user.name?.trim() || 'there';
    const focusParts: string[] = [];
    const primaryDir = (user.primaryDirection ?? '').trim();
    if (primaryDir) focusParts.push(`Focus: ${primaryDir}`);
    else if (user.fieldOfStudy) focusParts.push(user.fieldOfStudy);
    if (user.careerGoal && user.careerGoal !== primaryDir) {
      focusParts.push(`goal: ${user.careerGoal}`);
    }
    const focusSummary =
      focusParts.length > 0 ? ` (${focusParts.join(' · ')})` : '';

    if (resolvedLessonInfo) {
      const gapNote =
        latestKnowledgeGaps.length > 0
          ? ` I also have your recent focus areas ready (${latestKnowledgeGaps.slice(0, 2).join(', ')}).`
          : '';
      return `Hi ${greetingName}! I am synced with your ${user.knowledgeLevel} profile${focusSummary} and your current lesson "${resolvedLessonInfo.lessonTitle}".${gapNote} Ask me for step-by-step explanations, practical examples, practice questions with hints, or verified study resources anytime.`;
    }

    return `Hi ${greetingName}! I am synced with your ${user.knowledgeLevel} Skillora profile${focusSummary}. Ask me to explain a concept step by step, create practice exercises, review weak areas, or recommend verified resources for your goals.`;
  }, [
    isAuthenticated,
    user.name,
    user.primaryDirection,
    user.fieldOfStudy,
    user.careerGoal,
    user.knowledgeLevel,
    resolvedLessonInfo,
    latestKnowledgeGaps,
  ]);

  const headerSubtitle = useMemo(() => {
    if (!isAuthenticated) {
      return 'Sign in to personalize answers with your profile, roadmap, and assessments';
    }
    const parts: string[] = [];
    const primaryDir = (user.primaryDirection ?? '').trim();
    if (activeRoadmap?.title) {
      parts.push(`Synced with ${activeRoadmap.title}`);
    } else if (primaryDir) {
      parts.push(`Focus: ${primaryDir}`);
    } else if (user.fieldOfStudy) {
      parts.push(`Track: ${user.fieldOfStudy}`);
    }
    if (user.careerGoal && user.careerGoal !== primaryDir) {
      parts.push(`Goal: ${user.careerGoal}`);
    }
    return parts.length > 0
      ? parts.join(' · ')
      : `Personalized for your ${user.knowledgeLevel} study profile`;
  }, [
    isAuthenticated,
    activeRoadmap?.title,
    user.primaryDirection,
    user.fieldOfStudy,
    user.careerGoal,
    user.knowledgeLevel,
  ]);

  // Active conversation messages (strictly isolated to the current authenticated user)
  const isUserStateOwned = Boolean(authUserId && persistedState.ownerUserId === authUserId);
  const activeConversationId = isUserStateOwned ? persistedState.activeConversationId : null;
  const activeMessages: ChatMessage[] = useMemo(() => {
    if (!activeConversationId || !isUserStateOwned) return [];
    return persistedState.messagesByConversation[activeConversationId] ?? [];
  }, [activeConversationId, isUserStateOwned, persistedState.messagesByConversation]);

  const displayMessages: ChatMessage[] = useMemo(() => {
    if (activeMessages.length > 0) return activeMessages;
    return [
      {
        id: 'welcome-dynamic',
        sender: 'assistant',
        text: welcomeGreetingText,
        timestamp: 'Ready',
      },
    ];
  }, [activeMessages, welcomeGreetingText]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [displayMessages.length, isTyping, streamingReplyText]);

  // Cancel any in-flight request only when unmounting or switching authenticated accounts
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, [authUserId]);

  // If the student switches to a new active roadmap, start a fresh thread view instead of continuing an old direction's conversation by default
  useEffect(() => {
    if (!isAuthenticated || !authUserId || !activeRoadmap?.id || isTyping) return;
    if (!persistedState.activeConversationId) return;
    const currentConv = persistedState.conversations.find(
      (c) => c.id === persistedState.activeConversationId
    );
    if (
      currentConv?.activeRoadmapId &&
      currentConv.activeRoadmapId !== activeRoadmap.id
    ) {
      onUpdatePersistedState((prev) => ({
        ...prev,
        activeConversationId: null,
      }));
    }
  }, [
    isAuthenticated,
    authUserId,
    activeRoadmap?.id,
    isTyping,
    persistedState.activeConversationId,
    persistedState.conversations,
    onUpdatePersistedState,
  ]);

  // Persist user-scoped session cache (for unsent drafts + ephemeral conversations across refresh)
  useEffect(() => {
    if (!authUserId || persistedState.ownerUserId !== authUserId) return;
    const hasDrafts = Object.values(persistedState.draftByConversation).some(
      (d) => d.trim().length > 0
    );
    if (persistedState.storageMode === 'ephemeral' || hasDrafts) {
      saveEphemeralAssistantState(authUserId, {
        conversations:
          persistedState.storageMode === 'ephemeral' ? persistedState.conversations : [],
        activeConversationId: persistedState.activeConversationId,
        messagesByConversation:
          persistedState.storageMode === 'ephemeral'
            ? persistedState.messagesByConversation
            : {},
        draftByConversation: persistedState.draftByConversation,
      });
    }
  }, [authUserId, persistedState]);

  // Load saved conversations from Supabase on first open or account change
  useEffect(() => {
    if (!isAuthenticated || !authUserId) {
      setIsLoadingHistory(false);
      return;
    }
    if (persistedState.ownerUserId === authUserId && persistedState.loadedFromServer) {
      setIsLoadingHistory(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setIsLoadingHistory(true);
    setErrorBanner(null);

    const cached = loadEphemeralAssistantState(authUserId);
    const savedDrafts = cached?.draftByConversation ?? {};

    fetchAssistantConversations(undefined, controller.signal, accessTokenRef.current)
      .then((res) => {
        if (cancelled) return;

        if (res.storageMode === 'ephemeral' && res.conversations.length === 0) {
          if (cached && cached.conversations.length > 0) {
            onUpdatePersistedState((prev) => ({
              ownerUserId: authUserId,
              loadedFromServer: true,
              storageMode: 'ephemeral',
              conversations: cached.conversations,
              activeConversationId: cached.activeConversationId,
              messagesByConversation: cached.messagesByConversation,
              draftByConversation: { ...savedDrafts, ...prev.draftByConversation },
            }));
            return;
          }
        }

        onUpdatePersistedState((prev) => {
          const nextMessagesMap: Record<string, ChatMessage[]> =
            prev.ownerUserId === authUserId ? { ...prev.messagesByConversation } : {};
          if (res.activeConversationId) {
            nextMessagesMap[res.activeConversationId] = res.messages;
          }
          return {
            ownerUserId: authUserId,
            loadedFromServer: true,
            storageMode: res.storageMode,
            conversations: res.conversations,
            activeConversationId: res.activeConversationId,
            messagesByConversation: nextMessagesMap,
            draftByConversation: { ...savedDrafts, ...prev.draftByConversation },
          };
        });
      })
      .catch((err) => {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return;
        const msg =
          err instanceof Error
            ? err.message
            : 'Could not load your saved AI conversations.';
        setErrorBanner({ message: msg });
        onUpdatePersistedState((prev) => ({
          ...prev,
          ownerUserId: authUserId,
          loadedFromServer: true,
          draftByConversation: { ...savedDrafts, ...prev.draftByConversation },
        }));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    isAuthenticated,
    authUserId,
    persistedState.ownerUserId,
    persistedState.loadedFromServer,
    onUpdatePersistedState,
  ]);

  const handleSelectConversation = async (nextConversationId: string) => {
    if (isTyping || !nextConversationId || nextConversationId === activeConversationId) return;
    setErrorBanner(null);

    onUpdatePersistedState((prev) => ({
      ...prev,
      activeConversationId: nextConversationId,
    }));

    if (persistedState.messagesByConversation[nextConversationId]) {
      return;
    }

    setIsLoadingHistory(true);
    try {
      const res = await fetchAssistantConversations(
        nextConversationId,
        undefined,
        accessTokenRef.current
      );
      onUpdatePersistedState((prev) => ({
        ...prev,
        activeConversationId: nextConversationId,
        storageMode: res.storageMode,
        messagesByConversation: {
          ...prev.messagesByConversation,
          [nextConversationId]: res.messages,
        },
      }));
    } catch (err) {
      setErrorBanner({
        message:
          err instanceof Error ? err.message : 'Could not load messages for this conversation.',
      });
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSendPrompt = useCallback(
    async (
      promptText: string,
      options?: { isRetry?: boolean; clientTurnId?: string }
    ) => {
      const trimmed = promptText.trim();
      if (!trimmed || isTyping || isLoadingHistory || sendingLockRef.current) return;

      if (!isAuthenticated || !authUserId) {
        setErrorBanner({
          message: 'Please sign in with your Skillora account to chat with the AI Study Companion.',
        });
        return;
      }

      const clientTurnId = options?.clientTurnId || generateClientTurnId();
      sendingLockRef.current = true;
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const mySeq = ++requestSeqRef.current;

      setErrorBanner(null);
      setStreamingReplyText('');
      setIsTyping(true);

      const targetConvId = isUserStateOwned ? persistedState.activeConversationId : null;
      const currentDraftKey = targetConvId ?? '__draft__';
      const existingMsgs =
        targetConvId && isUserStateOwned
          ? persistedState.messagesByConversation[targetConvId] ?? []
          : [];
      const historyPayload = existingMsgs.slice(-12).map((m) => ({
        sender: m.sender,
        text: m.text,
      }));

      // Clear draft for this conversation once submitted
      onUpdatePersistedState((prev) => ({
        ...prev,
        ownerUserId: authUserId,
        draftByConversation: {
          ...prev.draftByConversation,
          [currentDraftKey]: '',
        },
      }));

      // Show user bubble immediately (and remove cleanly if the attempt fails/aborts)
      const optimisticId = `pending-usr-${mySeq}`;
      const optimisticConvKey = targetConvId ?? '__draft__';
      const optimisticMsg: ChatMessage = {
        id: optimisticId,
        sender: 'user',
        text: trimmed,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      onUpdatePersistedState((prev) => ({
        ...prev,
        ownerUserId: authUserId,
        messagesByConversation: {
          ...prev.messagesByConversation,
          [optimisticConvKey]: [
            ...(prev.messagesByConversation[optimisticConvKey] ?? []),
            optimisticMsg,
          ],
        },
      }));

      try {
        const result = await streamAssistantMessage(
          {
            conversationId: targetConvId,
            message: trimmed,
            history: historyPayload,
            lessonContext: lessonContextPayload,
            clientTurnId,
            accessToken: accessTokenRef.current,
            onDelta: (_delta, accumulated) => {
              if (mySeq === requestSeqRef.current) {
                setStreamingReplyText(accumulated);
              }
            },
          },
          controller.signal
        );

        if (mySeq !== requestSeqRef.current) return;

        onUpdatePersistedState((prev) => {
          const prevForTarget = prev.messagesByConversation[targetConvId ?? '__draft__'] ?? [];
          const withoutOptimistic = prevForTarget.filter((m) => m.id !== optimisticId);
          const nextMsgs = [
            ...withoutOptimistic,
            result.userMessage,
            result.assistantMessage,
          ];

          const nextMap = { ...prev.messagesByConversation };
          if (!targetConvId && nextMap['__draft__']) {
            delete nextMap['__draft__'];
          }
          nextMap[result.conversation.id] = nextMsgs;

          const nextDrafts = { ...prev.draftByConversation };
          if (nextDrafts[currentDraftKey] === trimmed) {
            nextDrafts[currentDraftKey] = '';
          }

          const remainingConvs = prev.conversations.filter(
            (c) => c.id !== result.conversation.id
          );

          return {
            ownerUserId: authUserId,
            loadedFromServer: true,
            storageMode: result.storageMode,
            conversations: [result.conversation, ...remainingConvs],
            activeConversationId: result.conversation.id,
            messagesByConversation: nextMap,
            draftByConversation: nextDrafts,
          };
        });
      } catch (err) {
        if (mySeq !== requestSeqRef.current) return;

        const isAbort = err instanceof DOMException && err.name === 'AbortError';

        onUpdatePersistedState((prev) => {
          const list = prev.messagesByConversation[optimisticConvKey] ?? [];
          const existingDraft = prev.draftByConversation[currentDraftKey] ?? '';
          return {
            ...prev,
            messagesByConversation: {
              ...prev.messagesByConversation,
              [optimisticConvKey]: list.filter((m) => m.id !== optimisticId),
            },
            // Preserve the student's message in the composer draft if a request fails
            draftByConversation:
              !isAbort && !existingDraft.trim()
                ? {
                    ...prev.draftByConversation,
                    [currentDraftKey]: trimmed,
                  }
                : prev.draftByConversation,
          };
        });

        // If aborted by unmount/account switch rather than timeout, do not leave stale error
        if (isAbort) {
          setIsTyping(false);
          setStreamingReplyText('');
          return;
        }

        const message =
          err instanceof AssistantClientError || err instanceof Error
            ? err.message
            : 'Unable to reach your AI Study Companion right now. Please retry.';
        setErrorBanner({ message, retryPrompt: trimmed, retryTurnId: clientTurnId });
      } finally {
        if (mySeq === requestSeqRef.current) {
          sendingLockRef.current = false;
          setIsTyping(false);
          setStreamingReplyText('');
        }
      }
    },
    [
      isTyping,
      isLoadingHistory,
      isAuthenticated,
      authUserId,
      isUserStateOwned,
      persistedState.activeConversationId,
      persistedState.messagesByConversation,
      lessonContextPayload,
      onUpdatePersistedState,
    ]
  );

  // Trigger external prompts routed from Dashboard / Assessment / LessonModal
  useEffect(() => {
    const prompt = externalPrompt?.trim();
    if (!prompt) {
      lastDispatchedExternalPromptRef.current = null;
      return;
    }
    if (!isAuthenticated || isLoadingHistory || isTyping) return;
    if (lastDispatchedExternalPromptRef.current === prompt) return;

    lastDispatchedExternalPromptRef.current = prompt;
    if (onClearExternalPrompt) onClearExternalPrompt();
    void handleSendPrompt(prompt);
  }, [
    externalPrompt,
    isAuthenticated,
    isLoadingHistory,
    isTyping,
    onClearExternalPrompt,
    handleSendPrompt,
  ]);

  const handleStartNewConversation = async () => {
    if (isTyping || isLoadingHistory || !isAuthenticated || !authUserId) return;
    abortControllerRef.current?.abort();
    requestSeqRef.current += 1;
    sendingLockRef.current = false;
    setIsTyping(false);
    setStreamingReplyText('');
    setErrorBanner(null);

    try {
      const res = await createAssistantConversation({
        title: 'New Study Conversation',
        lessonContext: lessonContextPayload,
        accessToken: accessTokenRef.current,
      });
      onUpdatePersistedState((prev) => ({
        ...prev,
        ownerUserId: authUserId,
        storageMode: res.storageMode,
        conversations: [res.conversation, ...prev.conversations],
        activeConversationId: res.conversation.id,
        messagesByConversation: {
          ...prev.messagesByConversation,
          [res.conversation.id]: [],
        },
      }));
    } catch (err) {
      setErrorBanner({
        message:
          err instanceof Error ? err.message : 'Could not create a new conversation.',
      });
    }
  };

  const handleDeleteCurrentConversation = async () => {
    if (isTyping || isLoadingHistory) return;
    const convId = activeConversationId;
    if (!convId || !authUserId) {
      setErrorBanner(null);
      return;
    }

    setErrorBanner(null);
    try {
      await deleteAssistantConversation(convId, undefined, accessTokenRef.current);
      onUpdatePersistedState((prev) => {
        const nextConvs = prev.conversations.filter((c) => c.id !== convId);
        const nextMap = { ...prev.messagesByConversation };
        delete nextMap[convId];
        const nextDrafts = { ...prev.draftByConversation };
        delete nextDrafts[convId];
        return {
          ...prev,
          conversations: nextConvs,
          activeConversationId: nextConvs[0]?.id ?? null,
          messagesByConversation: nextMap,
          draftByConversation: nextDrafts,
        };
      });
    } catch (err) {
      setErrorBanner({
        message:
          err instanceof Error ? err.message : 'Could not delete the conversation.',
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSendPrompt(inputValue);
    }
  };

  const draftMessages = persistedState.messagesByConversation['__draft__'] ?? [];
  const visibleMessages =
    !activeConversationId && draftMessages.length > 0 ? draftMessages : displayMessages;

  return (
    <div className="w-full flex-1 min-h-[520px] h-[calc(100dvh-5.75rem)] sm:h-[calc(100dvh-6.25rem)] md:h-[calc(100dvh-6.5rem)] flex flex-col pastel-card overflow-hidden animate-in fade-in duration-150">
      {/* Compact Horizontal Header */}
      <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-3.5 border-b border-[#EEE6E5] bg-gradient-to-r from-[#FFF1D6]/75 via-[#FAF6F2] to-[#F0E9FA]/80 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-10 sm:w-14 sm:h-11 rounded-[16px] bg-[#FFFCFA] border border-[#EEE6E5] flex items-center justify-center shadow-xs shrink-0">
            <SmilingCloudMascot3D className="w-10 h-8 sm:w-12 sm:h-9" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-base sm:text-[17px] font-extrabold text-[#343047] leading-tight">
                Skillora AI Study Companion
              </h2>
              <span className="text-[10px] font-bold text-[#6F4FA8] bg-[#F0E9FA] border border-[#DFD2F2] px-2.5 py-0.5 rounded-full whitespace-nowrap shrink-0">
                Personalized AI Tutor
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-[#8B8295] truncate mt-0.5">{headerSubtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
          {persistedState.conversations.length > 1 && (
            <div className="relative flex items-center min-w-0 max-w-full">
              <MessageSquare className="w-3.5 h-3.5 text-[#8E6EC8] absolute left-2.5 pointer-events-none shrink-0" />
              <select
                value={activeConversationId ?? ''}
                onChange={(e) => void handleSelectConversation(e.target.value)}
                disabled={isTyping || isLoadingHistory}
                aria-label="Select conversation"
                className="pl-7 pr-3 py-2 rounded-[12px] bg-[#FFFCFA] border border-[#EEE6E5] text-xs font-bold text-[#343047] max-w-[180px] sm:max-w-[230px] lg:max-w-[260px] truncate focus:outline-none focus:ring-2 focus:ring-[#C9B7E8]"
              >
                {persistedState.conversations.map((conv) => (
                  <option key={conv.id} value={conv.id}>
                    {conv.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isAuthenticated && (
            <button
              type="button"
              onClick={() => void handleStartNewConversation()}
              disabled={isTyping || isLoadingHistory}
              className="clay-button-soft px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 text-[#6F4FA8] hover:text-[#343047] whitespace-nowrap shrink-0 disabled:opacity-50"
              title="Start a new conversation"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>New Chat</span>
            </button>
          )}

          {activeConversationId && (
            <button
              type="button"
              onClick={() => void handleDeleteCurrentConversation()}
              disabled={isTyping || isLoadingHistory}
              className="clay-button-soft px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 text-[#8B8295] hover:text-[#343047] whitespace-nowrap shrink-0 disabled:opacity-50"
              title="Delete conversation"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Spacious Full-Width Scrollable Conversation Area */}
      <div className="flex-1 min-h-0 px-3.5 sm:px-6 lg:px-8 py-5 sm:py-6 overflow-y-auto overflow-x-hidden bg-[#FFFCFA]">
        <div className="w-full space-y-5">
          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-12 gap-2.5 text-xs font-bold text-[#8E6EC8]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading your study conversations...</span>
            </div>
          ) : (
            visibleMessages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 sm:gap-3.5 min-w-0 ${
                    isUser ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  {/* Avatar */}
                  {isUser ? (
                    <div className="w-9 h-9 rounded-[14px] clay-squircle-peach text-white flex items-center justify-center shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-[14px] bg-[#FFF1D6] border border-[#F3DFB4] flex items-center justify-center shrink-0 shadow-xs">
                      <SmilingCloudMascot3D className="w-8 h-6" />
                    </div>
                  )}

                  {/* Message Column with Comfortable Reading Width */}
                  <div
                    className={`min-w-0 space-y-2 ${
                      isUser
                        ? 'max-w-[86%] sm:max-w-[72%] lg:max-w-[min(68%,46rem)]'
                        : 'max-w-[90%] sm:max-w-[85%] lg:max-w-[min(82%,64rem)]'
                    }`}
                  >
                    <div
                      className={`p-4 sm:px-5 sm:py-4 rounded-[22px] text-[13.5px] sm:text-[15px] leading-[1.68] whitespace-pre-line break-words ${
                        isUser
                          ? 'bg-[#C9B7E8]/45 text-[#343047] border border-[#DFD2F2] rounded-tr-[6px] shadow-[0_6px_16px_-6px_rgba(167,139,206,0.28)]'
                          : 'bg-[#FAF6F2] text-[#343047] border border-[#EEE6E5] rounded-tl-[6px] shadow-[0_6px_16px_-6px_rgba(124,102,148,0.12)]'
                      }`}
                    >
                      {msg.text}

                      {msg.codeSnippet && (
                        <div className="mt-3.5 p-3.5 sm:p-4 rounded-[14px] bg-[#343047] text-[#F7F3FB] text-xs sm:text-[13px] font-mono overflow-x-auto max-w-full">
                          {msg.language && (
                            <div className="text-[10px] uppercase tracking-wider text-[#C9B7E8] mb-1.5 font-bold">
                              {msg.language}
                            </div>
                          )}
                          <pre className="leading-relaxed">{msg.codeSnippet}</pre>
                        </div>
                      )}

                      {msg.recommendedResources && msg.recommendedResources.length > 0 && (
                        <div className="mt-3.5 pt-3.5 border-t border-[#E8DFF5] space-y-2">
                          <p className="text-xs font-extrabold text-[#6F4FA8] flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5 shrink-0" />
                            <span>Verified Skillora Resources</span>
                          </p>
                          <div
                            className={`grid gap-2 ${
                              msg.recommendedResources.length > 1
                                ? 'grid-cols-1 md:grid-cols-2'
                                : 'grid-cols-1'
                            }`}
                          >
                            {msg.recommendedResources.map((res) => (
                              <a
                                key={res.id}
                                href={res.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between gap-2.5 p-2.5 sm:p-3 rounded-[12px] bg-[#FFFCFA] border border-[#E2D6F5] hover:border-[#A78BCE] transition-colors group min-w-0"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-[#343047] truncate group-hover:text-[#6F4FA8]">
                                    {res.title}
                                  </p>
                                  <p className="text-[11px] text-[#8B8295] truncate">
                                    {res.provider} · {res.type} · {res.subjectLabel}
                                  </p>
                                </div>
                                <ExternalLink className="w-3.5 h-3.5 text-[#8E6EC8] shrink-0" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {!isUser &&
                      msg.suggestedFollowUps &&
                      msg.suggestedFollowUps.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {msg.suggestedFollowUps.map((followUp, fIdx) => (
                            <button
                              key={fIdx}
                              type="button"
                              disabled={isTyping || isLoadingHistory}
                              onClick={() => void handleSendPrompt(followUp)}
                              className="px-3 py-1.5 rounded-full bg-[#F0E9FA]/80 border border-[#DFD2F2] hover:border-[#A78BCE] text-[11px] font-bold text-[#6F4FA8] transition-colors disabled:opacity-50 text-left"
                            >
                              {followUp}
                            </button>
                          ))}
                        </div>
                      )}

                    <div
                      className={`flex items-center gap-2 text-[10px] text-[#8B8295] px-1 ${
                        isUser ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <span>{msg.timestamp}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {isTyping && (
            <div className="flex items-start gap-3 sm:gap-3.5 min-w-0">
              <div className="w-9 h-9 rounded-[14px] bg-[#FFF1D6] border border-[#F3DFB4] flex items-center justify-center shrink-0">
                <SmilingCloudMascot3D className="w-8 h-6" />
              </div>
              {streamingReplyText ? (
                <div className="min-w-0 max-w-[90%] sm:max-w-[85%] lg:max-w-[min(82%,64rem)] space-y-1">
                  <div className="p-4 sm:px-5 sm:py-4 rounded-[22px] rounded-tl-[6px] bg-[#FAF6F2] text-[#343047] border border-[#EEE6E5] shadow-[0_6px_16px_-6px_rgba(124,102,148,0.12)] text-[13.5px] sm:text-[15px] leading-[1.68] whitespace-pre-line break-words">
                    {streamingReplyText}
                    <span className="inline-block w-1.5 h-4 ml-1 bg-[#8E6EC8] animate-pulse align-middle rounded-xs" />
                  </div>
                </div>
              ) : (
                <div className="p-3.5 px-4 rounded-[20px] bg-[#FAF6F2] border border-[#EEE6E5] text-[#6B6178] text-xs flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#C9B7E8] animate-bounce" />
                  <span className="w-2 h-2 rounded-full bg-[#F8D9D0] animate-bounce delay-100" />
                  <span className="w-2 h-2 rounded-full bg-[#A9D5B3] animate-bounce delay-200" />
                  <span className="text-xs font-medium ml-1">
                    Personalizing your explanation...
                  </span>
                </div>
              )}
            </div>
          )}

          {errorBanner && (
            <div className="p-3.5 sm:px-4 rounded-[16px] bg-[#FCEAE5] border border-[#F4CBC1] text-[#8E4335] text-xs flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="font-semibold break-words">{errorBanner.message}</span>
              </div>
              {errorBanner.retryPrompt && (
                <button
                  type="button"
                  disabled={isTyping || isLoadingHistory}
                  onClick={() => {
                    const retryText = errorBanner.retryPrompt!;
                    const retryTurnId = errorBanner.retryTurnId;
                    void handleSendPrompt(retryText, {
                      isRetry: true,
                      clientTurnId: retryTurnId,
                    });
                  }}
                  className="px-3.5 py-1.5 rounded-full bg-[#FFFCFA] border border-[#F4CBC1] text-[11px] font-bold text-[#8E4335] hover:bg-[#FFF5F2] flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Suggested Prompts (Full-Width Horizontal Scrollable Strip) */}
      <div className="px-4 sm:px-6 lg:px-8 py-2.5 border-t border-[#EEE6E5] bg-[#FAF6F2]/75 shrink-0 min-w-0">
        <div className="w-full flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-[11px] font-bold text-[#8B8295] whitespace-nowrap shrink-0">
            Try asking:
          </span>
          {suggestedQuestions.map((q, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isTyping || isLoadingHistory}
              onClick={() => void handleSendPrompt(q)}
              className="px-3.5 py-1.5 rounded-full bg-[#FFFCFA] border border-[#EEE6E5] hover:border-[#C9B7E8] hover:bg-[#F0E9FA]/60 text-[#343047] text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 shadow-2xs disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Full-Width Bottom Input Composer */}
      <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-3.5 border-t border-[#EEE6E5] bg-[#FFFCFA] shrink-0">
        <div className="relative flex items-center w-full">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isTyping}
            maxLength={2000}
            placeholder={
              resolvedLessonInfo
                ? `Ask about "${resolvedLessonInfo.lessonTitle}", practice questions, or your career goal...`
                : 'Ask about your study topics, practice questions, weak areas, or career goals...'
            }
            className="w-full py-3 sm:py-3.5 pl-5 pr-14 text-xs sm:text-sm bg-[#FAF6F2] border border-[#EEE6E5] rounded-full focus:bg-[#FFFCFA] focus:outline-none focus:ring-2 focus:ring-[#C9B7E8] transition-all text-[#343047] placeholder:text-[#A49BB0] disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void handleSendPrompt(inputValue)}
            disabled={!inputValue.trim() || isTyping || isLoadingHistory}
            className="absolute right-1.5 w-10 h-10 rounded-full clay-button-primary flex items-center justify-center disabled:opacity-40 shrink-0"
            aria-label="Send message"
          >
            {isTyping ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-[#8B8295] px-2 min-w-0">
          <span className="truncate">Press Enter to send · Context-aware multi-turn mentoring</span>
          <span className="font-mono shrink-0 truncate max-w-[45%]">
            {resolvedLessonInfo ? `Lesson: ${resolvedLessonInfo.lessonTitle}` : user.knowledgeLevel}
          </span>
        </div>
      </div>
    </div>
  );
};
