// src/server/routes/messages.ts
import { Application, RequestHandler } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody, sendMessageSchema } from '../../middleware/validate.js';
import {
  sendMessageHandler,
  listConversationsHandler,
  getMessagesHandler,
  markAsReadHandler,
  unreadTotalHandler,
} from '../controllers/messaging-controller.js';

export interface MessageRouteDeps {
  messageRateLimit: RequestHandler;
}

export function registerMessageRoutes(app: Application, deps: MessageRouteDeps): void {
  app.post(
    '/api/messages/send',
    requireAuth,
    deps.messageRateLimit,
    validateBody(sendMessageSchema),
    sendMessageHandler,
  );

  app.get('/api/messages/conversations', requireAuth, deps.messageRateLimit, listConversationsHandler);

  app.get('/api/messages/conversations/:conversationId', requireAuth, deps.messageRateLimit, getMessagesHandler);

  app.post('/api/messages/conversations/:conversationId/read', requireAuth, deps.messageRateLimit, markAsReadHandler);

  app.get('/api/messages/unread-total', requireAuth, deps.messageRateLimit, unreadTotalHandler);
}
