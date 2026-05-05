#!/usr/bin/env node
// Trigger a Render deploy from the CLI when auto-deploy is paused or stuck.
//
// Setup (one-time):
//   1. Render dashboard → service → Settings → Deploy Hook → "Generate URL"
//   2. Copy the URL into .env as:  RENDER_DEPLOY_HOOK_URL=https://api.render.com/deploy/srv-...?key=...
//   3. Run: npm run deploy
//
// The hook URL is a single-purpose secret — it can ONLY trigger a deploy on
// this service, nothing else. Safe to commit to .env (which is gitignored)
// but never to the repo.

import 'dotenv/config';

const url = process.env.RENDER_DEPLOY_HOOK_URL;
if (!url) {
  console.error('❌ RENDER_DEPLOY_HOOK_URL not set in .env');
  console.error('');
  console.error('To get one:');
  console.error('  1. https://dashboard.render.com → accelerate-robotics service');
  console.error('  2. Settings → Deploy Hook → Generate URL');
  console.error('  3. Add to .env:  RENDER_DEPLOY_HOOK_URL=<the URL>');
  process.exit(1);
}

console.log('→ Triggering Render deploy…');
const t0 = Date.now();
const res = await fetch(url, { method: 'POST' });
const ms = Date.now() - t0;
const body = await res.text();

if (!res.ok) {
  console.error(`❌ Deploy hook returned ${res.status} after ${ms}ms`);
  console.error(body);
  process.exit(1);
}

let parsed;
try { parsed = JSON.parse(body); } catch { parsed = body; }
console.log(`✓ Deploy queued in ${ms}ms`);
console.log(parsed);
console.log('');
console.log('Watch progress: https://dashboard.render.com → service → Events tab');
