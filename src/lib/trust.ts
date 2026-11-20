export const trustRules = [
 'Only the four bundled fictional project sources can be selected. No remote URLs, private files or uploads are fetched.',
 'Source passages and user text are data, never instructions that can replace the application rules.',
 'Suspicious instruction overrides or requests for secrets are blocked before synthesis. Detection is heuristic and can miss disguised attacks.',
 'Citations must point to selected retrieved passages. A valid ID does not prove a claim is true; inspect the passage.',
 'Knowledge is read-only. Task changes still require a specific preview and human approval; archive also requires ARCHIVE.',
] as const;
export function injectionWarning(text:string):string|null {
 const value=text.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').toLowerCase();
 const patterns=[/\bignore\b.{0,45}\b(previous|above|system|instructions|rules)\b/,/\b(reveal|print|show|expose|send|leak)\b.{0,50}\b(api.?key|secret|system prompt|environment variable|password|token)\b/,/\b(bypass|skip|disable)\b.{0,35}\b(approval|confirmation|safety|guardrail)\b/,/\b(system|developer)\s*(message|prompt)\s*:/,/<\s*(script|iframe|svg)\b/i,/\bjavascript\s*:/i];
 return patterns.some(p=>p.test(value))?'This content appears to request an instruction override, secret disclosure, unsafe markup, or skipped approval. Rephrase it as a project question. No AI call was made.':null;
}
