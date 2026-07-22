#!/usr/bin/env node
/**
 * Static check: no raw SQL in capexbe; PostgREST filter helpers present.
 * Run: node scripts/verify-query-safety.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const failures = [];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) files.push(p);
  }
  return files;
}

const forbidden = [
  { re: /\$queryRaw|queryRawUnsafe|\.query\s*\(\s*[`'"]\s*SELECT/i, label: 'raw SQL query' },
  { re: /execute\s*\(\s*[`'"]\s*SELECT/i, label: 'execute SELECT' },
];

for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');
  for (const rule of forbidden) {
    if (rule.re.test(text)) failures.push(`${file}: ${rule.label}`);
  }
}

const utilPath = join(SRC, 'shared', 'postgrest-filter.util.ts');
if (!readFileSync(utilPath, 'utf8').includes('buildSafeOrIlikeFilter')) {
  failures.push('missing buildSafeOrIlikeFilter in postgrest-filter.util.ts');
}

const execSummary = readFileSync(
  join(SRC, 'executive-summary', 'executive-summary-query.util.ts'),
  'utf8',
);
if (execSummary.includes('project_name.ilike.${pat}')) {
  failures.push('executive-summary still uses unquoted .or() ilike pattern');
}

if (failures.length) {
  console.error('FAIL query safety audit:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('OK  query safety — no raw SQL; PostgREST filter hardening in place');
