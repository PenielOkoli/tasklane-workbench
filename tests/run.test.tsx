import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSession } from '../src/lib/seed';
import { acceptPlan, approveStep, assertVersion, controlRun, executeStep, failRun, newRun, practicePlan, prepareStep, trace } from '../src/lib/run-engine';
import { decodeRun, encodeRun } from '../src/lib/run-session';
import { decodePlannerResponse } from '../src/lib/run-contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentDesk } from '../src/components/agent-desk';
const setup = () => { const session = freshSession(); return { session, run: newRun(session, 'Review launch readiness', 'demo') }; };
const read = () => 'Sample release gates: accessibility and error states.';
test('provider response preserves an empty search query and rejects invalid tool arguments', () => {
  const step = {
    title: 'List tasks',
    purpose: 'Find work on the board',
    toolName: 'searchTasks' as const,
    arguments: { query: '', status: 'all', priority: 'all', title: '', description: '', tag: '', taskId: '' },
  };
  const response = { summary: 'List current tasks', clarification: '', steps: [step] };
  assert.deepEqual(decodePlannerResponse(response).steps[0].tool, {
    toolName: 'searchTasks',
    input: { query: '', status: 'all', priority: 'all' },
  });
  assert.throws(() => decodePlannerResponse({
    ...response,
    steps: [{ ...step, arguments: { ...step.arguments, title: 'Unexpected input' } }],
  }));
});
const reachApproval = () => {
  const pair = setup(); acceptPlan(pair.run, pair.session, practicePlan(pair.run));
  for (let i = 0; i < 3; i++) { prepareStep(pair.run); executeStep(pair.run, pair.session, read); }
  return pair;
};
test('planning and read tools never write; mutation stops at exact approval checkpoint', () => {
  const { run, session } = reachApproval();
  assert.equal(run.status, 'needs_approval'); assert.equal(session.revision, 0); assert.equal(session.tasks.length, 6);
  assert.throws(() => approveStep(run, session, crypto.randomUUID(), ''), /matching approval/);
  const id = run.proposalId!; approveStep(run, session, id, '');
  assert.equal(session.tasks.length, 7); assert.equal(run.status, 'completed');
  assert.throws(() => approveStep(run, session, id, ''), /approval/); assert.equal(session.tasks.length, 7);
});
test('pause stops planning, dispatch and approval; resume preserves checkpoint', () => {
  const { run, session } = reachApproval(); const id = run.proposalId!;
  controlRun(run, session, 'pause');
  assert.throws(() => prepareStep(run), /cannot advance/);
  assert.throws(() => executeStep(run, session, read), /checkpoint/);
  assert.throws(() => approveStep(run, session, id, ''), /approval/);
  controlRun(run, session, 'resume'); assert.equal(run.status, 'needs_approval'); assert.equal(run.proposalId, id);
});
test('pause during tool checkpoint resumes the same unexecuted tool', () => {
  const { run, session } = setup(); acceptPlan(run, session, practicePlan(run)); prepareStep(run);
  controlRun(run, session, 'pause'); assert.equal(run.cursor, 0);
  controlRun(run, session, 'resume'); executeStep(run, session, read); assert.equal(run.cursor, 1);
});
test('cancel declines pending proposal and rejects all later writes and resume', () => {
  const { run, session } = reachApproval(); const proposal = run.proposalId!;
  controlRun(run, session, 'cancel'); assert.equal(session.proposal, null); assert.equal(run.status, 'cancelled');
  assert.throws(() => approveStep(run, session, proposal, ''), /approval/);
  assert.throws(() => controlRun(run, session, 'resume'), /ended/); assert.equal(session.revision, 0);
});
test('revised instructions invalidate approval and require a new plan', () => {
  const { run, session } = reachApproval(); const proposal = run.proposalId!;
  controlRun(run, session, 'revise', 'Only list high priority tasks');
  assert.equal(run.status, 'planning'); assert.equal(run.steps.length, 0); assert.equal(session.proposal, null);
  assert.throws(() => approveStep(run, session, proposal, ''), /approval/);
  assert.ok(run.trace.some(t => t.event === 'instructions_revised'));
});
test('clarification blocks all tool use until instructions are revised', () => {
  const { run, session } = setup(); run.scenario = 'clarification'; acceptPlan(run, session, practicePlan(run));
  assert.equal(run.status, 'blocked'); assert.ok(run.clarification); assert.equal(run.steps.length, 0);
  assert.throws(() => prepareStep(run), /cannot advance/);
  controlRun(run, session, 'revise', 'Create a launch checklist'); assert.equal(run.status, 'planning');
});
test('tool failure preserves board and retry re-enters checkpoint', () => {
  const { run, session } = setup(); run.scenario = 'failure'; acceptPlan(run, session, practicePlan(run)); prepareStep(run);
  assert.throws(() => executeStep(run, session, read), /Practice tool failure/); failRun(run, 'Practice tool failure');
  assert.equal(run.status, 'failed'); assert.equal(session.revision, 0);
  controlRun(run, session, 'retry'); assert.equal(run.status, 'running'); prepareStep(run); executeStep(run, session, read); assert.equal(run.cursor, 1);
});
test('archive requires exact typed confirmation and respects expiry and board revision', () => {
  const { run, session } = setup();
  acceptPlan(run, session, { summary: 'Archive one task.', clarification: '', steps: [{ title: 'Archive completed tokens', purpose: 'Remove the requested completed task.', tool: { toolName: 'archiveTask', input: { taskId: 'tsk-tokens' } } }] });
  prepareStep(run); executeStep(run, session, read);
  assert.throws(() => approveStep(run, session, run.proposalId!, ''), /ARCHIVE/);
  session.proposal!.expiresAt = Date.now() - 1;
  assert.throws(() => approveStep(run, session, run.proposalId!, 'ARCHIVE'), /expired/);
  session.proposal!.expiresAt = Date.now() + 60000; session.revision++;
  assert.throws(() => approveStep(run, session, run.proposalId!, 'ARCHIVE'), /changed/);
  session.revision--; approveStep(run, session, run.proposalId!, 'ARCHIVE'); assert.equal(session.tasks.length, 5);
});
test('untrusted planner cannot invent tools, task IDs, extra fields or empty successful plans', () => {
  const { run, session } = setup(); const plan = practicePlan(run);
  assert.throws(() => acceptPlan(run, session, { ...plan, steps: [{ ...plan.steps[0], tool: { toolName: 'sendEmail', input: {} } }] }));
  assert.throws(() => acceptPlan(run, session, { ...plan, steps: [{ ...plan.steps[0], tool: { toolName: 'archiveTask', input: { taskId: 'tsk-foreign' } } }] }), /workspace/);
  assert.throws(() => acceptPlan(run, session, { ...plan, approval: true }));
  assert.throws(() => acceptPlan(run, session, { ...plan, steps: [] }), /no executable/);
});
test('checkpoint version rejects mismatched runs and stale sequential requests', () => {
  const { run } = setup(); assertVersion(run, run.id, 0); run.version++;
  assert.throws(() => assertVersion(run, run.id, 0), /stale/);
  assert.throws(() => assertVersion(run, crypto.randomUUID(), 1), /stale/);
});
test('encrypted run survives refresh, rejects tampering, foreign sessions and expiry', () => {
  const { run, session } = reachApproval(); const secret = 'run-test-secret-'.repeat(4);
  const encoded = encodeRun(run, secret); assert.ok(encoded.length < 3700);
  assert.deepEqual(decodeRun(encoded, session.id, secret), run);
  assert.throws(() => decodeRun(encoded, crypto.randomUUID(), secret), /verified/);
  assert.throws(() => decodeRun(encoded.slice(0, -5) + 'AAAAA', session.id, secret), /verified/);
  run.expiresAt = Date.now() - 1; assert.throws(() => decodeRun(encodeRun(run, secret), session.id, secret), /verified/);
});
test('trace is bounded with monotonic sequence and preserves no hidden provider data', () => {
  const { run } = setup(); for (let i = 0; i < 35; i++) trace(run, 'checkpoint', 'Safe result');
  assert.equal(run.trace.length, 24); assert.equal(run.trace.at(-1)!.seq, 36); assert.equal(run.trace[0].seq, 13);
});
test('initial UI labels AI consent, practice mode and retention truthfully', () => {
  const html = renderToStaticMarkup(<AgentDesk/>);
  assert.match(html, /Allow Groq/); assert.match(html, /do not call an AI model/); assert.match(html, /one tab at a time/); assert.match(html, /Activity log/);
});
