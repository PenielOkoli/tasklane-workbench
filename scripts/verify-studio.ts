import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { roles, sampleBrief, type ReviewView } from '../src/lib/review-contracts';

const origin = process.argv[2] || 'http://localhost:3020';
const withAI = process.argv.includes('--ai');
const cookies = new Map<string, string>();
const results: { name: string; passed: boolean; detail?: unknown }[] = [];
type Payload = { review: ReviewView | null; configured: boolean; error?: string };

async function request(body?: object, requestOrigin = origin) {
  const response = await fetch(origin + '/api/review', {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', origin: requestOrigin, cookie: [...cookies.values()].join('; ') },
    body: body && JSON.stringify(body),
  });
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(';')[0];
    cookies.set(pair.split('=')[0], pair);
  }
  return { status: response.status, data: await response.json() as Payload };
}
async function check(name: string, run: () => Promise<unknown>) {
  try { results.push({ name, passed: true, detail: await run() }); }
  catch (error) { results.push({ name, passed: false, detail: error instanceof Error ? error.message : 'Unknown error' }); }
}
function current(response: Awaited<ReturnType<typeof request>>) {
  assert.equal(response.status, 200, response.data.error ?? 'Expected a successful response');
  assert.ok(response.data.review);
  return response.data.review;
}
const checkpoint = ({ id, version }: ReviewView) => ({ id, version });

async function workflow(mode: 'practice' | 'ai') {
  let review = current(await request({ operation: 'start', mode, brief: sampleBrief, consent: mode === 'ai' }));
  const reason = 'Check mobile and keyboard quality before distributing the pilot.';
  assert.equal((await request({ operation: 'decide', ...checkpoint(review), position: 'hold', reason })).status, 409);
  const first = checkpoint(review);
  for (const role of roles) {
    review = current(await request({ operation: 'advance', ...checkpoint(review) }));
    assert.ok(review.outputs[role]?.output.recommendation);
    assert.ok(review.outputs[role]?.output.uncertainty);
  }
  assert.equal((await request({ operation: 'advance', ...first })).status, 409);
  assert.equal((await request({ operation: 'advance', ...checkpoint(review) })).status, 409);
  assert.deepEqual(current(await request()).outputs, review.outputs);
  const positions = roles.map(role => review.outputs[role]?.output.position);
  if (mode === 'practice') assert.equal(new Set(positions).size, 3);
  review = current(await request({ operation: 'decide', ...checkpoint(review), position: 'hold', reason }));
  assert.equal(review.decision?.reason, reason);
  review = current(await request({ operation: 'advance', ...checkpoint(review) }));
  assert.ok(review.synthesis?.output.nextStep);
  assert.equal(current(await request()).decision?.reason, reason);
  assert.equal((await request({ operation: 'advance', ...checkpoint(review) })).status, 409);
  return { positions, outputs: review.outputs, humanDecision: review.decision, synthesis: review.synthesis };
}

async function main() {
  await check('Studio, Agent, Knowledge and Board pages', async () => {
    for (const path of ['/', '/agent', '/knowledge', '/board']) assert.equal((await fetch(origin + path)).status, 200);
    return { providerConfigured: (await request()).data.configured };
  });
  await check('origin, strict inputs, provider consent', async () => {
    const start = { operation: 'start', mode: 'ai', brief: sampleBrief, consent: false };
    assert.equal((await request(start, 'https://other.example')).status, 403);
    assert.equal((await request({ ...start, unexpected: true })).status, 400);
    assert.equal((await request(start)).status, 403);
  });
  await check('practice handoffs, three positions, required human decision, synthesis and refresh', () => workflow('practice'));
  if (withAI) await check('four live Groq calls, typed outputs, saved human decision and synthesis', () => workflow('ai'));
  const result = { checkedAt: new Date().toISOString(), origin, withAI, passed: results.every(check => check.passed), results };
  const location = origin.startsWith('http://localhost') ? 'local' : withAI ? 'live-ai' : 'live-practice';
  writeFileSync(`docs/modules/10/${location}-verification.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ passed: result.passed, checks: results.map(({ name, passed, detail }) => ({ name, passed, ...(!passed ? { detail } : {}) })) }, null, 2));
  if (!result.passed) process.exitCode = 1;
}
void main();
