/**
 * fix-grade-zero.js
 *
 * Fixes Score documents where `grade` was stored as the digit "0"
 * instead of the letter "O" (outstanding grade).
 *
 * The script targets ALL configured college databases.
 *
 * Usage:
 *   node scripts/fix-grade-zero.js           # dry-run (no writes)
 *   node scripts/fix-grade-zero.js --apply   # actually update the DB
 *
 * Safe to run multiple times — records already having grade "O" are untouched.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const DRY_RUN = !process.argv.includes('--apply');

const COLLEGE_URI_MAP = {
  nsut: process.env.MONGODB_URI_NSUT || process.env.MONGODB_URI,
  dtu: process.env.MONGODB_URI_DTU,
  igdtuw: process.env.MONGODB_URI_IGDTUW,
};

// Minimal Score schema — must match the real one in src/models/Score.js
const scoreSchema = new mongoose.Schema({
  roll_no: String,
  subject_code: String,
  branch_code: String,
  grade: String,
  marks: Number,
  semester: Number,
});

async function fixGradesForCollege(collegeName, uri) {
  console.log(`\n──────────────────────────────────────`);
  console.log(`College : ${collegeName}`);
  console.log(`URI     : ${uri.replace(/:\/\/[^@]+@/, '://***@')}`); // mask creds

  const conn = await mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 10_000,
  }).asPromise();

  const Score = conn.model('Score', scoreSchema);

  // Find all docs where grade is the digit "0"
  const affected = await Score.find({ grade: '0' }).lean();

  console.log(`Found   : ${affected.length} document(s) with grade "0"`);

  if (affected.length === 0) {
    await conn.close();
    return;
  }

  // Preview a sample
  console.log('\nSample (up to 5):');
  affected.slice(0, 5).forEach((doc) => {
    console.log(
      `  roll_no=${doc.roll_no}  subject=${doc.subject_code}  sem=${doc.semester}  marks=${doc.marks}  grade="${doc.grade}"`
    );
  });

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] No changes written. Re-run with --apply to fix.');
    await conn.close();
    return;
  }

  // Bulk-update: set grade to "O" for all matched docs
  const result = await Score.updateMany(
    { grade: '0' },
    { $set: { grade: 'O' } }
  );

  console.log(`✅  Updated ${result.modifiedCount} document(s) — grade "0" → "O"`);

  await conn.close();
}

(async () => {
  console.log(DRY_RUN ? '🔍  DRY-RUN mode' : '✏️   APPLY mode');
  console.log('Starting grade-fix migration...\n');

  for (const [college, uri] of Object.entries(COLLEGE_URI_MAP)) {
    if (!uri) {
      console.warn(`⚠️  No URI configured for ${college}, skipping.`);
      continue;
    }
    try {
      await fixGradesForCollege(college, uri);
    } catch (err) {
      console.error(`❌  Error processing ${college}:`, err.message);
    }
  }

  console.log('\n──────────────────────────────────────');
  console.log('Migration complete.');
  process.exit(0);
})();
