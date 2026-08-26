import { describe, it, expect } from 'vitest';
import { toYouTubeEmbed } from './utils.js';

describe('toYouTubeEmbed', () => {
  it('returns null for null/undefined/empty', () => {
    expect(toYouTubeEmbed(null)).toBeNull();
    expect(toYouTubeEmbed(undefined)).toBeNull();
    expect(toYouTubeEmbed('')).toBeNull();
    expect(toYouTubeEmbed('   ')).toBeNull();
  });

  it('converts bare 11-char video ID', () => {
    expect(toYouTubeEmbed('dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('converts standard watch URL', () => {
    expect(toYouTubeEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    );
  });

  it('converts youtu.be short URL', () => {
    expect(toYouTubeEmbed('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('converts shorts URL', () => {
    expect(toYouTubeEmbed('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    );
  });

  it('converts existing embed URL (youtube-nocookie)', () => {
    expect(toYouTubeEmbed('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    );
  });

  it('extracts ID from iframe src', () => {
    expect(toYouTubeEmbed('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    );
  });

  it('returns non-YouTube URLs as-is', () => {
    expect(toYouTubeEmbed('https://example.com/video.mp4')).toBe('https://example.com/video.mp4');
  });

  it('ignores invalid video IDs', () => {
    expect(toYouTubeEmbed('short')).toBe('short');
    expect(toYouTubeEmbed('https://www.youtube.com/watch?v=abc')).toBe('https://www.youtube.com/watch?v=abc');
  });
});
