import { randomUUID } from 'node:crypto';
import type { Session } from './contracts';
import { ActionError, decide, propose, searchTasks, validateAction } from './engine';
import { planSchema, terminal, type Plan, type Run } from './run-contracts';

export function trace(run: Run, event: string, detail: string, durationMs = 0) {
  run.trace.push({ seq: ++run.sequence, at: Date.now(), event, detail: detail.slice(0, 200), step: run.cursor < run.steps.length ? run.cursor : null, durationMs });
  run.trace = run.trace.slice(-24);
}
export function newRun(session: Session, instructions: string, mode: Run['mode'], scenario: Run['scenario'] = 'launch'): Run {
  if (session.proposal) throw new ActionError(409, 'Finish the pending board proposal before starting a run.');
  const run: Run = { id: randomUUID(), sessionId: session.id, expiresAt: session.expiresAt, version: 0, status: 'planning', resumeStatus: null, instructions, summary: '', clarification: '', mode, scenario, steps: [], cursor: 0, proposalId: null, error: '', sequence: 0, trace: [] };
  trace(run, 'started', mode === 'ai' ? 'AI planning requested. No board changes authorized.' : `Labeled practice scenario: ${scenario}. No model call.`);
  return run;
}
export function assertVersion(run: Run, id: string, version: number) {
  if (run.id !== id || run.version !== version) throw new ActionError(409, 'This checkpoint is stale. Reload the current run.');
}
export function acceptPlan(run: Run, session: Session, raw: unknown) {
  if (run.status !== 'planning') throw new ActionError(409, 'Planning is not active.');
  const plan = planSchema.parse(raw);
  if (!plan.clarification && !plan.steps.length) throw new ActionError(422, 'The planner returned no executable steps. Revise the instructions.');
  // Reject fabricated IDs and invalid writes before showing an executable plan.
  for (const step of plan.steps) if (!['searchTasks', 'searchKnowledge'].includes(step.tool.toolName)) validateAction(session, step.tool);
  run.summary = plan.summary;
  run.clarification = plan.clarification;
  run.steps = plan.clarification ? [] : plan.steps.map(s => ({ ...s, status: 'pending', result: '', durationMs: 0 }));
  run.status = plan.clarification ? 'blocked' : 'running';
  trace(run, plan.clarification ? 'clarification_requested' : 'plan_ready', plan.clarification || `${plan.steps.length} steps ready. Each write will need approval.`);
}
function discardProposal(run: Run, session: Session) {
  if (run.proposalId && session.proposal?.id === run.proposalId) decide(session, { proposalId: run.proposalId, revision: session.revision, decision: 'decline', confirmation: '' });
  run.proposalId = null;
}
export function controlRun(run: Run, session: Session, operation: 'pause' | 'resume' | 'cancel' | 'revise' | 'retry', instructions?: string) {
  if (terminal(run.status)) throw new ActionError(409, 'This run has ended. Start a new run.');
  if (operation === 'pause') {
    if (!['planning', 'running', 'tool_use', 'needs_approval'].includes(run.status)) throw new ActionError(409, 'This run is already stopped at a checkpoint.');
    run.resumeStatus = run.status; run.status = 'paused'; trace(run, 'paused', 'Paused at a checkpoint. No further tool will run.');
  } else if (operation === 'resume') {
    if (run.status !== 'paused' || !run.resumeStatus) throw new ActionError(409, 'Only a paused run can resume.');
    run.status = run.resumeStatus; run.resumeStatus = null; trace(run, 'resumed', 'Resumed from the saved checkpoint. Approval gates remain in place.');
  } else if (operation === 'cancel') {
    discardProposal(run, session); run.status = 'cancelled'; run.resumeStatus = null;
    run.steps.forEach(s => { if (s.status !== 'completed') s.status = 'cancelled'; });
    trace(run, 'cancelled', 'Unfinished work cancelled. Previously approved changes remain on the board.');
  } else if (operation === 'revise') {
    if (!instructions?.trim()) throw new ActionError(400, 'Enter revised instructions.');
    discardProposal(run, session);
    const completed = run.steps.filter(s => s.status === 'completed').length;
    run.instructions = instructions.trim(); run.steps = []; run.cursor = 0; run.summary = ''; run.clarification = ''; run.error = ''; run.resumeStatus = null; run.status = 'planning';
    // A revised practice run uses the normal practice plan, not an endless clarification fixture.
    if (run.mode === 'demo') run.scenario = 'launch';
    trace(run, 'instructions_revised', `New plan required; pending approval invalidated. ${completed} completed steps retained in trace; committed changes remain.`);
  } else {
    if (run.status !== 'failed') throw new ActionError(409, 'Only a failed run can retry.');
    run.error = '';
    if (!run.steps.length) run.status = 'planning';
    else { run.steps[run.cursor].status = 'pending'; run.status = 'running'; }
    trace(run, 'retry_requested', 'Retry returns to a checkpoint. No write is automatically authorized.');
  }
}
export function failRun(run: Run, message: string) {
  run.status = 'failed'; run.error = message.slice(0, 240);
  if (run.steps[run.cursor]) run.steps[run.cursor].status = 'failed';
  trace(run, 'failed', run.error);
}
export function finishStep(run: Run, result: string, durationMs: number) {
  const step = run.steps[run.cursor]; step.status = 'completed'; step.result = result.slice(0, 700); step.durationMs = durationMs;
  trace(run, 'tool_completed', `${step.tool.toolName}: ${result}`, durationMs);
  run.cursor++; run.status = run.cursor === run.steps.length ? 'completed' : 'running';
  if (run.status === 'completed') trace(run, 'completed', 'All planned steps completed. Review the tool results and board.');
}
export function prepareStep(run: Run) {
  if (run.status !== 'running') throw new ActionError(409, 'The run cannot advance from this state.');
  const step = run.steps[run.cursor];
  if (!step) throw new ActionError(409, 'No pending step.');
  step.status = 'running'; run.status = 'tool_use'; trace(run, 'tool_started', `${step.tool.toolName}: ${step.purpose}`);
}
export function executeStep(run: Run, session: Session, knowledge: (query: string) => string) {
  if (run.status !== 'tool_use') throw new ActionError(409, 'Prepare a tool checkpoint first.');
  const step = run.steps[run.cursor], start = Date.now(), tool = step.tool;
  if (run.mode === 'demo' && run.scenario === 'failure' && !run.trace.some(e => e.event === 'practice_failure')) {
    trace(run, 'practice_failure', 'Intentional practice failure before execution. No change made.');
    throw new ActionError(503, 'Practice tool failure. Retry to continue safely.');
  }
  if (tool.toolName === 'searchTasks') {
    const found = searchTasks(session, tool.input);
    finishStep(run, found.length ? found.map(t => `${t.id}: ${t.title} — ${t.status}, ${t.priority}`).join('\n') : 'No matching tasks. Revise your instructions if you expected a match.', Date.now() - start);
  } else if (tool.toolName === 'searchKnowledge') {
    finishStep(run, knowledge(tool.input.query), Date.now() - start);
  } else {
    // Proposal only. The dispatcher never executes a write.
    const proposal = propose(session, tool, run.mode === 'ai' ? 'ai' : 'demo');
    run.proposalId = proposal.id; step.status = 'needs_approval'; run.status = 'needs_approval';
    trace(run, 'approval_requested', `${tool.toolName} validated. Waiting for explicit approval; no change made.`);
  }
}
export function approveStep(run: Run, session: Session, proposalId: string, confirmation: string) {
  if (run.status !== 'needs_approval' || !run.proposalId || run.proposalId !== proposalId) throw new ActionError(409, 'There is no matching approval checkpoint.');
  const start = Date.now();
  decide(session, { proposalId, revision: session.revision, decision: 'approve', confirmation });
  run.proposalId = null;
  trace(run, 'human_approved', 'The user approved this exact proposal.');
  finishStep(run, 'Approved change committed to your isolated project board. The board offers Undo for the latest change.', Date.now() - start);
}
export function practicePlan(run: Run): Plan {
  if (run.scenario === 'clarification') return { summary: 'Choose a concrete task before making changes.', clarification: 'Which task should change, and what outcome do you want?', steps: [] };
  return { summary: 'Review launch guidance, inspect current tasks, then propose one launch checklist task for your approval.', clarification: '', steps: [
    { title: 'Read the launch guidance', purpose: 'Find the sample release gates before preparing work.', tool: { toolName: 'searchKnowledge', input: { query: 'What must pass before launch?' } } },
    { title: 'Inspect the project board', purpose: 'Make existing work visible before adding anything.', tool: { toolName: 'searchTasks', input: { query: '', status: 'all', priority: 'all' } } },
    { title: 'Prepare a release checklist', purpose: 'Create a reviewable task only if you approve it.', tool: { toolName: 'createTask', input: { title: 'Review launch readiness checklist', description: 'Check accessibility, loading and error states against the sample release gates.', priority: 'high', tag: 'engineering' } } },
  ] };
}
