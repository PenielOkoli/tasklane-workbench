import {z} from 'zod';
import {guarded,guardFailure,probeAllowance} from '@/lib/guard';
import {readJSON} from '@/lib/http';
import {ActionError} from '@/lib/engine';
import {sanitizeModelValue} from '@/lib/content-safety';
import {generatedSchema} from '@/lib/knowledge';
import {sessionFromRequest} from '@/lib/session';
export const runtime='nodejs';
const schema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('sanitize'),text:z.string().min(1).max(700)}).strict(),
 z.object({operation:z.literal('probe')}).strict(),
 z.object({operation:z.literal('erase'),confirmation:z.literal('ERASE')}).strict(),
]);
export const GET=(request:Request)=>guarded(request,()=>Response.json({aiConfigured:Boolean(process.env.GROQ_API_KEY),controls:{requestsPerRouteMinute:30,readsPerRouteMinute:60,aiRequestsPerMinute:12,aiRequestsPerDay:60,probePerMinute:5,scope:'Per trusted client address, per running server process. Counters are not shared across instances and reset on restart.'},retention:{sessionHours:24,evidenceDays:7,default:'Tab session; optional browser persistence'}}));
export const POST=(request:Request)=>guarded(request,async()=>{
 try{
  const input=schema.safeParse(await readJSON(request));if(!input.success)throw new ActionError(400,'Invalid security request.');
  if(input.data.operation==='erase'){
   const headers=new Headers({'Cache-Control':'private, no-store'});
   for(const name of ['tasklane_session','tasklane_agent_run','tasklane_studio_review'])headers.append('Set-Cookie',`${name}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${process.env.NODE_ENV==='production'?'; Secure':''}`);
   return Response.json({erased:true,message:'This browser’s server workspace cookies were cleared. Saved exports and provider/platform logs are not affected.'},{headers});
  }
  if(!sessionFromRequest(request))throw new ActionError(401,'Open the workspace before running a demonstration.');
  if(input.data.operation==='probe')return Response.json({accepted:true,...probeAllowance(request)});
  // Same schema and sanitizer used by real Knowledge model output. A fixture,
  // explicitly not a model call, makes adversarial markup repeatable.
  const before=generatedSchema.parse({sufficient:true,claims:[{text:input.data.text,citations:['quality-2']}],limitation:'Controlled hostile-response fixture; no model call.'});
  const sanitized=sanitizeModelValue(before);
  const after=generatedSchema.safeParse(sanitized);
  return Response.json({fixture:true,input:before,output:after.success?after.data:null,blocked:!after.success,changed:JSON.stringify(before)!==JSON.stringify(sanitized),message:after.success?'Markup removed, then rendered as text.':'The sanitized response is empty or invalid and was blocked.'});
 }catch(error){return guardFailure(error);}
});
