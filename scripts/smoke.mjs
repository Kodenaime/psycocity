import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
assert.ok(['development', 'production'].includes(mode), 'Choose development or production');
const port = mode === 'production' ? 3001 : 5173;
const origin = `http://127.0.0.1:${port}`;
// Refuse to test a pre-existing process instead of the server we start.
for (const candidate of [3001, ...(mode === 'development' ? [5173] : [])]) {
  let occupied = false;
  try { await fetch(`http://127.0.0.1:${candidate}`, { signal: AbortSignal.timeout(500) }); occupied = true; } catch { /* No responding HTTP server. */ }
  assert.equal(occupied, false, `Port ${candidate} is already in use`);
}
const child = spawn('npm', ['run', mode === 'production' ? 'start' : 'dev'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: { ...process.env, NODE_ENV: mode, PORT: '3001', MONGODB_URI: process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/psycocity_test?replicaSet=rs0&directConnection=true' },
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', (data) => { logs = (logs + data).slice(-12000); });
child.stderr.on('data', (data) => { logs = (logs + data).slice(-12000); });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Server exited with ${child.exitCode}`);
    try {
      const response = await fetch(`${origin}/api/v1/ready`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch { /* Retry until the startup deadline. */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(ready, 'Server did not become ready');
  const health = await fetch(`${origin}/api/v1/health`);
  assert.match(health.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'psycocity-api' });
  const readiness = await fetch(`${origin}/api/v1/ready`);
  assert.equal(readiness.status, 200);
  assert.deepEqual(await readiness.json(), { status: 'ready' });
  const home = await fetch(origin);
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /A new stage/);
  assert.match(html, /Psycocity — Agency &amp; Academy|Psycocity — Agency & Academy/);
  const statusPage = await fetch(`${origin}/status`);
  assert.match(await statusPage.text(), /Checking API connection/);
  const asset = mode === 'production'
    ? html.match(/(?:src|href)="(\/assets\/[^" ]+\.js)"/)?.[1]
    : '/@vite/client';
  assert.ok(asset, 'Client entry asset must be linked');
  assert.equal((await fetch(`${origin}${asset}`)).status, 200);
  const unknownApi = await fetch(`${origin}/api/unknown`);
  assert.equal(unknownApi.status, 404);
  assert.deepEqual(await unknownApi.json(), { error: { code: 'NOT_FOUND', message: 'API route not found', requestId: unknownApi.headers.get('x-request-id') } });
  assert.equal((await fetch(`${origin}/unknown-page`)).status, 404);
  console.log(`${mode}: PASS — health, database readiness, rendered HTML, client asset, API 404 and web 404`);
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') { console.error(error); process.exitCode = 1; } }
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timeout = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Process group has already exited. */ }
      resolve();
    }, 5000);
    child.once('exit', () => { clearTimeout(timeout); resolve(); });
  });
}
