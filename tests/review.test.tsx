import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { nextStage, roles, sampleBrief } from '../src/lib/review-contracts';
import { newReview, practiceRole, practiceSynthesis, saveDecision, saveRole, saveSynthesis, verifyCheckpoint } from '../src/lib/review-engine';

const makeReview = () => newReview(randomUUID(), Date.now() + 60_000, 'practice', sampleBrief);

test('handoff order holds and independent lanes keep their separate positions', () => {
  const review = makeReview();
  assert.throws(() => saveRole(review, 'testing', practiceRole('testing')), /current assignment/);
  for (const role of roles) saveRole(review, role, practiceRole(role));
  assert.deepEqual(roles.map(role => review.outputs[role]?.output.position), ['investigate', 'pilot', 'hold']);
  assert.equal(nextStage(review), 'decision');
});

test('synthesis needs a recorded human choice and cannot replace it', () => {
  const review = makeReview();
  assert.throws(() => saveDecision(review, 'hold', 'Verify the quality gates.'), /Compare/);
  for (const role of roles) saveRole(review, role, practiceRole(role));
  assert.throws(() => saveSynthesis(review, practiceSynthesis('hold')), /human decision/);
  saveDecision(review, 'hold', 'Verify the quality gates.');
  assert.throws(() => saveDecision(review, 'pilot', 'Try a new choice.'), /Compare/);
  saveSynthesis(review, practiceSynthesis('hold'));
  assert.equal(nextStage(review), 'completed');
  assert.equal(review.decision?.reason, 'Verify the quality gates.');
  assert.equal(review.synthesis?.output.owner, 'Testing');
});

test('role sources are scoped and stale checkpoint versions cannot advance', () => {
  const review = makeReview();
  assert.throws(() => saveRole(review, 'research', { ...practiceRole('research'), sourceIds: ['quality-2'] }), /unavailable source/);
  assert.equal(review.outputs.research, undefined);
  verifyCheckpoint(review, review.id, 0);
  assert.throws(() => verifyCheckpoint(review, review.id, 2), /changed/);
});
