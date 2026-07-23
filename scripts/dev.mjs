#!/usr/bin/env node
/**
 * CAPEX monorepo dev runner — Mac, Linux, Windows (PowerShell/cmd).
 * Usage: node scripts/dev.mjs [run|stop|setup|install|check|run-be|run-fe|help]
 */

import { spawn, spawnSync, execSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BE_DIR = join(ROOT, 'capexbe');
const FE_DIR = join(ROOT, 'capex-apps');
const BE_PORT = 3001;
const FE_PORT = 3000;
const IS_WIN = process.platform === 'win32';

const cmd = (process.argv[2] ?? 'run').toLowerCase();

function log(msg) {
  console.log(msg);
}

function runSync(label, cwd, npmScript) {
  log(`==> ${label}...`);
  const r = spawnSync(IS_WIN ? 'npm.cmd' : 'npm', ['run', npmScript], {
    cwd,
    stdio: 'inherit',
    shell: IS_WIN,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function runInstall(dir) {
  log(`==> Installing ${dir}...`);
  const r = spawnSync(IS_WIN ? 'npm.cmd' : 'npm', ['install'], {
    cwd: dir,
    stdio: 'inherit',
    shell: IS_WIN,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function copyIfMissing(src, dest) {
  if (existsSync(dest)) {
    log(`  skip (exists): ${dest}`);
    return;
  }
  copyFileSync(src, dest);
  log(`  created: ${dest}`);
}

function killPort(port) {
  try {
    if (IS_WIN) {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const pids = new Set();
      for (const line of out.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.includes('LISTENING')) continue;
        const parts = trimmed.split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        } catch {
          /* already gone */
        }
      }
    } else {
      execSync(`lsof -ti:${port} 2>/dev/null | xargs kill -9 2>/dev/null || true`, {
        shell: '/bin/bash',
        stdio: 'ignore',
      });
    }
  } catch {
    /* port free */
  }
}

function ensureInstall() {
  if (!existsSync(join(BE_DIR, 'node_modules'))) runInstall(BE_DIR);
  if (!existsSync(join(FE_DIR, 'node_modules', '.bin'))) runInstall(FE_DIR);
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

function checkEnv() {
  log('==> Checking backend env...');
  const beEnv = join(BE_DIR, '.env');
  if (!existsSync(beEnv)) {
    console.error('FAIL: missing capexbe/.env — run: ./run setup');
    process.exit(1);
  }
  const be = parseEnvFile(beEnv);
  if (!be.SUPABASE_URL || !be.SUPABASE_ANON_KEY || !be.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('FAIL: missing SUPABASE_* in capexbe/.env');
    process.exit(1);
  }
  log(`OK  capexbe/.env — ${be.SUPABASE_URL}`);

  log('==> Checking frontend env...');
  const fe = { ...parseEnvFile(join(FE_DIR, '.env')), ...parseEnvFile(join(FE_DIR, '.env.local')) };
  if (!fe.NEXT_PUBLIC_CAPEXBE_URL) {
    console.error('FAIL: missing NEXT_PUBLIC_CAPEXBE_URL in capex-apps/.env or .env.local');
    process.exit(1);
  }
  if (fe.NEXT_PUBLIC_SUPABASE_URL || fe.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.warn('WARN: NEXT_PUBLIC_SUPABASE_* no longer needed on FE — move to capexbe/.env only');
  }
  log(`OK  capex-apps env — BE ${fe.NEXT_PUBLIC_CAPEXBE_URL}`);

  log('==> Testing Supabase (anon key)...');
  const health = spawnSync(
    process.execPath,
    [
      '-e',
      "require('dotenv').config();fetch(process.env.SUPABASE_URL+'/auth/v1/health',{headers:{apikey:process.env.SUPABASE_ANON_KEY}}).then(r=>{console.log(r.status===200?'OK  Supabase Auth health':'WARN Supabase Auth',r.status);process.exit(r.status===200?0:1)}).catch(e=>{console.error('FAIL Supabase',e.message);process.exit(1)})",
    ],
    { cwd: BE_DIR, stdio: 'inherit', shell: false },
  );
  if (health.status !== 0) process.exit(health.status ?? 1);
}

function setup() {
  log('== CAPEX env setup ==');
  if (!existsSync(FE_DIR) || !existsSync(BE_DIR)) {
    console.error('Error: run from repo root (expected capex-apps/ and capexbe/)');
    process.exit(1);
  }
  log('[1/2] Frontend → capex-apps/.env.local');
  copyIfMissing(join(FE_DIR, '.env.example'), join(FE_DIR, '.env.local'));
  log('[2/2] Backend → capexbe/.env');
  copyIfMissing(join(BE_DIR, '.env.example'), join(BE_DIR, '.env'));
  log('');
  log('Done. Next: edit .env files, then run: ./run check && ./run');
  cmdInstall();
}

function cmdInstall() {
  runInstall(BE_DIR);
  runInstall(FE_DIR);
  log('Install complete.');
}

function cmdStop() {
  killPort(FE_PORT);
  killPort(BE_PORT);
  log(`Stopped (if anything was running on :${FE_PORT} / :${BE_PORT}).`);
}

function spawnDev(name, cwd, npmScript) {
  const child = spawn(IS_WIN ? 'npm.cmd' : 'npm', ['run', npmScript], {
    cwd,
    stdio: 'inherit',
    shell: IS_WIN,
    env: process.env,
  });
  child.on('exit', (code) => {
    if (code && code !== 0) log(`[${name}] exited with code ${code}`);
  });
  return child;
}

function cmdRun() {
  cmdStop();
  ensureInstall();
  checkEnv();
  log(`Starting CAPEX — backend :${BE_PORT}, frontend :${FE_PORT}`);
  log('Press Ctrl+C to stop both.');

  const be = spawnDev('backend', BE_DIR, 'start:dev');
  const fe = spawnDev('frontend', FE_DIR, 'dev');

  const shutdown = () => {
    log('');
    log('Stopping...');
    be.kill('SIGTERM');
    fe.kill('SIGTERM');
    if (IS_WIN) {
      try {
        spawnSync('taskkill', ['/F', '/T', '/PID', String(be.pid)], { stdio: 'ignore' });
        spawnSync('taskkill', ['/F', '/T', '/PID', String(fe.pid)], { stdio: 'ignore' });
      } catch {
        /* noop */
      }
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function help() {
  log('CAPEX dev commands:');
  log('  ./run              Start backend (:3001) + frontend (:3000)');
  log('  ./run stop         Kill processes on ports 3000 / 3001');
  log('  ./run setup        Copy env templates + npm install (first time)');
  log('  ./run install      npm install in backend + frontend');
  log('  ./run check        Verify env files + Supabase connectivity');
  log('  ./run run-be       Start backend only');
  log('  ./run run-fe       Start frontend only');
  log('');
  log('Windows PowerShell: .\\run');
  log('Mac/Linux:         ./run');
  log('Fallback:          run.cmd / npm run dev');
}

switch (cmd) {
  case 'run':
    cmdRun();
    break;
  case 'stop':
    cmdStop();
    break;
  case 'setup':
    setup();
    break;
  case 'install':
    cmdInstall();
    break;
  case 'check':
    ensureInstall();
    checkEnv();
    break;
  case 'run-be':
    ensureInstall();
    runSync('Backend', BE_DIR, 'start:dev');
    break;
  case 'run-fe':
    ensureInstall();
    runSync('Frontend', FE_DIR, 'dev');
    break;
  case 'help':
  case '--help':
  case '-h':
    help();
    break;
  default:
    console.error(`Unknown command: ${cmd}`);
    help();
    process.exit(1);
}
