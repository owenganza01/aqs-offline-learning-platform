// src/server/controllers/messaging-controller.ts
import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.js';
import {
  sendMessage,
  listConversations,
  getMessages,
  markAsRead,
  getUnreadTotal,
  getMessageAttachment,
  MessagingError,
} from '../services/messaging-service.js';

type AttachmentRequest = AuthRequest & { file?: Express.Multer.File };

export async function sendMessageHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { conversationId, courseId, instructorId, learnerId, content } = req.body;
    const file = (req as AttachmentRequest).file;
    const attachment = file
      ? {
          fileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          data: file.buffer,
        }
      : undefined;
    const result = await sendMessage(
      req.dbUser!.id,
      content,
      { conversationId, courseId, instructorId, learnerId },
      attachment,
    );
    res.status(201).json({
      success: true,
      conversationId: result.conversation.id,
      message: {
        ...result.message,
        createdAt: result.message.createdAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    if (error instanceof MessagingError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message.' });
  }
}

export async function listConversationsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const conversations = await listConversations(req.dbUser!.id);
    res.json({ conversations });
  } catch (error: unknown) {
    if (error instanceof MessagingError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('List conversations error:', error);
    res.status(500).json({ error: 'Failed to list conversations.' });
  }
}

export async function getMessagesHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const conversationId = parseInt(req.params.conversationId);
    if (isNaN(conversationId)) {
      res.status(400).json({ error: 'Invalid conversation ID.' });
      return;
    }
    const result = await getMessages(conversationId, req.dbUser!.id);
    res.json({
      conversation: result.conversation,
      messages: result.messages.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    if (error instanceof MessagingError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to load messages.' });
  }
}

export async function markAsReadHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const conversationId = parseInt(req.params.conversationId);
    if (isNaN(conversationId)) {
      res.status(400).json({ error: 'Invalid conversation ID.' });
      return;
    }
    const marked = await markAsRead(conversationId, req.dbUser!.id);
    res.json({ success: true, marked });
  } catch (error: unknown) {
    if (error instanceof MessagingError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to update read state.' });
  }
}

export async function unreadTotalHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const total = await getUnreadTotal(req.dbUser!.id);
    res.json({ unreadTotal: total });
  } catch (error: unknown) {
    if (error instanceof MessagingError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Unread total error:', error);
    res.status(500).json({ error: 'Failed to load unread count.' });
  }
}

export async function getMessageAttachmentHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const conversationId = parseInt(req.params.conversationId);
    const messageId = parseInt(req.params.messageId);
    if (isNaN(conversationId) || isNaN(messageId)) {
      res.status(400).json({ error: 'Invalid message ID.' });
      return;
    }
    const attachment = await getMessageAttachment(conversationId, messageId, req.dbUser!.id);
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`);
    res.setHeader('Content-Length', String(attachment.data.length));
    res.send(attachment.data);
  } catch (error: unknown) {
    if (error instanceof MessagingError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Get message attachment error:', error);
    res.status(500).json({ error: 'Failed to load attachment.' });
  }
}
