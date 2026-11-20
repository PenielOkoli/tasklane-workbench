import { guarded, GuardError, guardFailure, chargeAI, assertTrustedInput } from '@/lib/guard';
import { z } from 'zod';
import { ActionError } from '@/lib/engine';
import { readJSON } from '@/lib/http';
import { freshSession } from '@/lib/seed';
import { sessionCookie, sessionFromRequest } from '@/lib/session';
import { nextStage, positions, sampleBrief, type Review } from '@/lib/review-contracts';
import { newReview, practiceRole, practiceSynthesis, saveDecision, saveRole, saveSynthesis, verifyCheckpoint } from '@/lib/review-engine';
import { runRole, runSynthesis } from '@/lib/review-model';
import { readReview, reviewCookie } from '@/lib/review-session';

export const runtime = 'nodejs';
export const maxDuration = 45;
const checkpoint = { id: z.string().uuid(), version: z.number().int().nonnegative() };
const inputSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('start'),
    mode: z.enum(['practice', 'ai']),
    brief: z.string().trim().min(8).max(450),
    consent: z.boolean(),
  }).strict(),
  z.object({ operation: z.literal('advance'), ...checkpoint }).strict(),
  z.object({ operation: z.literal('decide'), ...checkpoint, position: z.enum(positions), reason: z.string().trim().min(6).max(260) }).strict(),
]);

function respond(review: Review | null, { cookie, error, status = 200 }: { cookie?: string; error?: string; status?: number } = {}) {
  const headers = new Headers({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  if (cookie) headers.append('Set-Cookie', cookie);
  const visible = review && { ...review, sessionId: undefined, expiresAt: undefined };
  return Response.json({ review: visible, configured: Boolean(process.env.GROQ_API_KEY), error }, { headers, status });
}

function handleGET(request: Request) {
  try {
    const existing = sessionFromRequest(request);
    const session = existing ?? freshSession();
    return respond(readReview(request, session.id), existing ? {} : { cookie: sessionCookie(session) });
  } catch (error) { if(error instanceof GuardError) return guardFailure(error);
    if (error instanceof ActionError && error.status === 401) {
      return respond(null, { cookie: sessionCookie(freshSession()) });
    }
    return respond(null, {
      status: error instanceof ActionError ? error.status : 500,
      error: error instanceof ActionError ? error.message : 'Unable to load this workspace.',
    });
  }
}

async function handlePOST(request: Request) {
  let review: Review | null = null;
  try {
    const input = inputSchema.safeParse(await readJSON(request));
    if (!input.success) throw new ActionError(400, 'Check the form and try again.');
    const session = sessionFromRequest(request);
    if (!session) throw new ActionError(401, 'Open the workspace before starting a review.');
    review = readReview(request, session.id);
    const action = input.data;

    if (action.operation === 'start') {
      assertTrustedInput(action.brief);
      if (action.mode === 'ai' && !action.consent) throw new ActionError(403, 'Confirm that Groq can process this review first.');
      if (action.mode === 'ai' && !process.env.GROQ_API_KEY) throw new ActionError(503, 'Live AI is unavailable. The practice review is available.');
      const started = newReview(session.id, session.expiresAt, action.mode, action.mode === 'practice' ? sampleBrief : action.brief);
      return respond(started, { cookie: reviewCookie(started) });
    }

    if (!review) throw new ActionError(409, 'Start a review first.');
    verifyCheckpoint(review, action.id, action.version);
    const updated = structuredClone(review);
    if (action.operation === 'decide') {
      saveDecision(updated, action.position, action.reason);
    } else {
      const stage = nextStage(updated);
      if (stage === 'decision' || stage === 'completed') throw new ActionError(409, 'This review cannot advance from its current checkpoint.');
      if (updated.mode === 'ai') {
        chargeAI(request);
      }
      try {
        if (stage === 'synthesis') {
          if (!updated.decision) throw new Error('Missing decision');
          saveSynthesis(updated, updated.mode === 'ai' ? await runSynthesis(updated, request.signal) : practiceSynthesis(updated.decision.position));
        } else {
          saveRole(updated, stage, updated.mode === 'ai' ? await runRole(updated, stage, request.signal) : practiceRole(stage));
        }
      } catch (error) { if(error instanceof GuardError) return guardFailure(error);
        console.warn('Studio assignment failed', { stage, name: error instanceof Error ? error.name : 'UnknownError' });
        updated.error = 'This assignment could not finish. Previous outputs and decisions are saved. Retry this step.';
        updated.version++;
        return respond(updated, { cookie: reviewCookie(updated), error: updated.error, status: 502 });
      }
    }
    updated.version++;
    return respond(updated, { cookie: reviewCookie(updated) });
  } catch (error) { if(error instanceof GuardError) return guardFailure(error);
    return respond(review, {
      status: error instanceof ActionError ? error.status : 500,
      error: error instanceof ActionError ? error.message : 'The review could not be saved. Reload the checkpoint and retry.',
    });
  }
}

export const GET = (request:Request) => guarded(request,handleGET);
export const POST = (request:Request) => guarded(request,handlePOST);
