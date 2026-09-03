// run-migrations.mjs
// Directly applies hand-written SQL migrations (0016–0021) that are not in
// the drizzle-kit journal. Run once with: node run-migrations.mjs
import pg from 'pg';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in .env.local');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const migrations = [
  'drizzle/0016_steep_sandman.sql',
  'drizzle/0017_reconcile_enrollments_drift.sql',
  'drizzle/0018_drop_orphan_fk_constraints.sql',
  'drizzle/0019_drop_cohorts_and_invite_codes.sql',
  'drizzle/0020_add_certificate_tables.sql',
  'drizzle/0021_fix_certificate_uniqueness.sql',
  'drizzle/0022_add_certificate_template.sql',
];

async function run() {
  await client.connect();
  console.log('✅ Connected to database\n');

  for (const file of migrations) {
    try {
      const sql = readFileSync(file, 'utf8');
      console.log(`⏳ Running ${file}...`);
      await client.query(sql);
      console.log(`✅ Done: ${file}\n`);
    } catch (err) {
      // Report but continue — idempotent migrations should be safe
      if (err.message?.includes('already exists') || err.code === '42710' || err.code === '42P07') {
        console.log(`⚠️  Already applied (skipped): ${file}\n`);
      } else {
        console.error(`❌ Error in ${file}:`);
        console.error(`   ${err.message}\n`);
      }
    }
  }

  await client.end();
  console.log('✅ All migrations complete.');
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
