import { z } from 'zod';

export const roles = ['research', 'design', 'testing'] as const;
export type Role = typeof roles[number];
export const roleInfo = {
  research: { name: 'Researcher', assignment: 'Read the launch brief and discovery notes. Identify what is known and where evidence is missing.' },
  design: { name: 'Designer', assignment: 'Use the research handoff to propose the smallest useful experience for pilot users.' },
  testing: { name: 'Tester', assignment: 'Use the research handoff to check release gates and name what needs verification.' },
} satisfies Record<Role, { name: string; assignment: string }>;
export const positions = ['pilot', 'hold', 'investigate'] as const;
export const positionLabels = {
  pilot: 'Prepare a limited pilot',
  hold: 'Hold the release',
  investigate: 'Gather more evidence',
} satisfies Record<typeof positions[number], string>;
const short = (max: number) => z.string().trim().min(1).max(max);

// Use simple provider schemas. Enforce storage and evidence bounds separately.
export const providerRole = z.object({
  position: z.enum(positions),
  recommendation: z.string(),
  rationale: z.string(),
  uncertainty: z.string(),
  sourceIds: z.array(z.string()),
}).strict();
export const roleOutput = providerRole.extend({
  recommendation: short(150),
  rationale: short(180),
  uncertainty: short(140),
  sourceIds: z.array(short(24)).max(3),
});
export const providerSynthesis = z.object({
  nextStep: z.string(),
  owner: z.enum(['Project lead', 'Design', 'Testing', 'Research']),
  openRisk: z.string(),
}).strict();
export const synthesisOutput = providerSynthesis.extend({
  nextStep: short(190),
  openRisk: short(150),
});
export const decisionSchema = z.object({
  position: z.enum(positions),
  reason: short(260),
  at: z.number().int(),
}).strict();
const roleRecord = z.object({ output: roleOutput, at: z.number().int() }).strict();
export const reviewSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().nonnegative(),
  sessionId: z.string().uuid(),
  expiresAt: z.number().int(),
  mode: z.enum(['practice', 'ai']),
  brief: short(450),
  startedAt: z.number().int(),
  outputs: z.object({
    research: roleRecord.optional(),
    design: roleRecord.optional(),
    testing: roleRecord.optional(),
  }).strict(),
  decision: decisionSchema.nullable(),
  synthesis: z.object({ output: synthesisOutput, at: z.number().int() }).strict().nullable(),
  error: z.string().max(160).nullable(),
}).strict();
export type Review = z.infer<typeof reviewSchema>;
export type ReviewView = Omit<Review, 'sessionId' | 'expiresAt'>;
export type RoleOutput = z.infer<typeof roleOutput>;
export type Synthesis = z.infer<typeof synthesisOutput>;
export type Position = typeof positions[number];
export const sampleBrief = 'Should we prepare a limited pilot for the new onboarding flow, or wait for release checks and more customer evidence?';
export const sourceTitles: Record<string, string> = {
  'brief-2': 'Release decision',
  'research-1': 'Onboarding findings',
  'research-2': 'Research limitations',
  'quality-1': 'Mobile review',
  'quality-2': 'Release quality gate',
};
export const roleSources: Record<Role, readonly string[]> = {
  research: ['brief-2', 'research-1', 'research-2'],
  design: ['brief-2', 'research-1', 'research-2'],
  testing: ['brief-2', 'research-1', 'research-2', 'quality-1', 'quality-2'],
};

export function nextStage(review: Pick<Review, 'outputs' | 'decision' | 'synthesis'>) {
  const role = roles.find(id => !review.outputs[id]);
  if (role) return role;
  if (!review.decision) return 'decision';
  return review.synthesis ? 'completed' : 'synthesis';
}
