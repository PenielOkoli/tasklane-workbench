# Filter saved AI answers by review status

## Authorship and decision
Drafted by Codex before implementation on 20 November 2026. The learner selected “Review-status filter (Recommended)” in this conversation, including All, Reviewed, Needs review, correct pagination and empty states. Detailed criteria below are agent-drafted, not represented as independently learner-written. The learner should add their own rationale or revisions before submission.

## Context
Tasklane's evaluation history displays ten saved answers at a time. Reviewers currently scan all pages to find outstanding work. Add a bounded frontend filter using existing records and status updates.

## Acceptance criteria
1. A visibly labelled native select offers All, Reviewed, and Needs review; All is default.
2. Reviewed includes only exact Reviewed status. Needs review includes every other status, including Add to golden tasks and unknown legacy values, so no unresolved work silently disappears.
3. Filter before paginating; show matching count and total saved count. Keep ten rows per page. Changing the filter resets to page one.
4. Editing a matching record can remove it from the current view. Clamp a shrinking page and keep keyboard focus usable when its row disappears.
5. Distinguish no saved feedback from no matching records; offer Clear filter for the latter.
6. Filtering does not delete, rewrite, export only a subset of, or send saved answers to a server. Existing full-history export and persistence remain intact.
7. Add meaningful regression tests for status classification, filtering before pagination, shrinking pages, immutability and accessible rendered controls. Verify interactions separately.

## Scope and constraints
Primary files: src/components/feedback-history.tsx, src/lib/review-history.ts, tests/review-history.test.tsx. Minimal related CSS only if necessary. No dependencies, API/schema/authentication changes, model calls, new storage keys or redesign. Preserve deferred JSON and existing project styling.

## Done and review gate
Plan recorded before source edits; feature branch; actual diff review; passing relevant tests/typecheck/build; new GitHub repository and separate GitHub-connected Vercel project. Learner-authored substantive diff comments and manual verification must be recorded before claiming assessment completion. AI self-review cannot satisfy the human gate.
