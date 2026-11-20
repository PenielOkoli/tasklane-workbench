# Tasklane Flow

FlexiSAF Deliverable 11 — Performance Optimization for AI Frontends.

**[Live app](https://tasklane-flow.vercel.app)** · **[Performance report](docs/modules/11/performance-report.md)** · **[Submission walkthrough](docs/modules/11/submission.md)**

Continues Tasklane Guard in a separate repository and GitHub-connected Vercel project. Find grounded project answers, review AI feedback, run golden-task comparisons and retain the earlier approval/security controls.

## Measured changes

- 100 mounted AI history records → 10 per page; all 100 remain reachable and exportable.
- 1,575,400 characters of eagerly formatted hidden response JSON → zero until opened.
- Median React review-update time: 10.4 ms → 2.3 ms (15 edits per version).
- Initial review JavaScript: 704,634 → 600,655 bytes (14.8% less; gzip 13.6% less).
- Lab LCP median: 544 → 360 ms; CLS unchanged at 0.01076.

**INP is unresolved.** Immediate reports were missing/inconsistent and a later candidate observation was 4,192 ms. No INP improvement or field Core Web Vitals pass is claimed. See the full methodology, raw data and excluded pilots in the report.

`/evaluation?perf=1` is a deterministic 100-answer **synthetic** performance scenario. It makes no model requests and does not read or write saved feedback. Normal `/evaluation` uses real saved records. This is long AI-response history optimization, not token-stream optimization.

## Run

Use Node 22. `npm ci`, then `npm run dev`, or `npm run build` and `npm start`.

Server-only variables: `GROQ_API_KEY` and `SESSION_SECRET` (at least 32 random characters). Never use NEXT_PUBLIC variables for credentials. Each Vercel project needs its own sensitive Production configuration. The isolated performance scenario needs neither variable; real APIs fail closed when session protection is missing.

Checks: `npm test`, `npm run typecheck`, `npm run build`. Bundle evidence: start production on port 3011, then `node scripts/measure-bundle.mjs candidate`. Live smoke: `node --import tsx scripts/verify-flow.ts https://tasklane-flow.vercel.app`.

## Security and privacy

Secrets and provider calls stay server-side. Input/output schemas, source allowlists, sanitization and plain-text rendering remain. Task changes still require approval. AI calls require the existing user request/consent. History is tab-local by default with optional seven-day retention; encrypted workspace cookies expire after 24 hours. Use Trust & privacy to inspect or clear app state. It cannot delete exported files or external Groq/Vercel logs. No shared database or authentication system is claimed. Abuse limits are process-local and require shared protection for broader production use.

Foundation: [Tasklane Guard f39733f](https://github.com/PenielOkoli/tasklane-guard/commit/f39733f713fac1bc0bdf0948a2f5263c5ec2116d). Its historical security evidence is in that repository, not proof of this deployment. New verification is recorded in docs/modules/11.
