#!/usr/bin/env node
/**
 * Post-build gate: fail if production bundle still contains direct Supabase data paths.
 * Run: npm run build && npm run verify:secure
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), '.next');
const FORBIDDEN = [
  { pattern: /rest\/v1\//, label: 'PostgREST direct (rest/v1/)' },
  { pattern: /\.from\s*\(\s*["'](?:users|projects|notifications)/, label: 'supabase.from() data table' },
  { pattern: /@supabase\/supabase-js/, label: '@supabase/supabase-js runtime import' },
  { pattern: /NEXT_PUBLIC_SUPABASE_/, label: 'NEXT_PUBLIC_SUPABASE_* in client bundle' },
  { pattern: /NEXT_PUBLIC_GEMINI_API_KEY/, label: 'NEXT_PUBLIC_GEMINI_API_KEY in client bundle' },
  { pattern: /supabase\.co\/auth\/v1\/authorize/, label: 'Supabase OAuth URL in client bundle' },
];

function walk(dir, files = []) {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return files;
  for (const name of readdirSync(dir)) {
    if (name === 'dev') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/\.(js|mjs|cjs)$/.test(name)) files.push(p);
  }
  return files;
}

function main() {
  if (!statSync(ROOT, { throwIfNoEntry: false })?.isDirectory()) {
    console.error('FAIL: .next not found — run npm run build first');
    process.exit(1);
  }

  const hits = [];
  for (const file of walk(join(ROOT, 'static', 'chunks'))) {
    const text = readFileSync(file, 'utf8');
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(text)) {
        hits.push({ file, rule: rule.label });
      }
    }
  }

  if (hits.length) {
    console.error('FAIL: insecure patterns in production client bundle:');
    for (const h of hits.slice(0, 20)) {
      console.error(`  - ${h.rule}: ${h.file}`);
    }
    if (hits.length > 20) console.error(`  ... and ${hits.length - 20} more`);
    process.exit(1);
  }

  console.log('OK  secure production build — no Supabase keys or data client in client chunks');
}

main();
