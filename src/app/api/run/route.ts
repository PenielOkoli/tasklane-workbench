import { guarded, GuardError, guardFailure, chargeAI, assertTrustedInput } from '@/lib/guard';
import { z } from 'zod';
import { readJSON } from '@/lib/http';
import { ActionError } from '@/lib/engine';
import { publicWorkspace, type Session } from '@/lib/contracts';
import { sessionCookie, sessionFromRequest } from '@/lib/session';
import { freshSession } from '@/lib/seed';
import { clearRunCookie, runCookie, runFromRequest } from '@/lib/run-session';
import { terminal, type Run } from '@/lib/run-contracts';
import { acceptPlan, approveStep, assertVersion, controlRun, executeStep, failRun, newRun, practicePlan, prepareStep } from '@/lib/run-engine';
import { generatePlan } from '@/lib/run-planner';
import { passages, sources } from '@/lib/corpus';
import { retrieve } from '@/lib/knowledge';
export const runtime = 'nodejs';
export const maxDuration = 60;
const instruction = z.string().trim().min(3).max(700);
const checkpoint = { runId: z.string().uuid(), version: z.number().int().nonnegative() };
const schema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('start'), instructions: instruction, mode: z.enum(['ai', 'demo']), scenario: z.enum(['launch', 'clarification', 'failure']), consent: z.boolean() }).strict(),
  z.object({ operation: z.enum(['advance', 'pause', 'resume', 'cancel', 'retry']), ...checkpoint }).strict(),
  z.object({ operation: z.literal('revise'), ...checkpoint, instructions: instruction }).strict(),
  z.object({ operation: z.literal('approve'), ...checkpoint, proposalId: z.string().uuid(), confirmation: z.string().max(20) }).strict(),
  z.object({ operation: z.literal('reset'), confirmation: z.literal('RESET') }).strict(),
]);
function reply(session: Session | null, run: Run | null, error?: string, status = 200, clear = false) {
  const headers = new Headers({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  if (session) headers.append('Set-Cookie', sessionCookie(session));
  if (run) headers.append('Set-Cookie', runCookie(run));
  else if (clear) headers.append('Set-Cookie', clearRunCookie());
  const visibleRun = run ? { ...run, sessionId: undefined, expiresAt: undefined } : null;
  return Response.json({ run: visibleRun, workspace: session ? publicWorkspace(session) : null, configured: Boolean(process.env.GROQ_API_KEY), ...(error ? { error } : {}) }, { status, headers });
}
async function handleGET(request: Request) {
  try {
    const existing = sessionFromRequest(request), session = existing ?? freshSession();
    return reply(session, existing ? runFromRequest(request, session.id) : null, undefined, 200, !existing);
  } catch (error) { if(error instanceof GuardError) return guardFailure(error); return reply(null, null, error instanceof ActionError ? error.message : 'Unable to load the agent workspace.', error instanceof ActionError ? error.status : 500); }
}
async function handlePOST(request: Request) {
  let session: Session | null = null, run: Run | null = null;
  let advancing = false;
  try {
    const parsed = schema.safeParse(await readJSON(request));
    if (!parsed.success) throw new ActionError(400, 'Invalid operation or unexpected fields.');
    const input = parsed.data;
    if (input.operation === 'reset') return reply(freshSession(), null, undefined, 200, true);
    session = sessionFromRequest(request);
    if (!session) throw new ActionError(401, 'Open the agent workspace first.');
    run = runFromRequest(request, session.id);
    if (input.operation === 'start') {
      assertTrustedInput(input.instructions);
      if (run && !terminal(run.status)) throw new ActionError(409, 'Cancel or finish the current run first.');
      if (input.mode === 'ai' && !input.consent) throw new ActionError(403, 'Approve sending instructions and demo board context to the AI provider first.');
      run = newRun(session, input.instructions, input.mode, input.scenario);
    } else {
      if (!run) throw new ActionError(409, 'Start a run first.');
      assertVersion(run, input.runId, input.version);
      if (input.operation === 'approve') approveStep(run, session, input.proposalId, input.confirmation);
      else if (input.operation === 'advance') {
        if (!['planning', 'running', 'tool_use'].includes(run.status)) throw new ActionError(409, 'This run is waiting at a checkpoint.');
        advancing = true;
        if (run.status === 'planning') {
          if (run.mode === 'ai') {
            assertTrustedInput(run.instructions);
            chargeAI(request);
          }
          acceptPlan(run, session, run.mode === 'ai' ? await generatePlan(run, session, request.signal) : practicePlan(run));
        } else if (run.status === 'running') prepareStep(run);
        else executeStep(run, session, query => {
          const evidence = retrieve(query, sources.map(s => s.id), sources, passages);
          return evidence.length ? evidence.slice(0, 2).map(p => `[${p.id}] ${p.heading}: ${p.text}`).join('\n').slice(0, 700) : 'No relevant sample passages found. Missing context is not inferred.';
        });
      } else { if(input.operation==='revise') assertTrustedInput(input.instructions); controlRun(run, session, input.operation, input.operation === 'revise' ? input.instructions : undefined); }
    }
    run.version++;
    return reply(session, run);
  } catch (error) { if(error instanceof GuardError) return guardFailure(error);
    if (!(error instanceof ActionError)) {
      const providerStatus = (error as { statusCode?: number } | null)?.statusCode;
      console.warn('Agent request failed', {
        name: error instanceof Error ? error.name : 'UnknownError',
        ...(typeof providerStatus === 'number' ? { providerStatus } : {}),
      });
    }
    const message = error instanceof ActionError ? error.message : 'AI planning or tool validation failed. No change was committed by this request. Retry or revise the instructions.';
    if (advancing && run) { failRun(run, message); run.version++; }
    try { return reply(session, run, message, error instanceof ActionError ? error.status : 502); }
    catch { return reply(null, null, 'Checkpoint storage is full. The request was not saved. Export the current trace and reset the demo.', 409); }
  }
}

export const GET = (request:Request) => guarded(request,handleGET);
export const POST = (request:Request) => guarded(request,handlePOST);
