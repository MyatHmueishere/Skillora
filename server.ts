import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  handleGenerateRoadmapRequest,
  RoadmapApiError,
} from './server/roadmapGenerator';
import {
  handleGenerateLessonContentRequest,
  handleGetCourseResourcesRequest,
  handleClarifyLessonRequest,
  LessonApiError,
} from './server/lessonGenerator';
import {
  handleStartKnowledgeCheck,
  handleCheckSingleAnswer,
  handleSubmitKnowledgeCheck,
  handleGetKnowledgeCheckHistory,
  KnowledgeCheckApiError,
} from './server/knowledgeCheckService';
import {
  handleGetExploreResourcesRequest,
  ExploreResourcesApiError,
  warmCatalogYouTubeVerification,
} from './server/exploreResourcesService';
import {
  handleListAssistantConversations,
  handleCreateAssistantConversation,
  handleDeleteAssistantConversation,
  handleAssistantChatRequest,
  handleAssistantChatStreamRequest,
  AssistantApiError,
  AssistantHistoryTurnInput,
  AssistantLessonContextInput,
} from './server/assistantService';
import {
  getPushPublicConfig,
  handleGetNotificationPreferences,
  handleUpdateNotificationPreferences,
  handleRegisterPushSubscription,
  handleRemovePushSubscription,
  handleSendTestPush,
  dispatchScheduledInactivityNotifications,
  verifyCronAuthorization,
  startNotificationScheduler,
  NotificationApiError,
  ServerNotificationPreferences,
} from './server/notificationService';
import {
  handleSyncUserAchievements,
  AchievementApiError,
} from './server/achievementService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // Safely expose ONLY the public Supabase URL and publishable key to the frontend.
  // Never expose GEMINI_API_KEY, service-role keys, database passwords, or other secrets.
  app.get('/api/config/supabase', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      supabaseUrl: process.env.SUPABASE_URL ?? '',
      supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? '',
    });
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      supabaseConfigured: Boolean(
        process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
      ),
    });
  });

  // Server-side AI roadmap generation (requires verified Supabase Bearer access token)
  app.post('/api/roadmaps/generate', async (req, res) => {
    try {
      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as { replaceActive?: unknown })
          : {};
      const replaceActive = body.replaceActive === true;

      const result = await handleGenerateRoadmapRequest({
        authorizationHeader: req.headers.authorization,
        replaceActive,
      });

      res.status(result.statusCode).json({ roadmap: result.record });
    } catch (err) {
      if (err instanceof RoadmapApiError) {
        res.status(err.status).json({
          code: err.code,
          error: err.message,
        });
        return;
      }

      console.error('[Skillora] Unexpected error in POST /api/roadmaps/generate:', err);
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred while generating your learning roadmap.',
      });
    }
  });

  // Server-side AI lesson content generation (requires verified Supabase Bearer access token)
  app.post('/api/lessons/generate', async (req, res) => {
    try {
      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as {
              roadmapId?: unknown;
              stageId?: unknown;
              lessonId?: unknown;
              forceRegenerate?: unknown;
            })
          : {};

      const lessonContent = await handleGenerateLessonContentRequest({
        authorizationHeader: req.headers.authorization,
        roadmapId: typeof body.roadmapId === 'string' ? body.roadmapId.trim() : '',
        stageId: typeof body.stageId === 'string' ? body.stageId.trim() : '',
        lessonId: typeof body.lessonId === 'string' ? body.lessonId.trim() : '',
        forceRegenerate: body.forceRegenerate === true,
      });

      res.status(200).json({ lessonContent });
    } catch (err) {
      if (err instanceof LessonApiError) {
        res.status(err.status).json({
          code: err.code,
          error: err.message,
        });
        return;
      }

      console.error('[Skillora] Unexpected error in POST /api/lessons/generate:', err);
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred while generating lesson content.',
      });
    }
  });

  // Fast course-specific verified resource matching (no Gemini latency)
  app.post('/api/courses/resources', async (req, res) => {
    try {
      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as { roadmapId?: unknown; stageId?: unknown })
          : {};

      const resources = await handleGetCourseResourcesRequest({
        authorizationHeader: req.headers.authorization,
        roadmapId: typeof body.roadmapId === 'string' ? body.roadmapId.trim() : '',
        stageId: typeof body.stageId === 'string' ? body.stageId.trim() : '',
      });

      res.status(200).json({ resources });
    } catch (err) {
      if (err instanceof LessonApiError) {
        res.status(err.status).json({
          code: err.code,
          error: err.message,
        });
        return;
      }

      console.error('[Skillora] Unexpected error in POST /api/courses/resources:', err);
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred while loading course resources.',
      });
    }
  });

  // Server-side AI lesson clarification Q&A (requires verified Supabase Bearer access token)
  app.post('/api/lessons/clarify', async (req, res) => {
    try {
      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as {
              roadmapId?: unknown;
              stageId?: unknown;
              lessonId?: unknown;
              question?: unknown;
              currentSection?: unknown;
              history?: unknown;
            })
          : {};

      const clarification = await handleClarifyLessonRequest({
        authorizationHeader: req.headers.authorization,
        roadmapId: typeof body.roadmapId === 'string' ? body.roadmapId.trim() : '',
        stageId: typeof body.stageId === 'string' ? body.stageId.trim() : '',
        lessonId: typeof body.lessonId === 'string' ? body.lessonId.trim() : '',
        question: typeof body.question === 'string' ? body.question : '',
        currentSection:
          typeof body.currentSection === 'string' ? body.currentSection : undefined,
        history: Array.isArray(body.history) ? body.history : undefined,
      });

      res.status(200).json({ clarification });
    } catch (err) {
      if (err instanceof LessonApiError) {
        res.status(err.status).json({
          code: err.code,
          error: err.message,
        });
        return;
      }

      console.error('[Skillora] Unexpected error in POST /api/lessons/clarify:', err);
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred while answering your question.',
      });
    }
  });

  // Start a server-generated, objective-aligned Lesson Knowledge Check
  app.post('/api/knowledge-checks/start', async (req, res) => {
    try {
      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as {
              roadmapId?: unknown;
              stageId?: unknown;
              lessonId?: unknown;
              questionCount?: unknown;
            })
          : {};

      const quiz = await handleStartKnowledgeCheck({
        authorizationHeader: req.headers.authorization,
        roadmapId: typeof body.roadmapId === 'string' ? body.roadmapId.trim() : '',
        stageId: typeof body.stageId === 'string' ? body.stageId.trim() : '',
        lessonId: typeof body.lessonId === 'string' ? body.lessonId.trim() : '',
        questionCount:
          typeof body.questionCount === 'number' ? body.questionCount : undefined,
      });

      res.status(200).json({ quiz });
    } catch (err) {
      if (err instanceof KnowledgeCheckApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error('[Skillora] Unexpected error in POST /api/knowledge-checks/start:', err);
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred while preparing your Knowledge Check.',
      });
    }
  });

  // Validate a single answer on the server for instant feedback
  app.post('/api/knowledge-checks/check-answer', async (req, res) => {
    try {
      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as {
              quizToken?: unknown;
              questionId?: unknown;
              selectedOptionIndex?: unknown;
            })
          : {};

      const feedback = await handleCheckSingleAnswer({
        authorizationHeader: req.headers.authorization,
        quizToken: typeof body.quizToken === 'string' ? body.quizToken : '',
        questionId: typeof body.questionId === 'string' ? body.questionId : '',
        selectedOptionIndex: Number(body.selectedOptionIndex),
      });

      res.status(200).json({ feedback });
    } catch (err) {
      if (err instanceof KnowledgeCheckApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error('[Skillora] Unexpected error in POST /api/knowledge-checks/check-answer:', err);
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred while checking your answer.',
      });
    }
  });

  // Grade full quiz securely on the server, detect gaps, compute recommendation, and persist to Supabase
  app.post('/api/knowledge-checks/submit', async (req, res) => {
    try {
      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as { quizToken?: unknown; answers?: unknown })
          : {};

      const rawAnswers =
        body.answers && typeof body.answers === 'object'
          ? (body.answers as Record<string, number>)
          : {};

      const result = await handleSubmitKnowledgeCheck({
        authorizationHeader: req.headers.authorization,
        quizToken: typeof body.quizToken === 'string' ? body.quizToken : '',
        answers: rawAnswers,
      });

      res.status(200).json(result);
    } catch (err) {
      if (err instanceof KnowledgeCheckApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error('[Skillora] Unexpected error in POST /api/knowledge-checks/submit:', err);
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred while submitting your Knowledge Check.',
      });
    }
  });

  // Load authenticated student's saved Knowledge Check learning history
  app.get('/api/knowledge-checks/history', async (req, res) => {
    try {
      const history = await handleGetKnowledgeCheckHistory({
        authorizationHeader: req.headers.authorization,
      });
      res.status(200).json(history);
    } catch (err) {
      if (err instanceof KnowledgeCheckApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error('[Skillora] Unexpected error in GET /api/knowledge-checks/history:', err);
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred while loading your Knowledge Check history.',
      });
    }
  });

  // Load Explore Resources library with server-side personalized "For You" recommendations
  app.get('/api/resources/explore', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const bypassCache = req.query.refresh === '1';
      const payload = await handleGetExploreResourcesRequest({
        authorizationHeader: req.headers.authorization,
        bypassCache,
      });
      res.status(200).json(payload);
    } catch (err) {
      if (err instanceof ExploreResourcesApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error('[Skillora] Unexpected error in GET /api/resources/explore:', err);
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred while loading Explore Resources.',
      });
    }
  });

  // Load authenticated student's saved AI Assistant conversations & messages
  app.get('/api/assistant/conversations', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const conversationId =
        typeof req.query.conversationId === 'string' ? req.query.conversationId.trim() : undefined;
      const result = await handleListAssistantConversations({
        authorizationHeader: req.headers.authorization,
        conversationId,
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AssistantApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error('[Skillora] Unexpected error in GET /api/assistant/conversations');
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred while loading conversations.',
      });
    }
  });

  // Start a new AI Assistant conversation
  app.post('/api/assistant/conversations', async (req, res) => {
    try {
      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as { title?: unknown; lessonContext?: AssistantLessonContextInput })
          : {};
      const result = await handleCreateAssistantConversation({
        authorizationHeader: req.headers.authorization,
        title: typeof body.title === 'string' ? body.title : undefined,
        lessonContext:
          body.lessonContext && typeof body.lessonContext === 'object'
            ? body.lessonContext
            : undefined,
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof AssistantApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error('[Skillora] Unexpected error in POST /api/assistant/conversations');
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred while creating a conversation.',
      });
    }
  });

  // Delete an AI Assistant conversation owned by the authenticated student
  app.delete('/api/assistant/conversations/:id', async (req, res) => {
    try {
      const result = await handleDeleteAssistantConversation({
        authorizationHeader: req.headers.authorization,
        conversationId: req.params.id,
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AssistantApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error('[Skillora] Unexpected error in DELETE /api/assistant/conversations/:id');
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred while deleting the conversation.',
      });
    }
  });

  // Multi-turn personalized Gemini AI Learning Assistant chat endpoint
  app.post('/api/assistant/chat', async (req, res) => {
    const requestId = `req_${crypto.randomUUID().slice(0, 8)}`;
    res.setHeader('X-Request-Id', requestId);
    try {
      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as {
              conversationId?: unknown;
              message?: unknown;
              history?: AssistantHistoryTurnInput[];
              lessonContext?: AssistantLessonContextInput;
              clientTurnId?: unknown;
            })
          : {};
      const result = await handleAssistantChatRequest({
        authorizationHeader: req.headers.authorization,
        conversationId:
          typeof body.conversationId === 'string' ? body.conversationId.trim() : undefined,
        message: typeof body.message === 'string' ? body.message : '',
        history: Array.isArray(body.history) ? body.history : undefined,
        lessonContext:
          body.lessonContext && typeof body.lessonContext === 'object'
            ? body.lessonContext
            : undefined,
        clientTurnId:
          typeof body.clientTurnId === 'string' ? body.clientTurnId.trim() : undefined,
        requestId,
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AssistantApiError) {
        res.status(err.status).json({ requestId, code: err.code, error: err.message });
        return;
      }
      console.error(`[Skillora][${requestId}] Unexpected error in POST /api/assistant/chat`);
      res.status(500).json({
        requestId,
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred while reaching the AI Study Companion.',
      });
    }
  });

  // Streaming SSE endpoint for real-time AI Learning Assistant responses
  app.post('/api/assistant/chat/stream', async (req, res) => {
    const requestId = `req_${crypto.randomUUID().slice(0, 8)}`;
    res.setHeader('X-Request-Id', requestId);
    const abortController = new AbortController();
    let sseStarted = false;
    let clientClosed = false;
    let keepaliveTimer: NodeJS.Timeout | undefined;

    const clearKeepalive = () => {
      if (keepaliveTimer) {
        clearInterval(keepaliveTimer);
        keepaliveTimer = undefined;
      }
    };

    const handleClose = () => {
      if (res.writableFinished) return;
      clientClosed = true;
      clearKeepalive();
      abortController.abort();
    };
    res.on('close', handleClose);

    const writeSse = (event: string, data: unknown) => {
      if (clientClosed || res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as {
              conversationId?: unknown;
              message?: unknown;
              history?: AssistantHistoryTurnInput[];
              lessonContext?: AssistantLessonContextInput;
              clientTurnId?: unknown;
            })
          : {};

      const result = await handleAssistantChatStreamRequest({
        authorizationHeader: req.headers.authorization,
        conversationId:
          typeof body.conversationId === 'string' ? body.conversationId.trim() : undefined,
        message: typeof body.message === 'string' ? body.message : '',
        history: Array.isArray(body.history) ? body.history : undefined,
        lessonContext:
          body.lessonContext && typeof body.lessonContext === 'object'
            ? body.lessonContext
            : undefined,
        clientTurnId:
          typeof body.clientTurnId === 'string' ? body.clientTurnId.trim() : undefined,
        requestId,
        signal: abortController.signal,
        onStart: ({ requestId: startedReqId, conversationId: convId }) => {
          if (clientClosed || res.headersSent) return;
          sseStarted = true;
          res.status(200);
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('X-Accel-Buffering', 'no');
          res.flushHeaders?.();
          writeSse('start', { requestId: startedReqId, conversationId: convId });
          clearKeepalive();
          keepaliveTimer = setInterval(() => {
            if (!clientClosed && !res.writableEnded) {
              res.write(': keepalive\n\n');
            }
          }, 8_000);
        },
        onDelta: (deltaText) => {
          if (deltaText) {
            writeSse('delta', { text: deltaText });
          }
        },
      });

      clearKeepalive();

      if (!sseStarted && !res.headersSent) {
        res.status(200).json(result);
        return;
      }

      writeSse('done', result);
      if (!res.writableEnded) res.end();
    } catch (err) {
      clearKeepalive();
      if (clientClosed) {
        if (!res.writableEnded) res.end();
        return;
      }

      const status = err instanceof AssistantApiError ? err.status : 500;
      const code = err instanceof AssistantApiError ? err.code : 'INTERNAL_SERVER_ERROR';
      const message =
        err instanceof AssistantApiError
          ? err.message
          : 'An unexpected error occurred while reaching the AI Study Companion.';

      if (sseStarted || res.headersSent) {
        writeSse('error', { requestId, status, code, error: message });
        if (!res.writableEnded) res.end();
      } else {
        res.status(status).json({ requestId, code, error: message });
      }
    } finally {
      clearKeepalive();
      res.off('close', handleClose);
    }
  });

  // Public Web Push VAPID & scheduler capability status (never leaks private keys)
  app.get('/api/notifications/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(getPushPublicConfig());
  });

  // Load authenticated student's notification preferences & subscription count
  app.get('/api/notifications/preferences', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const result = await handleGetNotificationPreferences({
        authorizationHeader: req.headers.authorization,
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof NotificationApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error('[Skillora] Unexpected error in GET /api/notifications/preferences:', err);
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred while loading notification preferences.',
      });
    }
  });

  // Update authenticated student's notification preferences
  app.put('/api/notifications/preferences', async (req, res) => {
    try {
      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as Partial<ServerNotificationPreferences>)
          : {};
      const result = await handleUpdateNotificationPreferences({
        authorizationHeader: req.headers.authorization,
        updates: body,
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof NotificationApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error('[Skillora] Unexpected error in PUT /api/notifications/preferences:', err);
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred while saving notification preferences.',
      });
    }
  });

  // Register a browser Web Push subscription for the signed-in student
  app.post('/api/notifications/subscriptions', async (req, res) => {
    try {
      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as {
              endpoint?: unknown;
              keys?: { p256dh?: unknown; auth?: unknown };
              userAgent?: unknown;
            })
          : {};
      const result = await handleRegisterPushSubscription({
        authorizationHeader: req.headers.authorization,
        endpoint: typeof body.endpoint === 'string' ? body.endpoint : '',
        p256dh: typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : '',
        auth: typeof body.keys?.auth === 'string' ? body.keys.auth : '',
        userAgent: typeof body.userAgent === 'string' ? body.userAgent : undefined,
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof NotificationApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error('[Skillora] Unexpected error in POST /api/notifications/subscriptions:', err);
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred while registering your push subscription.',
      });
    }
  });

  // Disable push subscription(s) for the signed-in student
  app.delete('/api/notifications/subscriptions', async (req, res) => {
    try {
      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as { endpoint?: unknown })
          : {};
      const result = await handleRemovePushSubscription({
        authorizationHeader: req.headers.authorization,
        endpoint: typeof body.endpoint === 'string' ? body.endpoint : undefined,
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof NotificationApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error('[Skillora] Unexpected error in DELETE /api/notifications/subscriptions:', err);
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred while disabling push notifications.',
      });
    }
  });

  // Trigger a test browser push notification for the signed-in student
  app.post('/api/notifications/test-push', async (req, res) => {
    try {
      const result = await handleSendTestPush({
        authorizationHeader: req.headers.authorization,
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof NotificationApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error('[Skillora] Unexpected error in POST /api/notifications/test-push:', err);
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred while sending your test push notification.',
      });
    }
  });

  // External cron/scheduler trigger for background inactivity notification dispatch
  app.post('/api/notifications/dispatch-scheduled', async (req, res) => {
    if (!verifyCronAuthorization(req.headers)) {
      res.status(401).json({
        code: 'UNAUTHORIZED_CRON',
        error: 'Valid CRON_SECRET authorization is required.',
      });
      return;
    }

    try {
      const summary = await dispatchScheduledInactivityNotifications();
      res.status(200).json(summary);
    } catch (err) {
      if (err instanceof NotificationApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error('[Skillora] Unexpected error in POST /api/notifications/dispatch-scheduled:', err);
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred during scheduled notification dispatch.',
      });
    }
  });

  // Load and idempotently backfill/reconcile verified Achievement Badges & XP for the signed-in learner
  app.get('/api/achievements', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const timeZone =
        typeof req.query.timeZone === 'string' ? req.query.timeZone.trim() : undefined;
      const summary = await handleSyncUserAchievements({
        authorizationHeader: req.headers.authorization,
        timeZone,
      });
      res.status(200).json(summary);
    } catch (err) {
      if (err instanceof AchievementApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error('[Skillora] Unexpected error in GET /api/achievements:', err);
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred while loading your achievements and XP.',
      });
    }
  });

  // Synchronize verified XP & achievement badges strictly from canonical DB records (ignores any client XP inputs)
  app.post('/api/achievements/sync', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as { timeZone?: unknown })
          : {};
      const timeZone =
        typeof body.timeZone === 'string' ? body.timeZone.trim() : undefined;
      const summary = await handleSyncUserAchievements({
        authorizationHeader: req.headers.authorization,
        timeZone,
      });
      res.status(200).json(summary);
    } catch (err) {
      if (err instanceof AchievementApiError) {
        res.status(err.status).json({ code: err.code, error: err.message });
        return;
      }
      console.error('[Skillora] Unexpected error in POST /api/achievements/sync:', err);
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        error: 'An unexpected error occurred while syncing your achievements and XP.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Skillora server running on http://0.0.0.0:${PORT}`);
    warmCatalogYouTubeVerification();
    startNotificationScheduler();
  });
}

startServer().catch((err) => {
  console.error('Failed to start Skillora server:', err);
  process.exit(1);
});
