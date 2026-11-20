import { randomUUID } from 'node:crypto';
import { ActionError } from './engine';
import { decisionSchema, nextStage, roleOutput, roleSources, synthesisOutput, type Position, type Review, type Role, type RoleOutput, type Synthesis } from './review-contracts';

export function newReview(sessionId: string, expiresAt: number, mode: Review['mode'], brief: string): Review {
  return { id: randomUUID(), version: 0, sessionId, expiresAt, mode, brief, startedAt: Date.now(), outputs: {}, decision: null, synthesis: null, error: null };
}

export function verifyCheckpoint(review: Review, id: string, version: number) {
  if (review.id !== id || review.version !== version) throw new ActionError(409, 'This checkpoint has changed. Reload the review before continuing.');
}

export function saveRole(review: Review, role: Role, raw: unknown) {
  if (nextStage(review) !== role) throw new ActionError(409, 'Finish the current assignment before handing off.');
  const output = roleOutput.parse(raw);
  if (output.sourceIds.some(id => !roleSources[role].includes(id))) {
    throw new ActionError(422, 'A role cited an unavailable source. Retry this assignment.');
  }
  review.outputs[role] = { output: { ...output, sourceIds: [...new Set(output.sourceIds)] }, at: Date.now() };
  review.error = null;
}

export function saveDecision(review: Review, position: Position, reason: string) {
  if (nextStage(review) !== 'decision') throw new ActionError(409, 'Compare the three role outputs before recording a decision.');
  review.decision = decisionSchema.parse({ position, reason, at: Date.now() });
  review.error = null;
}

export function saveSynthesis(review: Review, output: unknown) {
  if (nextStage(review) !== 'synthesis') throw new ActionError(409, 'A human decision is required before synthesis.');
  review.synthesis = { output: synthesisOutput.parse(output), at: Date.now() };
  review.error = null;
}

const examples: Record<Role, RoleOutput> = {
  research: {
    position: 'investigate',
    recommendation: 'Confirm where new users struggle before expanding the rollout.',
    rationale: 'Three interviewees missed the first useful action. Five existing customers are too small a sample to estimate conversion.',
    uncertainty: 'There are no results from first-time users or measured pilot outcomes.',
    sourceIds: ['research-1', 'research-2'],
  },
  design: {
    position: 'pilot',
    recommendation: 'Prepare a small pilot around a clearer first action and fewer required fields.',
    rationale: 'A narrow experience gives the team a way to test the handoff finding with first-time users.',
    uncertainty: 'The research does not tell us which field changes will help most.',
    sourceIds: ['research-1'],
  },
  testing: {
    position: 'hold',
    recommendation: 'Hold distribution until the mobile and accessibility checks pass.',
    rationale: 'The release brief requires the mobile review and quality checklist. The sample gives us no passing results.',
    uncertainty: 'The board and brief do not establish whether blockers have been fixed.',
    sourceIds: ['brief-2', 'quality-1', 'quality-2'],
  },
};
export const practiceRole = (role: Role): RoleOutput => examples[role];
export function practiceSynthesis(position: Position): Synthesis {
  const openRisk = 'Mobile and keyboard checks still need recorded results. Discovery covered only five existing customers.';
  if (position === 'pilot') return { owner: 'Design', nextStep: 'Prepare a pilot brief and a first-action test. Ask Testing to verify release gates before any invitation goes out.', openRisk };
  if (position === 'hold') return { owner: 'Testing', nextStep: 'Run the mobile and keyboard checks, record blockers on the board and bring the results back to the project lead.', openRisk };
  return { owner: 'Research', nextStep: 'Observe first-time users completing onboarding and share their outcomes alongside the release checklist.', openRisk };
}
