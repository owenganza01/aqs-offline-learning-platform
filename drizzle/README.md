# Migrations

This directory contains Drizzle ORM migrations for the AQS Offline Learning Platform.

## Migration Order

Migrations are applied in order of their index in `_journal.json`. Drizzle tracks which
migrations have been applied in the database's `__drizzle_migrations` table.

## Consolidated Baseline

**0008_nice_amazoness.sql** is the Drizzle-generated baseline that supersedes earlier
hand-written migrations (0000–0007). The hand-written files are retained for reference
but should not be modified.

## Deprecated Migrations

| File                     | Reason                                           |
| ------------------------ | ------------------------------------------------ |
| 0006_normalize_roles.sql | Superseded by 0012_add_role_check_constraint.sql |
| 0007_add_enrollments.sql | Superseded by 0002_add_enrollments.sql           |

## Adding New Migrations

Run `npm run db:generate` to create a new migration from schema changes. The new file
will be numbered sequentially after the latest existing migration.
