'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Circle, ClipboardList, FileSearch, Layers3, Pause, Play, RotateCcw, ShieldCheck, Sparkles, Square, Workflow } from 'lucide-react';
import type { Workspace } from '@/lib/contracts';
import { statusLabels, terminal, type Run } from '@/lib/run-contracts';
type ViewRun = Omit<Run, 'sessionId' | 'expiresAt'>;
type Data = { run: ViewRun | null; workspace: Workspace | null; configured: boolean; error?: string };
const defaultInstructions = 'Review the launch guidance and current board, then prepare a launch readiness checklist task for my approval.';
export function AgentDesk() {
  const [data, setData] = useState<Data | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [instructions, setInstructions] = useState(defaultInstructions), [revision, setRevision] = useState(''), [consent, setConsent] = useState(false);
  const [auto, setAuto] = useState(false), [queued, setQueued] = useState(''), [confirmation, setConfirmation] = useState('');
  const current = useRef<Data | null>(null), locked = useRef(false), pending = useRef<'pause' | 'cancel' | null>(null);
  const send = useCallback(async (operation: string, extra: Record<string, unknown> = {}) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const run = current.current?.run;
      const response = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation, ...(!['start', 'reset'].includes(operation) && run ? { runId: run.id, version: run.version } : {}), ...extra }) });
      const next: Data = await response.json();
      if (next.workspace) { current.current = next; setData(next); }
      if (!response.ok) { setError(next.error || 'The request failed.'); setAuto(false); }
      if (next.run?.status === 'needs_approval') setConfirmation('');
    } catch { setError('Connection interrupted. Reload the saved checkpoint before continuing; the server may have completed this request.'); setAuto(false); }
    finally { locked.current = false; setBusy(false); }
  }, []);
  useEffect(() => { let active = true; fetch('/api/run').then(r => r.json()).then((next: Data) => { if (active) { current.current = next; setData(next); if (next.error) setError(next.error); } }).catch(() => { if (active) setError('Unable to load. Reload the page to try again.'); }); return () => { active = false; }; }, []);
  const run = data?.run;
  useEffect(() => {
    if (busy) return;
    if (pending.current) {
      const operation = pending.current; pending.current = null; setQueued('');
      if (run && !terminal(run.status) && (operation === 'cancel' || ['planning', 'running', 'tool_use', 'needs_approval'].includes(run.status))) void send(operation);
      return;
    }
    if (!auto || !run || !['planning', 'running', 'tool_use'].includes(run.status)) return;
    const timer = setTimeout(() => void send('advance'), 1100);
    return () => clearTimeout(timer);
  }, [auto, busy, run, send]);
  function control(operation: 'pause' | 'cancel') {
    setAuto(false);
    if (locked.current) { pending.current = operation; setQueued(operation); }
    else void send(operation);
  }
  function start(mode: 'ai' | 'demo', scenario = 'launch') { setAuto(true); void send('start', { instructions, mode, scenario, consent }); }
  function exportTrace() {
    if (!run) return;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), run, note: 'Bounded demo checkpoint trace; not a durable audit record.' }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `tasklane-run-${run.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const active = run && !terminal(run.status);
  const completed = run?.steps.filter(s => s.status === 'completed').length || 0;
  const proposal = data?.workspace?.proposal;
  const targetId = proposal && proposal.action.toolName !== 'createTask' ? proposal.action.input.taskId : null;
  const target = targetId ? data?.workspace?.tasks.find(t => t.id === targetId) : null;
  return <div className="agent-app">
    <header className="agent-top"><a className="brand" href="/" aria-label="Tasklane home"><span><Layers3 size={22}/></span>tasklane<span className="brand-period">.</span></a><nav aria-label="Workspace"><a href="/studio">Studio</a><a href="/agent" aria-current="page"><Workflow size={16}/>Agent</a><a href="/knowledge"><FileSearch size={16}/>Knowledge</a><a href="/board"><ClipboardList size={16}/>Project board</a></nav><span className="agent-session"><span/> YOUR DEMO WORKSPACE</span></header>
    <main className="agent-main">
      <section className="agent-intro"><div><div className="agent-kicker">PROJECT WORK, WITH YOU IN CONTROL</div><h1>A little direction.<br/><em>A clear path forward.</em></h1><p>Give your project assistant a goal. Follow the plan,<br className="desktop-only"/> inspect its work, and decide what happens next.</p></div><div className="agent-assurance"><ShieldCheck size={27}/><div><strong>Your approval. Every change.</strong><p>The agent proposes.<br/>You make the call.</p></div></div></section>
      <div className="agent-grid">
        <aside className="agent-sidebar">
          <section className="agent-card goal-card"><div className="agent-section-label"><Sparkles size={16}/> THE DIRECTION</div><h2>What should we work on?</h2><form onSubmit={e => { e.preventDefault(); start('ai'); }}><label htmlFor="agent-goal">Instructions for your assistant</label><textarea id="agent-goal" value={instructions} onChange={e => setInstructions(e.target.value)} maxLength={700} minLength={3} required disabled={Boolean(active) || busy}/><label className="agent-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={Boolean(active) || busy}/><span>Allow Groq to process these instructions and this demo board to plan the work.</span></label><button className="agent-primary" disabled={Boolean(active) || busy || !consent || !data?.configured}><Sparkles size={15}/>Plan with AI<ArrowRight size={15}/></button></form>{data && !data.configured && <p className="agent-note">AI planning is not configured. Practice runs are available below.</p>}</section>
          <section className="agent-practice"><div className="agent-section-label">TAKE A GUIDED WALKTHROUGH</div><p>Practice the controls with a fixed plan. These examples do not call an AI model.</p><button disabled={Boolean(active) || busy || !data?.workspace} onClick={() => start('demo')}>Launch checklist <ArrowRight size={14}/></button><button disabled={Boolean(active) || busy || !data?.workspace} onClick={() => start('demo', 'clarification')}>Missing instructions <ArrowRight size={14}/></button><button disabled={Boolean(active) || busy || !data?.workspace} onClick={() => start('demo', 'failure')}>Recover from a failure <ArrowRight size={14}/></button></section>
          <div className="agent-boundary"><ShieldCheck size={18}/><p>Sample project data only. Runs stay in this browser session for up to 24 hours. Use one tab at a time. Nothing runs in the background after you leave.</p></div>
        </aside>
        <div className="agent-work">
          {error && <div className="agent-alert" role="alert">{error}</div>}
          <section className="agent-card plan-card" aria-label="Agent plan">
            <div className="plan-heading"><div className="plan-title-icon"><Workflow size={21}/></div><div><h2>Your agent workspace</h2><p>A visible plan. One checkpoint at a time.</p></div><span className={`agent-badge ${run?.status || ''}`} role="status">{run ? statusLabels[run.status] : 'Ready when you are'}</span></div>
            {!run ? <div className="agent-empty"><div className="agent-orbit"><Workflow size={32}/></div><h3>From a goal to a plan.</h3><p>Your assistant breaks the work into small, inspectable steps.<br/>Every change stops here for your review.</p><div className="agent-preview-steps"><span><FileSearch size={17}/>Gather context</span><i/><span><ClipboardList size={17}/>Prepare a plan</span><i/><span><ShieldCheck size={17}/>Ask for approval</span></div></div> : <>
              <div className="run-overview"><div className="run-meta"><span>{run.mode === 'ai' ? 'AI-PLANNED RUN' : 'PRACTICE · FIXED PLAN'}</span><span>RUN {run.id.slice(0, 8)} · CHECKPOINT {run.version}</span></div><h3>{run.summary || 'Preparing a plan for your goal…'}</h3><p className="run-instructions">{run.instructions}</p><div className="agent-progress"><span style={{ width: `${run.steps.length ? completed / run.steps.length * 100 : 0}%` }}/></div><div className="progress-caption"><span>{completed} of {run.steps.length || '—'} steps completed</span><span>{busy ? 'Saving the next checkpoint…' : 'Checkpoint saved'}</span></div></div>
              {run.status === 'planning' && <div className="agent-state-note"><span className="pulse-dot"/>{busy ? 'The planner is preparing a bounded plan. No tool changes can run during planning.' : 'Planning is ready to begin. Continue to request the plan.'}</div>}
              {run.status === 'blocked' && <div className="agent-checkpoint"><div className="agent-section-label">A LITTLE MORE DIRECTION</div><h3>{run.clarification}</h3><p>Update the instructions below to answer this question. No tools have run from this plan.</p></div>}
              {run.status === 'failed' && <div className="agent-checkpoint failure"><h3>This step needs another try.</h3><p>{run.error}</p><button className="agent-secondary" disabled={busy} onClick={() => { setAuto(true); void send('retry'); }}><RotateCcw size={14}/>Retry from checkpoint</button></div>}
              {run.status === 'paused' && <div className="agent-state-note"><Pause size={16}/>Paused before the next checkpoint. Resume when you’re ready.</div>}
              <ol className="agent-timeline">{run.steps.map((step, index) => <li key={`${run.id}-${index}`} className={`step-${step.status}`}><span className="step-marker">{step.status === 'completed' ? <Check size={16}/> : index + 1}</span><div className="step-content"><div className="step-heading"><h3>{step.title}</h3><span>{step.status.replaceAll('_', ' ')}</span></div><p>{step.purpose}</p><div className="step-tool">{step.tool.toolName} <span>· {['searchTasks', 'searchKnowledge'].includes(step.tool.toolName) ? 'Read only' : 'Approval required'}</span></div><details><summary>Inspect tool {step.result ? 'result and inputs' : 'inputs'}</summary><pre>{JSON.stringify(step.tool.input, null, 2)}</pre>{step.result && <div className="step-result"><strong>Result · {step.durationMs} ms</strong><p>{step.result}</p>{step.tool.toolName === 'searchKnowledge' && <a href="/knowledge">Inspect the sample sources in Knowledge <ArrowRight size={12}/></a>}</div>}</details></div></li>)}</ol>
              {run.status === 'needs_approval' && proposal && proposal.id === run.proposalId && <div className="agent-checkpoint approval"><div className="agent-section-label"><ShieldCheck size={17}/> YOUR DECISION</div><h3>Review before anything changes.</h3><p>{proposal.action.toolName === 'createTask' ? 'Add one new task to your project board.' : `Update “${target?.title || 'the selected task'}”.`}</p><div className="agent-diff"><div><span>BEFORE</span><pre>{target ? JSON.stringify({ title: target.title, status: target.status, priority: target.priority }, null, 2) : 'No task'}</pre></div><div><span>PROPOSED CHANGE</span><pre>{proposal.action.toolName === 'archiveTask' ? 'Remove this task from the board' : JSON.stringify(proposal.action.input, null, 2)}</pre></div></div><p className="agent-note">Approval applies only to this proposal. It expires after 10 minutes.</p>{proposal.action.toolName === 'archiveTask' && <label className="archive-confirm">Type ARCHIVE to confirm removal<input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off"/></label>}<div className="checkpoint-buttons"><button className="agent-primary" disabled={busy || (proposal.action.toolName === 'archiveTask' && confirmation !== 'ARCHIVE')} onClick={() => { setAuto(true); void send('approve', { proposalId: proposal.id, confirmation }); }}><Check size={15}/>Approve this change</button><button className="agent-secondary" disabled={busy} onClick={() => control('cancel')}>Decline & stop</button></div></div>}
              {terminal(run.status) && <div className="agent-state-note"><Check size={17}/>{run.status === 'completed' ? 'The plan is complete. Review the results above and the updated project board.' : 'The run was cancelled. Earlier approved changes remain; use Board Undo for the latest change.'}</div>}
              {queued && <p className="agent-state-note" role="status">{queued === 'pause' ? 'Pause' : 'Cancellation'} requested. The current request will finish, then no further step will begin.</p>}
              {active && <div className="agent-controls">{run.status === 'paused' ? <button className="agent-primary" disabled={busy} onClick={() => { setAuto(true); void send('resume'); }}><Play size={14}/>Resume run</button> : <button className="agent-secondary" disabled={!['planning', 'running', 'tool_use', 'needs_approval'].includes(run.status) || Boolean(queued)} onClick={() => control('pause')}><Pause size={14}/>Pause</button>}<button className="agent-secondary danger" disabled={Boolean(queued)} onClick={() => control('cancel')}><Square size={13}/>Cancel run</button>{!auto && ['planning', 'running', 'tool_use'].includes(run.status) && <button className="agent-secondary" disabled={busy} onClick={() => { setAuto(true); }}>Continue<ArrowRight size={14}/></button>}<span>Pause and cancel take effect between requests.<br/>Approved changes are kept.</span></div>}
              {active && <details className="revise-instructions"><summary>{run.status === 'blocked' ? 'Answer & revise instructions' : 'Revise instructions'}</summary><form onSubmit={e => { e.preventDefault(); setAuto(true); void send('revise', { instructions: revision }); setRevision(''); }}><label htmlFor="revised-goal">Replace the remaining goal. Pending approval will be discarded.</label><textarea id="revised-goal" value={revision} onChange={e => setRevision(e.target.value)} maxLength={700} minLength={3} required placeholder="Tell the agent what to do next…"/><button className="agent-secondary" disabled={busy || revision.trim().length < 3}>Save & replan<ArrowRight size={14}/></button><p className="agent-note">Completed changes stay on the board. {run.mode === 'demo' && 'Practice mode returns to its fixed launch plan; use AI mode for custom plans.'}</p></form></details>}
            </>}
          </section>
          <section className="agent-card trace-card"><div className="trace-heading"><div><div className="agent-section-label">THE RECORD</div><h2>Activity log <span>{run?.trace.length || 0}</span></h2></div><button onClick={exportTrace} disabled={!run} className="agent-secondary">Export trace</button></div>{run?.trace.length ? <ol>{[...run.trace].reverse().map(event => <li key={event.seq}><Circle size={8}/><div><strong>{event.event.replaceAll('_', ' ')}</strong><p>{event.detail}</p><span>#{event.seq}{event.step !== null ? ` · Step ${event.step + 1}` : ''} · {new Date(event.at).toLocaleTimeString()} · {event.durationMs} ms</span></div></li>)}</ol> : <p className="trace-empty">Plans, tool calls, approvals, and checkpoints will appear here.</p>}<p className="agent-note">Latest 24 events in this browser session. Export before resetting. Summaries describe actions and outcomes, not private model reasoning.</p></section>
        </div>
      </div>
      <footer className="agent-footer"><span><Layers3 size={14}/> Tasklane · Small steps. Clear decisions.</span><div><a href="/guide">How it works</a><button disabled={busy} onClick={() => { if (window.confirm('Reset this demo board and discard its saved run? Export the trace first if needed.')) { setAuto(false); void send('reset', { confirmation: 'RESET' }); } }}>Reset demo</button></div></footer>
    </main>
  </div>;
}
