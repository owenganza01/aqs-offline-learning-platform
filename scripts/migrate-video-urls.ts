// scripts/migrate-video-urls.ts
// Standalone migration script: normalize legacy video_url values to embed format.
// Run manually via: npx tsx scripts/migrate-video-urls.ts

import { db } from '../src/db/index.ts';
import * as schema from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import { toYouTubeEmbed } from '../src/lib/utils.ts';

async function run() {
  try {
    console.log('[migration] Checking lessons for legacy video URLs...');
    const allLessons = await db.select().from(schema.lessons);
    let normalized = 0;
    for (const lesson of allLessons) {
      if (!lesson.videoUrl) continue;
      const fixed = toYouTubeEmbed(lesson.videoUrl);
      if (fixed && fixed !== lesson.videoUrl) {
        await db.update(schema.lessons).set({ videoUrl: fixed }).where(eq(schema.lessons.id, lesson.id));
        normalized++;
      }
    }
    console.log(`[migration] Completed. Normalized ${normalized} legacy video URL(s) to embed format.`);
    process.exit(0);
  } catch (err) {
    console.error('[migration] Failed to normalize video URLs:', err);
    process.exit(1);
  }
}

run();
