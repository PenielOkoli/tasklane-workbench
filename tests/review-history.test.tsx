import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {filterReviewHistory, historyPage, updateReviewStatus, type Feedback} from '../src/lib/review-history';
import {FeedbackHistory} from '../src/components/feedback-history';
const record = (id: string, status: string): Feedback => ({id, status, question: `Question ${id}`, rating: 'Useful', note: '', at: '2026-11-20'});
test('review filters partition statuses without losing follow-up work', () => {
 const items = ['New', 'Reviewed', 'Add to golden tasks', 'legacy'].map((s, i) => record(String(i), s));
 assert.deepEqual(filterReviewHistory(items, 'all'), items);
 assert.deepEqual(filterReviewHistory(items, 'reviewed').map(i => i.id), ['1']);
 assert.deepEqual(filterReviewHistory(items, 'needs-review').map(i => i.id), ['0', '2', '3']);
});
test('filter before pagination finds matches beyond the first unfiltered page', () => {
 const items = Array.from({length: 25}, (_, i) => record(String(i), i < 12 ? 'Reviewed' : 'New'));
 const matches = filterReviewHistory(items, 'needs-review');
 assert.deepEqual(historyPage(matches, 0).items.map(i => i.id), Array.from({length: 10}, (_, i) => String(i + 12)));
 assert.deepEqual(historyPage(matches, 1).items.map(i => i.id), ['22', '23', '24']);
});
test('reviewing the last filtered page clamps to a populated page', () => {
 const items = Array.from({length: 11}, (_, i) => record(String(i), 'New'));
 const updated = updateReviewStatus(items, '10', 'Reviewed');
 const view = historyPage(filterReviewHistory(updated, 'needs-review'), 1);
 assert.equal(view.page, 0); assert.equal(view.items.length, 10); assert.equal(view.end, 10);
 assert.equal(updated.length, 11); assert.equal(items[10].status, 'New');
});
test('filters preserve payload references and full export input', () => {
 const payload = Object.freeze({answer: 'Original response'});
 const item = Object.freeze({...record('one', 'New'), response: payload});
 const items = Object.freeze([item]);
 assert.equal(filterReviewHistory(items, 'needs-review')[0], item);
 assert.equal(filterReviewHistory(items, 'reviewed').length, 0);
 assert.equal(items[0].response, payload); assert.equal(items.length, 1);
});
test('rendered history has labelled controls, bounded rows and escaped user content', () => {
 const items = Array.from({length: 15}, (_, i) => record(String(i), 'New'));
 items[0].question = '<script>alert(1)</script>';
 const html = renderToStaticMarkup(<FeedbackHistory items={items} onStatus={() => {}}/>);
 assert.match(html, /<label for="([^"]+)">Filter by review status/);
 assert.match(html, /<option value="all" selected="">All/);
 assert.match(html, /role="status">Showing 1-10 of 15 matching answers \(15 saved total\)/);
 assert.equal((html.match(/data-review-row/g) || []).length, 10);
 assert.doesNotMatch(html, /<script>/); assert.match(html, /&lt;script&gt;/);
});
test('empty history retains its distinct onboarding state', () => {
 const html = renderToStaticMarkup(<FeedbackHistory items={[]} onStatus={() => {}}/>);
 assert.match(html, /No feedback yet/); assert.doesNotMatch(html, /No answers match/);
 assert.match(html, /Showing 0-0 of 0 matching answers \(0 saved total\)/);
});
