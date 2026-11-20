import { z } from 'zod';
import { actionSchema, searchInput } from './contracts';

const short = (n: number) => z.string().trim().min(1).max(n);
export const readToolSchema = z.discriminatedUnion('toolName', [
  z.object({ toolName: z.literal('searchTasks'), input: searchInput }).strict(),
  z.object({ toolName: z.literal('searchKnowledge'), input: z.object({ query: short(160) }).strict() }).strict(),
]);
export const runToolSchema = z.union([readToolSchema, actionSchema]);
export const planSchema = z.object({
  summary: short(240).describe('Brief user-facing approach, not private reasoning.'),
  clarification: z.string().max(240).describe('Question when intent or target is ambiguous, otherwise empty string.'),
  steps: z.array(z.object({ title: short(80), purpose: short(160), tool: runToolSchema }).strict()).max(4),
}).strict();
export type Plan = z.infer<typeof planSchema>;

// Keep the provider schema flat. The execution schema below this boundary
// still checks the exact input shape and allowed values for each tool.
export const plannerResponseSchema = z.object({
  summary: z.string(),
  clarification: z.string(),
  steps: z.array(z.object({
    title: z.string(),
    purpose: z.string(),
    toolName: z.enum(['searchTasks', 'searchKnowledge', 'createTask', 'setPriority', 'moveTask', 'archiveTask']),
    arguments: z.object({
      query: z.string(),
      status: z.string(),
      priority: z.string(),
      title: z.string(),
      description: z.string(),
      tag: z.string(),
      taskId: z.string(),
    }).strict(),
  }).strict()),
}).strict();

export function decodePlannerResponse(response: z.infer<typeof plannerResponseSchema>): Plan {
  return planSchema.parse({
    summary: response.summary,
    clarification: response.clarification,
    steps: response.steps.map(step => ({
      title: step.title,
      purpose: step.purpose,
      tool: {
        toolName: step.toolName,
        input: Object.fromEntries(Object.entries(step.arguments).filter(([name, value]) =>
          value.trim() !== '' || (step.toolName === 'searchTasks' && name === 'query'),
        )),
      },
    })),
  });
}
export const runStatusSchema = z.enum(['planning', 'running', 'tool_use', 'blocked', 'needs_approval', 'paused', 'completed', 'failed', 'cancelled']);
export type RunStatus = z.infer<typeof runStatusSchema>;
const stepSchema = z.object({
  title: short(80), purpose: short(160), tool: runToolSchema,
  status: z.enum(['pending', 'running', 'needs_approval', 'completed', 'failed', 'cancelled']),
  result: z.string().max(700), durationMs: z.number().nonnegative(),
}).strict();
const traceSchema = z.object({ seq: z.number().int(), at: z.number(), event: z.string().max(40), detail: z.string().max(200), step: z.number().int().nullable(), durationMs: z.number().nonnegative() }).strict();
export const runSchema = z.object({
  id: z.string().uuid(), sessionId: z.string().uuid(), expiresAt: z.number(), version: z.number().int(),
  status: runStatusSchema, resumeStatus: runStatusSchema.nullable(),
  instructions: short(700), summary: z.string().max(240), clarification: z.string().max(240),
  mode: z.enum(['ai', 'demo']), scenario: z.enum(['launch', 'clarification', 'failure']),
  steps: z.array(stepSchema).max(4), cursor: z.number().int().min(0).max(4),
  proposalId: z.string().uuid().nullable(), error: z.string().max(240),
  sequence: z.number().int(), trace: z.array(traceSchema).max(24),
}).strict();
export type Run = z.infer<typeof runSchema>;
export const terminal = (status: RunStatus) => ['completed', 'cancelled'].includes(status);
export const statusLabels: Record<RunStatus, string> = {
  planning: 'Planning', running: 'Running', tool_use: 'Using a tool', blocked: 'Needs clarification',
  needs_approval: 'Needs approval', paused: 'Paused', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled',
};
