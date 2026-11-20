'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ClipboardCheck, Download, GitBranch, Layers3, LoaderCircle, PenTool, Search, ShieldCheck, Users } from 'lucide-react';
import { nextStage, positionLabels, positions, roleInfo, roles, roleSources, sampleBrief, sourceTitles, type Position, type ReviewView, type Role } from '@/lib/review-contracts';
import './studio.css';

const icons = { research: Search, design: PenTool, testing: ClipboardCheck };
const time = (at: number) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(at);
type ResponseData = { review: ReviewView | null; configured: boolean; error?: string };

export function Studio() {
  const [data, setData] = useState<ResponseData>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [brief, setBrief] = useState(sampleBrief);
  const [consent, setConsent] = useState(false);
  const [position, setPosition] = useState<Position | ''>('');
  const [reason, setReason] = useState('');
  const [newReview, setNewReview] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/review', { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const payload: ResponseData = await response.json();
        if (!response.ok) throw new Error(payload.error);
        setData(payload);
      })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load the review. Reload to retry.'); });
    return () => controller.abort();
  }, []);

  async function command(label: string, body: object) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(label);
    setError('');
    try {
      const response = await fetch('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const payload: ResponseData = await response.json();
      if (payload.review) setData(payload);
      if (!response.ok) setError(payload.error || 'The review could not continue.');
      return response.ok;
    } catch {
      setError('Connection interrupted. Reload to check the last saved checkpoint.');
      return false;
    } finally {
      lock.current = false;
      setBusy('');
    }
  }

  async function start(mode: 'ai' | 'practice') {
    if (await command('Starting review', { operation: 'start', mode, brief: mode === 'practice' ? sampleBrief : brief, consent })) {
      setPosition('');
      setReason('');
      setNewReview(false);
    }
  }
  const review = data?.review;
  const stage = review ? nextStage(review) : null;
  const completed = roles.filter(role => review?.outputs[role]).length;
  const compare = completed === roles.length;
  const differing = compare && new Set(roles.map(role => review?.outputs[role]?.output.position)).size > 1;
  const checkpoint = review && { id: review.id, version: review.version };
  const advance = (label: string) => command(label, { operation: 'advance', ...checkpoint });
  const status = !review ? 'Awaiting a brief' : review.error ? 'Needs retry' : stage === 'completed' ? 'Review complete' : stage === 'decision' ? 'Your decision required' : stage === 'synthesis' ? 'Ready for synthesis' : 'Review in progress';

  function exportReview() {
    if (!review) return;
    const handoffs = { design: ['research'], testing: ['research'], synthesis: [...roles, 'project lead'] };
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...review, handoffs }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `tasklane-review-${review.id.slice(0, 8)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="studio">
    <header className="studio-header">
      <a className="studio-brand" href="/"><Layers3 size={21} /> tasklane<span>.</span></a>
      <nav aria-label="Workspace"><a aria-current="page" href="/studio">Studio</a><a href="/agent">Agent</a><a href="/knowledge">Knowledge</a><a href="/board">Board</a></nav>
      <span className="studio-project"><span /> Spring launch</span>
    </header>
    <main className="studio-main">
      <section className="studio-hero">
        <div><p className="studio-label"><Users size={15} /> Release review</p><h1>The decision room<span>.</span></h1><p>Give three specialists the same project brief. Compare what they recommend, then record your call.</p></div>
        <div className="studio-gate"><ShieldCheck size={25} /><div><strong>Project lead decides</strong><span>Recommendations stay in this review.</span></div></div>
      </section>
      <section className="studio-brief" aria-labelledby="brief-title">
        <div className="studio-heading"><h2 id="brief-title">Project brief</h2>{review && <button className="studio-secondary" type="button" onClick={() => setNewReview(!newReview)} disabled={Boolean(busy)}>{newReview ? 'Close new review' : 'New review'}</button>}</div>
        {review && <p className="studio-current-brief">{review.brief}</p>}
        {(!review || newReview) && <form className="studio-start" onSubmit={event => { event.preventDefault(); void start('ai'); }}>
          <label htmlFor="review-brief">What should the team review?</label>
          <textarea id="review-brief" rows={2} value={brief} onChange={event => setBrief(event.target.value)} maxLength={450} required disabled={Boolean(busy)} />
          <label className="studio-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={Boolean(busy)} /> Allow Groq to process the brief, sample passages, role outputs and decision rationale.</label>
          <div className="studio-actions"><button className="studio-primary" disabled={!data?.configured || !consent || brief.trim().length < 8 || Boolean(busy)}>Start AI review <ArrowRight size={17} /></button>
            <button type="button" className="studio-secondary" disabled={!data || Boolean(busy)} onClick={() => void start('practice')}>Start practice review</button></div>
          <small>{data && !data.configured ? 'Live AI is unavailable in this deployment. ' : ''}Practice uses fixed outputs and the sample brief. A new review replaces the saved review.</small>
        </form>}
      </section>
      <div className="studio-status" role="status"><span>{busy ? <><LoaderCircle className="studio-spinner" size={15} />{busy}</> : <><span className="studio-dot" />{status}</>}</span><span>{review?.mode === 'ai' ? 'Live AI' : review ? 'Practice run' : 'Sample project'} · {completed}/3 roles finished</span></div>
      {(error || review?.error) && <p className="studio-alert" role="alert">{error || review?.error}</p>}

      <section aria-labelledby="role-title">
        <div className="studio-heading studio-section"><div><p className="studio-label"><GitBranch size={15} /> Role lanes</p><h2 id="role-title">Who’s doing what</h2></div></div>
        <div className="studio-lanes">
          {roles.map(role => <RoleCard key={role} role={role} review={review} active={stage === role} busy={busy} onRun={() => void advance(`${roleInfo[role].name} is working`)} />)}
        </div>
        <div className="studio-handoff">
          <h2>Handoff record</h2>
          <div className="studio-transfers">
            {(['design', 'testing'] as const).map(role => <details key={role}><summary><span>Researcher <ArrowRight size={15} /> {roleInfo[role].name}</span><small>{review?.outputs[role] ? 'Used' : review?.outputs.research ? 'Ready' : 'Waiting for research'}</small></summary>
              {review?.outputs.research ? <><p><strong>Position.</strong> {positionLabels[review.outputs.research.output.position]}</p><p><strong>Recommendation.</strong> {review.outputs.research.output.recommendation}</p><p><strong>Rationale.</strong> {review.outputs.research.output.rationale}</p><p><strong>Uncertainty.</strong> {review.outputs.research.output.uncertainty}</p><p><strong>Sources.</strong> {review.outputs.research.output.sourceIds.join(', ') || 'None cited'}</p><small>Prepared {time(review.outputs.research.at)}{review.outputs[role] ? ` · Used ${time(review.outputs[role].at)}` : ''}</small></> : <p>The research output and its evidence references will appear here.</p>}
            </details>)}
          </div>
        </div>
      </section>

      <section className="studio-compare" aria-labelledby="compare-title">
        <div className="studio-heading"><div><p className="studio-label">Comparison</p><h2 id="compare-title">Compare recommendations</h2></div>{compare && <span className={differing ? 'studio-diff' : 'studio-aligned'}>{differing ? 'Different positions' : 'Same position'}</span>}</div>
        {!compare ? <p className="studio-muted">Complete all three assignments to compare recommendations and record your decision.</p> :
          <div className="studio-comparison-grid">{roles.map(role => {
            const output = review?.outputs[role]?.output;
            if (!output) return null;
            return <article key={role}><p className="studio-label">{roleInfo[role].name}</p><h3>{positionLabels[output.position]}</h3><p>{output.recommendation}</p><p><strong>Why.</strong> {output.rationale}</p><p><strong>Still unknown.</strong> {output.uncertainty}</p></article>;
          })}</div>}
        {stage === 'decision' && <form className="studio-decision" onSubmit={event => {
          event.preventDefault();
          if (position && reason.trim().length >= 6) void command('Saving decision', { operation: 'decide', ...checkpoint, position, reason });
        }}>
          <p className="studio-label"><ShieldCheck size={16} /> Human decision required</p>
          <fieldset><legend>What should happen next?</legend><div className="studio-options">{positions.map(choice => <label key={choice}><input type="radio" name="decision" value={choice} checked={position === choice} onChange={() => setPosition(choice)} disabled={Boolean(busy)} />{positionLabels[choice]}</label>)}</div></fieldset>
          <label htmlFor="decision-reason">Why did you choose this?</label><textarea id="decision-reason" value={reason} onChange={event => setReason(event.target.value)} rows={2} maxLength={260} required disabled={Boolean(busy)} placeholder="Name the tradeoff or release gate behind your decision." />
          <button className="studio-primary" disabled={!position || reason.trim().length < 6 || Boolean(busy)}>Record decision <ArrowRight size={17} /></button>
        </form>}
      </section>

      <section className="studio-finish" aria-labelledby="finish-title">
        <div className="studio-heading"><div><p className="studio-label">Final review</p><h2 id="finish-title">Synthesis & decision log</h2></div>{review?.decision && <button type="button" className="studio-secondary" onClick={exportReview}><Download size={16} /> Export review</button>}</div>
        {!review?.decision ? <p className="studio-muted">The project lead’s choice and rationale will appear here before synthesis.</p> : <>
          <article className="studio-record"><p className="studio-label"><ShieldCheck size={15} /> Project lead · {time(review.decision.at)}</p><h3>{positionLabels[review.decision.position]}</h3><p>{review.decision.reason}</p></article>
          {review.synthesis ? <article className="studio-synthesis"><p className="studio-label"><Check size={16} /> {review.mode === 'ai' ? 'AI synthesis' : 'Practice synthesis'} · {time(review.synthesis.at)}</p><h3>Next action</h3><p>{review.synthesis.output.nextStep}</p><p><strong>Proposed owner.</strong> {review.synthesis.output.owner}</p><p><strong>Open risk.</strong> {review.synthesis.output.openRisk}</p></article>
            : <div className="studio-synthesis"><p>Inputs: Researcher, Designer, Tester and the recorded project lead decision.</p><button className="studio-primary" type="button" disabled={Boolean(busy)} onClick={() => void advance('Preparing synthesis')}>{review.error ? 'Retry synthesis' : 'Generate synthesis'} <ArrowRight size={17} /></button></div>}
        </>}
      </section>
      <footer className="studio-footer"><span>Sample project · Saved in this browser for up to 24 hours · One tab per review</span><a href="/guide">How Tasklane works <ArrowRight size={14} /></a></footer>
    </main>
  </div>;
}

function RoleCard({ role, review, active, busy, onRun }: { role: Role; review?: ReviewView | null; active: boolean; busy: string; onRun: () => void }) {
  const info = roleInfo[role];
  const Icon = icons[role];
  const record = review?.outputs[role];
  const state = record ? 'Complete' : busy === `${info.name} is working` ? 'Running' : active ? review?.error ? 'Needs retry' : 'Ready' : 'Waiting';
  return <article className={`studio-role studio-role-${role}${active ? ' active-role' : ''}`}>
    <div className="studio-role-top"><span className="studio-role-icon"><Icon size={23} /></span><span className="studio-role-status">{record && <Check size={13} />}{state}</span></div>
    <h3>{info.name}</h3><p className="studio-assignment">{info.assignment}</p>
    <details className="studio-inputs"><summary>Assignment inputs</summary><ul><li>Project brief</li>{role !== 'research' && <li>Researcher’s handoff</li>}{roleSources[role].map(id => <li key={id}>{sourceTitles[id]}</li>)}</ul></details>
    {record ? <div className="studio-role-output"><p className="studio-label">{positionLabels[record.output.position]}</p><p>{record.output.recommendation}</p><small>{record.output.sourceIds.length ? record.output.sourceIds.map(id => <a className="studio-citation" key={id} href={`/api/knowledge?passage=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">{sourceTitles[id]}</a>) : 'No relevant sample passage cited'}</small></div>
      : active && <button type="button" className="studio-primary studio-run" disabled={Boolean(busy)} onClick={onRun}>{review?.error ? `Retry ${info.name}` : `Run ${info.name}`} <ArrowRight size={17} /></button>}
  </article>;
}
