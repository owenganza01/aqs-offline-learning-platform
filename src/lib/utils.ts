// src/lib/utils.ts
import { Course } from '../types.ts';

export const getCourseImage = (course: Course): string => {
  const title = (course.title || '').toLowerCase();
  const desc = (course.description || '').toLowerCase();
  const text = `${title} ${desc}`;

  if (
    text.includes('web development') ||
    text.includes('html') ||
    text.includes('css') ||
    text.includes('javascript') ||
    text.includes('frontend')
  ) {
    return 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=80';
  }
  if (text.includes('react') || text.includes('component') || text.includes('hook')) {
    return 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?auto=format&fit=crop&w=600&q=80';
  }
  if (text.includes('design') || text.includes('ui/ux') || text.includes('interface') || text.includes('figma')) {
    return 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=600&q=80';
  }
  if (
    text.includes('agri') ||
    text.includes('crop') ||
    text.includes('soil') ||
    text.includes('farm') ||
    text.includes('field')
  ) {
    return 'https://images.unsplash.com/photo-1560493676-04071c5f467b?auto=format&fit=crop&w=600&q=80';
  }
  if (
    text.includes('math') ||
    text.includes('quant') ||
    text.includes('stat') ||
    text.includes('model') ||
    text.includes('estim')
  ) {
    return 'https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=600&q=80';
  }
  return 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80';
};

// YouTube URL normalization — accepts embed code, watch URLs, shorts, youtu.be, bare IDs
const YT_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

function extractVideoId(input: string): string | null {
  const s = input.trim();
  if (YT_VIDEO_ID.test(s)) return s;

  // If it contains an iframe tag, extract src attribute
  const srcMatch = s.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (srcMatch) return extractVideoId(srcMatch[1]);

  try {
    const url = new URL(s);
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');

    // youtube.com/embed/{id}
    if ((host === 'youtube.com' || host === 'youtube-nocookie.com') && url.pathname.startsWith('/embed/')) {
      const id = url.pathname.split('/embed/')[1]?.split('/')[0]?.split('?')[0];
      if (id && YT_VIDEO_ID.test(id)) return id;
    }

    // youtube.com/watch?v={id}
    if (host === 'youtube.com' && url.pathname === '/watch') {
      const id = url.searchParams.get('v');
      if (id && YT_VIDEO_ID.test(id)) return id;
    }

    // youtu.be/{id}
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0].split('?')[0];
      if (id && YT_VIDEO_ID.test(id)) return id;
    }

    // youtube.com/shorts/{id}, youtube.com/live/{id}
    if (host === 'youtube.com') {
      const match = url.pathname.match(/^\/(shorts|live)\/([a-zA-Z0-9_-]{11})/);
      if (match) return match[2];
    }
  } catch {
    // Not a valid URL — treat as bare video ID
  }

  return null;
}

export function toYouTubeEmbed(input: string | null | undefined): string | null {
  if (!input) return null;
  const id = extractVideoId(input);
  if (id) return `https://www.youtube.com/embed/${id}`;
  // Not a recognized YouTube input — return as-is (could be a different video source)
  return input.trim() || null;
}

export function isYouTubeEmbedUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^https:\/\/www\.youtube(-nocookie)?\.com\/embed\/[a-zA-Z0-9_-]{11}/.test(url);
}

export const authHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});

export const jsonHeaders = (token: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});
