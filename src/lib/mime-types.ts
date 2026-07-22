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

export const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
