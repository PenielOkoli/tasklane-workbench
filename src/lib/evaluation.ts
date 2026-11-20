import { z } from 'zod';
import type {Golden, Check} from './evaluation-catalog';
export * from './evaluation-catalog';
const claim = z.object({text:z.string().min(1),citations:z.array(z.string()).min(1)});
export const answerSchema = z.object({status:z.enum(['answered','limited','no_result','unavailable']),mode:z.enum(['ai','retrieval']),claims:z.array(claim),evidence:z.array(z.object({id:z.string(),sourceId:z.string(),heading:z.string(),text:z.string(),title:z.string(),coverage:z.number()})),limitation:z.string(),confidence:z.enum(['moderate','low','none']),steps:z.array(z.string()),evaluation:z.object({variant:z.enum(['baseline','candidate']),retrievalVersion:z.string(),promptVersion:z.string(),model:z.string()})});
export type EvalAnswer = z.infer<typeof answerSchema>;
export function grade(task:Golden, response:unknown, consent:boolean):Check[] {
 const parsed=answerSchema.safeParse(response); if(!parsed.success)return [{name:'Structured response',passed:false}];
 const a=parsed.data;
 return [
  {name:'Structured response',passed:true},
  {name:'Provider available',passed:a.status!=='unavailable'},
  {name:'Source boundary',passed:a.evidence.every(e=>(task.sources as readonly string[]).includes(e.sourceId))},
  {name:'Expected evidence / abstention',passed:task.kind==='abstain'?a.status==='no_result'&&a.claims.length===0:task.expected.every(id=>a.evidence.some(e=>e.id===id))&&a.evidence.some(e=>e.coverage>=.5)},
  {name:'Citation IDs',passed:a.claims.every(c=>c.citations.every(id=>a.evidence.some(e=>e.id===id)))},
  {name:'Consent and answer state',passed:consent?(task.kind==='abstain'?a.claims.length===0:a.status==='answered'&&a.mode==='ai'&&a.claims.length>0):a.mode==='retrieval'&&a.claims.length===0},
 ];
}
