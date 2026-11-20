'use client';
import {useId, useRef, useState} from 'react';
import {filterReviewHistory, historyPage, type Feedback, type ReviewFilter} from '@/lib/review-history';
import {DeferredJson} from './deferred-json';

export function FeedbackHistory({items, onStatus}: {items: Feedback[]; onStatus: (id: string, status: string) => void}) {
 const [page, setPage] = useState(0);
 const [filter, setFilter] = useState<ReviewFilter>('all');
 const heading = useRef<HTMLHeadingElement>(null);
 const filterId = useId();
 const matching = filterReviewHistory(items, filter);
 const view = historyPage(matching, page);
 function changeFilter(next: ReviewFilter) { setFilter(next); setPage(0); }
 function go(next: number) { setPage(next); heading.current?.focus({preventScroll: true}); }
 function changeStatus(item: Feedback, status: string) {
  // Keep focus on a stable landmark when the edited row leaves the filter.
  if (!filterReviewHistory([{...item, status}], filter).length) {
   setPage(historyPage(matching.filter(record => record.id !== item.id), view.page).page);
   heading.current?.focus({preventScroll: true});
  }
  onStatus(item.id, status);
 }
 return <section aria-label="AI answer review history">
  <h3 ref={heading} tabIndex={-1}>Saved answer history</h3>
  <p>Rate an answer in <a href="/knowledge">Knowledge</a>, then return here to review it. All records remain available for export.</p>
  <label htmlFor={filterId}>Filter by review status </label>
  <select id={filterId} value={filter} onChange={event => changeFilter(event.target.value as ReviewFilter)}>
   <option value="all">All</option><option value="reviewed">Reviewed</option><option value="needs-review">Needs review</option>
  </select>
  <p>Needs review includes new answers and answers marked Add to golden tasks.</p>
  <p role="status">Showing {view.start}-{view.end} of {matching.length} matching answers ({items.length} saved total)</p>
  {matching.length > 10 && <nav className="eval-pagination" aria-label="Review history pages">
   <button disabled={view.page === 0} onClick={() => go(view.page - 1)}>Previous</button>
   <label>History page <select value={view.page} onChange={event => go(Number(event.target.value))}>
    {Array.from({length: view.pages}, (_, i) => <option key={i} value={i}>{i + 1} of {view.pages}</option>)}
   </select></label>
   <button disabled={view.page === view.pages - 1} onClick={() => go(view.page + 1)}>Next</button>
  </nav>}
  {!items.length ? <div className="eval-empty">No feedback yet.<br/><span>The next useful test can start with a user's experience.</span></div>
   : !matching.length && <div className="eval-empty">No answers match this filter. <button onClick={() => {changeFilter('all'); heading.current?.focus({preventScroll: true});}}>Clear filter</button></div>}
  {view.items.map(item => <article data-review-row className="eval-response" key={item.id}>
   <h3>{item.rating} · {item.question}</h3><p>{item.note || 'No written comment.'}</p><small>{item.at}</small>
   <DeferredJson value={item.response} label="Response at feedback time"/>
   <label>Review status <select aria-label={`Review status for ${item.question}`} value={item.status} onChange={event => changeStatus(item, event.target.value)}>
    <option>New</option><option>Reviewed</option><option>Add to golden tasks</option>
   </select></label>
  </article>)}
 </section>;
}
