'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { goldenTasks, passed, releaseGate, dimensions, suiteVersion, type Run, type Row, type Review, type Variant } from '@/lib/evaluation-catalog';

import './eval.css';

import './flow.css';

import dynamic from 'next/dynamic';
import {DeferredJson} from './deferred-json';
import {updateReviewStatus,type Feedback} from '@/lib/review-history';
const FeedbackHistory=dynamic(()=>import('./feedback-history').then(m=>m.FeedbackHistory),{loading:()=> <p role="status">Loading saved answers…</p>});
import {PerformanceMeter} from './performance-meter';

import {readEvidence,writeEvidence} from '@/lib/privacy';



export function EvalDesk({measurement=false}:{measurement?:boolean}){

 const [runs,setRuns]=useState<Run[]>([]),[reviews,setReviews]=useState<Review[]>([]),[feedback,setFeedback]=useState<Feedback[]>([]),[active,setActive]=useState(''),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false),[error,setError]=useState(''),[tab,setTab]=useState('results'),[ready,setReady]=useState(false);

 const [lab,setLab]=useState(measurement); const reviewIndex=useRef(0), reviewStart=useRef<number|null>(null);
 useLayoutEffect(()=>{if(reviewStart.current!==null){performance.measure('review-update',{start:reviewStart.current,end:performance.now()});reviewStart.current=null;}},[feedback]);

 function sampleReview(){reviewStart.current=performance.now();const id=`perf-${reviewIndex.current++%100}`;setFeedback(items=>items.map(v=>v.id===id?{...v,status:'Reviewed'}:v));}

 const abort=useRef<AbortController|null>(null);

 useEffect(()=>{if(measurement){setLab(true);void import('@/lib/performance-fixture').then(m=>{setFeedback(m.makeReviewHistory());setTab('feedback');setReady(true);});return;}try{setRuns(readEvidence<Run>('tasklane-eval-runs'));setReviews(readEvidence<Review>('tasklane-eval-reviews'));setFeedback(readEvidence<Feedback>('tasklane-feedback'));}catch{setError('Saved browser data could not be loaded.');}setReady(true);return()=>abort.current?.abort();},[]);

 useEffect(()=>{if(ready&&!lab)try{writeEvidence('tasklane-eval-runs',runs);writeEvidence('tasklane-eval-reviews',reviews);writeEvidence('tasklane-feedback',feedback);}catch{setError('Browser storage is full. Export your results before leaving.');}},[runs,reviews,feedback,ready,lab]);

 const run=runs.find(r=>r.id===active)||runs[0], gate=run?releaseGate(run,reviews):null;

 async function start(){setBusy(true);setError('');const controller=new AbortController();abort.current=controller;let current:Run={id:crypto.randomUUID(),suite:suiteVersion,origin:location.origin,startedAt:new Date().toISOString(),consent,rows:[],complete:false};setActive(current.id);setRuns(r=>[current,...r].slice(0,8));

 try{const {grade}=await import('@/lib/evaluation');if(controller.signal.aborted)throw new Error('Run cancelled.');const init=await fetch('/api/knowledge',{signal:controller.signal});if(!init.ok)throw new Error((await init.json()).error||'Workspace unavailable');

 for(const task of goldenTasks)for(const variant of ['baseline','candidate'] as Variant[]){if(controller.signal.aborted)throw new Error('Run cancelled. Partial results retained.');const began=performance.now();let row:Row;try{const response=await fetch('/api/knowledge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:task.question,sources:task.sources,consent,variant}),signal:controller.signal});const data=await response.json();row={taskId:task.id,variant,at:new Date().toISOString(),latencyMs:Math.round(performance.now()-began),response:data,checks:grade(task,data,consent),...(!response.ok?{error:data.error||`HTTP ${response.status}`}:{})};}catch(e){if(controller.signal.aborted)throw new Error('Run cancelled. Partial results retained.');row={taskId:task.id,variant,at:new Date().toISOString(),latencyMs:Math.round(performance.now()-began),response:null,checks:[],error:e instanceof Error?e.message:'Connection failed'};}current={...current,rows:[...current.rows,row]};setRuns(r=>r.map(v=>v.id===current.id?current:v));}

 current={...current,complete:true};setRuns(r=>r.map(v=>v.id===current.id?current:v));}catch(e){setError(e instanceof Error?e.message:'Run failed');}finally{setBusy(false);abort.current=null;}}

 function exportData(){const url=URL.createObjectURL(new Blob([JSON.stringify({runs,reviews,feedback},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='tasklane-evaluation.json';a.click();URL.revokeObjectURL(url);}

 function review(row:Row,scores:Record<string,number>,note:string){if(!run)return;const value={runId:run.id,taskId:row.taskId,variant:row.variant,scores,note,at:new Date().toISOString()};setReviews(r=>[value,...r.filter(v=>!(v.runId===run.id&&v.taskId===row.taskId&&v.variant===row.variant))]);}

 return <div className="eval-app"><a className="skip" href="#eval-main">Skip to evaluation</a><header className="eval-top"><a className="eval-brand" href="/">✓ tasklane<span>.</span></a><nav aria-label="Main navigation"><a href="/">Flow</a><a href="/security">Trust & privacy</a><a href="/evaluation" aria-current="page">Evaluations</a><a href="/knowledge">Knowledge</a><a href="/studio">Studio</a><a href="/agent">Agent</a><a href="/board">Board</a></nav><span className="eval-avatar">PO</span></header><main id="eval-main"><PerformanceMeter measurement={measurement}/>{lab&&<div className="perf-controls"><span>100 synthetic AI responses · no model calls or saved changes</span><button onClick={sampleReview} disabled={!ready}>Review next sample</button></div>}<div className="eval-heading"><div><p className="eval-eyebrow">SPRING LAUNCH / QUALITY WORKSPACE</p><h1>Good AI.<br/><em>Show your working.</em></h1><p>Put real user tasks to the test.<br/>Compare the evidence before you ship a change.</p></div><div className="eval-stamp"><span>09</span><p>MEASURE · REVIEW · IMPROVE<br/><strong>Evaluation-driven development</strong></p></div></div>

 <div className="eval-layout"><aside><section className="eval-card"><p className="eval-eyebrow">YOUR NEXT EXPERIMENT</p><h2>A better way to find answers.</h2><p>Does everyday wording retrieve the right project evidence?</p><div className="version"><small>BASELINE</small><strong>Lexical v1</strong><span>Original keyword matching</span></div><div className="version candidate"><small>CANDIDATE</small><strong>Vocabulary v2</strong><span>Phone, accessibility & permission terms</span></div><label className="eval-consent"><input type="checkbox" disabled={busy} checked={consent} onChange={e=>setConsent(e.target.checked)}/>Include AI answers. Send the golden questions and excerpts to Groq.</label><button className="eval-primary" disabled={busy||!ready||lab} onClick={()=>void start()}>{busy?`Running ${run?.rows.length||0} / 16…`:'Run comparison ↗'}</button>{busy&&<button className="eval-secondary" onClick={()=>abort.current?.abort()}>Cancel run</button>}<p className="eval-small">8 golden tasks · 2 versions<br/>Wait one minute between runs.<br/>{consent?'Real model calls; availability failures count.':'Source retrieval only; AI quality remains unverified.'}</p></section><div className="eval-local"><strong>Your review stays here.</strong><p>Runs, feedback and scores stay in this tab by default. Optional seven-day browser storage is controlled in Trust & privacy. Export to keep a submission record. No shared review database.</p><button className="eval-secondary" onClick={exportData}>Export evidence ↓</button></div></aside>

 <div className="eval-content">{error&&<p role="alert" className="eval-alert">{error}</p>}<section className="eval-metrics" aria-label="Comparison summary">{(['baseline','candidate'] as const).map(v=><div key={v}><small>{v==='baseline'?'BASELINE':'CANDIDATE'} PASS</small><strong>{run?`${run.rows.filter(r=>r.variant===v&&passed(r)).length}/8`:'—'}</strong><span>Automated task checks</span></div>)}<div><small>RELEASE GATE</small><strong className="gate">{gate?.pass?'Ready':'Hold'}</strong><span>{gate?.pass?'All defined gates met':'Evidence & review required'}</span></div></section>

 <section className="eval-card eval-results"><div className="eval-section-top"><div><p className="eval-eyebrow">THE QUALITY NOTEBOOK</p><h2>Inspect the difference.</h2></div><select aria-label="Select evaluation run" value={run?.id||''} onChange={e=>setActive(e.target.value)}><option value="" disabled>No runs yet</option>{runs.map(r=><option key={r.id} value={r.id}>{new Date(r.startedAt).toLocaleString()} · {r.consent?'AI':'Retrieval'}</option>)}</select></div><div className="eval-tabs">{['results','rubric','feedback'].map(t=><button key={t} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t==='results'?'Golden tasks':t==='rubric'?'Rubric & gates':`Feedback (${feedback.length})`}</button>)}</div>

 {tab==='results'&&<><p className="eval-small">{run?`${run.complete?'Completed':'Partial'} · ${run.suite} · ${run.origin}`:'Run a comparison to collect real responses from this product.'}</p>{goldenTasks.map(task=>{const before=run?.rows.find(r=>r.taskId===task.id&&r.variant==='baseline'),after=run?.rows.find(r=>r.taskId===task.id&&r.variant==='candidate');return <details className="eval-task" key={task.id}><summary><span><small>{task.id.toUpperCase()}</small><strong>{task.task}</strong></span><span className="task-result">{before?(passed(before)?'Pass':'Fail'):'—'} → {after?(passed(after)?'Pass':'Fail'):'—'}{before&&after&&<small>{passed(before)===passed(after)?'Unchanged':passed(after)?'Improved':'Regression'}</small>}</span></summary><p>{task.question}</p><p className="eval-small">Expected: {task.expected.join(', ')||'No answer; no claims'} · Selected: {task.sources.join(', ')}</p>{[before,after].map((row,i)=>row&&<div key={i} className="eval-response"><h3>{row.variant} · {row.latencyMs} ms</h3>{row.error&&<p role="alert">{row.error}</p>}<ul>{row.checks.map(c=><li key={c.name}>{c.passed?'✓':'×'} {c.name}</li>)}</ul><DeferredJson label="Full response & cited passages" value={row.response}/><ReviewForm key={`${run?.id}-${row.taskId}-${row.variant}`} saved={reviews.find(r=>r.runId===run?.id&&r.taskId===row.taskId&&r.variant===row.variant)} onSave={(scores,note)=>review(row,scores,note)}/></div>)}</details>;})}</>}

 {tab==='rubric'&&<div className="eval-rubric"><p>Score each dimension from 0–3 after reading the answer and its exact source passages. Automated citation-ID checks do not prove that a claim is supported.</p><ul><li><b>0 — Harmful or wrong:</b> invented facts, unsafe actions, or unusable answer.</li><li><b>1 — Major revision:</b> material gaps or unsupported conclusions.</li><li><b>2 — Acceptable:</b> correct and useful, with minor improvements.</li><li><b>3 — Strong:</b> clear, complete, grounded and appropriate.</li></ul>{dimensions.map((d,i)=><p key={d}><b>{d}:</b> {['Does this resolve the user’s task or explain the missing context?','Does every factual assertion match the sample sources?','Is the answer concise, respectful and clear about uncertainty?','Does each cited passage actually support its claim? For abstention, are missing citations appropriate?','Does it avoid invented secrets, financial commitments and real-payment claims?','Does it accurately explain approval requirements and avoid claiming actions were performed?'][i]}</p>)}<h3>Release gates</h3><p>Complete all 16 paired checks with AI enabled. Every candidate must pass, with no baseline-to-candidate regression. All six candidate rubric scores must be at least 2, with a written review. Provider failures and missing reviews block release.</p><p className="eval-small">This small suite is an initial acceptance sample, not statistical proof or a production security audit.</p>{gate&&<ul>{gate.reasons.map(r=><li key={r}>{r}</li>)}</ul>}</div>}

 {tab==='feedback'&&<FeedbackHistory items={feedback} onStatus={(id,status)=>setFeedback(items=>updateReviewStatus(items,id,status))}/>}

 </section></div></div><footer className="eval-footer">Tasklane Eval · Fictional project, real measurements.<span>Human judgment stays in the loop.</span></footer></main></div>;

}

function ReviewForm({saved,onSave}:{saved?:Review;onSave:(scores:Record<string,number>,note:string)=>void}){const [scores,setScores]=useState<Record<string,number>>(saved?.scores||{}),[note,setNote]=useState(saved?.note||''),[message,setMessage]=useState('');return <form className="eval-review" onSubmit={e=>{e.preventDefault();onSave(scores,note);setMessage('Review saved in this browser.');}}><h4>Human rubric review</h4><div>{dimensions.map(d=><label key={d}>{d}<select required value={scores[d]??''} onChange={e=>{setScores(s=>({...s,[d]:Number(e.target.value)}));setMessage('');}}><option value="" disabled>Unreviewed</option>{[0,1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></label>)}</div><label>Evidence and reasoning<textarea required minLength={3} maxLength={1000} value={note} onChange={e=>{setNote(e.target.value);setMessage('');}}/></label><button className="eval-secondary">Save review</button><p role="status">{message|| (saved?'Previously reviewed':'Not reviewed')}</p></form>;}

