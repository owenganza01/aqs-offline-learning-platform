// src/lib/mime-types.ts
// Allowed MIME types for lesson slide/document uploads.
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

export const ALLOWED_SLIDE_EXTENSIONS = '.pdf,.ppt,.pptx,.key,.odp';

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
