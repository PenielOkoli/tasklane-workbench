# Tasklane Workbench

FlexiSAF Week 12: AI Coding Agents for Frontend Engineering.

Continues Tasklane Flow in a separate repository. The bounded task adds All, Reviewed and Needs review filters to saved AI answer history, preserving pagination and the full saved dataset.

## Workflow evidence

- [Issue and acceptance criteria](docs/modules/12/issue.md)
- [Agent plan written before implementation](docs/modules/12/plan.md)
- Feature branch: `feat/review-status-filter`
- Tests: `tests/review-history.test.tsx`

The issue's detailed wording is agent-drafted; the learner selected the task before implementation. Learner-authored diff comments remain pending and are not replaced by AI self-review.

## Run locally

Use Node.js 22. Run `npm ci`, then `npm run dev`. Open `/evaluation?perf=1` for 100 synthetic answers, without model calls or saved-data changes. Open Feedback in `/evaluation` for ordinary saved answers.

`npm test` runs the test suite. `npm run typecheck` checks TypeScript. `npm run build` builds production output.

## Current verification and limits

71 tests passed on 20 November 2026. The local production build was blocked by Windows denying Turbopack's junction creation. A successful production build and browser verification are not claimed. This deliverable has no verified live deployment yet. Prior Tasklane URLs belong to earlier submissions.

Provider features require a server-only GROQ_API_KEY and a distinct SESSION_SECRET in the deployment environment. Never commit secrets. Sample history needs neither. Existing demo storage and security limits remain; this task does not introduce durable persistence or production authentication.

## Provenance

Source baseline: Tasklane Flow commit `e7f2556f37945d9393f6bff89c078d1623f0dbe2`. The local baseline and pre-edit issue/plan were committed as `614ae0d`. GitHub publication uses API-created commits because local Git networking is unavailable, so remote commit IDs differ. Historical repositories and deployments are unchanged.
