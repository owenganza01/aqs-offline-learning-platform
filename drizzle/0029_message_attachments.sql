-- Migration 0029: Message attachments (base64-in-row, mirror of documents.file_data)
--
-- Adds optional single-attachment columns to the messages table. Metadata stays
-- in structured columns; the base64 payload lives in attachment_data and is
-- never returned in normal message-list/send responses (only via the dedicated
-- authenticated GET /api/messages/:id/attachment endpoint).
--
-- IF NOT EXISTS keeps this idempotent alongside the error-tolerant runner.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS attachment_file_name text,
  ADD COLUMN IF NOT EXISTS attachment_mime_type text,
  ADD COLUMN IF NOT EXISTS attachment_file_size integer,
  ADD COLUMN IF NOT EXISTS attachment_data text;