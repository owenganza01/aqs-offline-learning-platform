#!/usr/bin/env node
import pg from "pg";
import { readFileSync, existsSync } from "fs";
import dotenv from "dotenv";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const email = process.argv[2];
if (!email || !email.includes("@")) { console.error("\nUsage: node scripts/fix-uid-conflict.js <email>\n"); process.exit(1); }

const DATABASE_URL = process.env.DATABASE_URL;
let dbClient;
if (DATABASE_URL) {
  dbClient = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
} else if (process.env.SQL_HOST) {
  dbClient = new pg.Client({ host: process.env.SQL_HOST, user: process.env.SQL_USER, password: process.env.SQL_PASSWORD, database: process.env.SQL_DB_NAME, ssl: process.env.SQL_SSL === "true" ? { rejectUnauthorized: false } : false });
} else { console.error("No database configuration found."); process.exit(1); }

function initFirebaseAdmin() {
  if (getApps().length) return getAuth();
  const options = {};
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) { options.projectId = process.env.FIREBASE_PROJECT_ID || "aqs-learning-local"; initializeApp(options); return getAuth(); }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try { const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON.replace(/\\n/g, "\n")); options.credential = cert(sa); if (sa.project_id) options.projectId = sa.project_id; } catch (e) { console.warn("Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:", e.message); }
  }
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./service-account.json";
  if (!options.credential && existsSync(credPath)) { try { const sa = JSON.parse(readFileSync(credPath, "utf8")); options.credential = cert(sa); if (sa.project_id) options.projectId = sa.project_id; } catch (_) {} }
  if (!options.projectId) options.projectId = process.env.FIREBASE_PROJECT_ID || "aqs-learning-local";
  initializeApp(options); return getAuth();
}
const adminAuth = initFirebaseAdmin();

async function main() {
  await dbClient.connect();
  const norm = email.toLowerCase();
  console.log("Looking up Firebase user for:", norm);
  let fbUser;
  try { fbUser = await adminAuth.getUserByEmail(norm); }
  catch (err) { console.error(err.code === "auth/user-not-found" ? "No Firebase Auth user found." : "Firebase error: " + err.message); await dbClient.end(); process.exit(1); }
  const newUid = fbUser.uid;
  console.log("Current Firebase UID:", newUid);
  const { rows } = await dbClient.query("SELECT id, uid, role FROM users WHERE email = $1 LIMIT 1", [norm]);
  if (rows.length === 0) { console.log("No DB row found for this email. Sign in normally to create a fresh account."); await dbClient.end(); return; }
  const row = rows[0];
  console.log("DB row -> ID:", row.id, "| Role:", row.role, "| Old UID:", row.uid);
  if (row.uid === newUid) { console.log("UIDs already match. Nothing to fix."); await dbClient.end(); return; }
  await dbClient.query("UPDATE users SET uid = $1 WHERE email = $2", [newUid, norm]);
  console.log("Done! UID updated in the database. You can now log in normally.");
  await dbClient.end();
}
main().catch(async (e) => { console.error("Fatal:", e); try { await dbClient.end(); } catch (_) {} process.exit(1); });
