// src/lib/mime-types.ts
// Allowed MIME types for lesson slide/document/video uploads.
// Used by both the multer fileFilter and the frontend accept attribute.

export const ALLOWED_SLIDE_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.apple.keynote': 'key',
  'application/vnd.oasis.opendocument.presentation': 'odp',
  'application/vnd.ms-powerpoint.presentation.macroenabled.12': 'pptm',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation.macroenabled.12': 'pptxm',
};

export const ALLOWED_SLIDE_MIME_TYPE_SET = new Set(Object.keys(ALLOWED_SLIDE_MIME_TYPES));

export const VIDEO_MIME_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/x-matroska': 'mkv',
};

export const VIDEO_MIME_TYPE_SET = new Set(Object.keys(VIDEO_MIME_TYPES));

export const ALL_MIME_TYPE_SET = new Set([...ALLOWED_SLIDE_MIME_TYPE_SET, ...VIDEO_MIME_TYPE_SET]);

export const ALLOWED_SLIDE_EXTENSIONS = '.pdf,.ppt,.pptx,.key,.odp';

export const ALLOWED_VIDEO_EXTENSIONS = '.mp4,.webm,.ogv,.mov,.avi,.mkv';

// Allowed MIME types for message attachments. Documents/office files only —
// no executables or scripts. Used by both the multer fileFilter on
// POST /api/messages/send and the frontend accept attribute.
export const ALLOWED_MESSAGE_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'text/plain': 'txt',
};

export const ALLOWED_MESSAGE_MIME_TYPE_SET = new Set(Object.keys(ALLOWED_MESSAGE_MIME_TYPES));

export const ALLOWED_MESSAGE_EXTENSIONS = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.txt';

// Allowed MIME types for course cover images (DEF-004).
// Deliberately NOT folded into ALL_MIME_TYPE_SET: that set gates lesson slide
// and video uploads, and widening it would let an image be uploaded as a
// lesson "video"/"slide" where it cannot be rendered. Course covers get their
// own set and their own upload route.
export const ALLOWED_IMAGE_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const ALLOWED_IMAGE_MIME_TYPE_SET = new Set(Object.keys(ALLOWED_IMAGE_MIME_TYPES));

export const ALLOWED_IMAGE_EXTENSIONS = '.jpg,.jpeg,.png,.webp';

// Cover art is rendered as a thumbnail on a dashboard card, so it does not need
// anywhere near the 100 MB lesson-upload budget.
export const MAX_COVER_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
