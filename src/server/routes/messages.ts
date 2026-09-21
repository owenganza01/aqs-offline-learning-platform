// src/server/routes/messages.ts
import { Application, RequestHandler } from 'express';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody, sendMessageSchema } from '../../middleware/validate.js';
import { ALLOWED_MESSAGE_MIME_TYPE_SET, MAX_UPLOAD_SIZE_BYTES } from '../../lib/mime-types.js';
import {
  sendMessageHandler,
  listConversationsHandler,
  getMessagesHandler,
  markAsReadHandler,
  unreadTotalHandler,
  getMessageAttachmentHandler,
} from '../controllers/messaging-controller.js';

// Mirrors the document-upload multer config: memory storage, size-capped,
// MIME allowlisted. Attachments ride along on the send endpoint as an optional
// multipart field named "attachment".
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MESSAGE_MIME_TYPE_SET.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

export interface MessageRouteDeps {
  messageRateLimit: RequestHandler;
}

export function registerMessageRoutes(app: Application, deps: MessageRouteDeps): void {
  app.post(
    '/api/messages/send',
    requireAuth,
    deps.messageRateLimit,
    upload.single('attachment'),
    validateBody(sendMessageSchema),
    sendMessageHandler,
  );

  app.get('/api/messages/conversations', requireAuth, deps.messageRateLimit, listConversationsHandler);

  app.get('/api/messages/conversations/:conversationId', requireAuth, deps.messageRateLimit, getMessagesHandler);

  app.get(
    '/api/messages/conversations/:conversationId/messages/:messageId/attachment',
    requireAuth,
    deps.messageRateLimit,
    getMessageAttachmentHandler,
  );

  app.post('/api/messages/conversations/:conversationId/read', requireAuth, deps.messageRateLimit, markAsReadHandler);

  app.get('/api/messages/unread-total', requireAuth, deps.messageRateLimit, unreadTotalHandler);
}
