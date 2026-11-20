import {createHmac} from 'node:crypto';
import {ActionError} from './engine';
import {injectionWarning} from './trust';
export class GuardError extends ActionError { constructor(status:number,message:string,public code:string,public retryAfter=0){super(status,message);} }
type Bucket={used:number;expires:number};
export class WindowLimiter {
 private buckets=new Map<string,Bucket>();
 constructor(private capacity=4000){}
 take(key:string,limit:number,windowMs:number,now=Date.now()){
  for(const [id,b] of this.buckets)if(b.expires<=now)this.buckets.delete(id);
  let bucket=this.buckets.get(key);
  if(!bucket){if(this.buckets.size>=this.capacity)throw new GuardError(503,'Protection is busy. Wait a minute before retrying.','guard_capacity',60);bucket={used:0,expires:now+windowMs};this.buckets.set(key,bucket);}
  const retry=Math.max(1,Math.ceil((bucket.expires-now)/1000));
  if(bucket.used>=limit)throw new GuardError(429,`Request allowance reached. Retry in ${retry} seconds.`,'rate_limited',retry);
  bucket.used++;return {remaining:limit-bucket.used,resetAt:bucket.expires};
 }
}
const limiter=new WindowLimiter();
export function clientKey(request:Request){
 const secret=process.env.SESSION_SECRET;
 if(!secret||secret.length<32)throw new GuardError(503,'The server protection key is not configured.','not_configured');
 // On Vercel this header is set by its trusted edge. Other hosting shares a
 // conservative local bucket instead of trusting caller-controlled IP headers.
 const address=process.env.VERCEL==='1'?(request.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim():'local';
 return createHmac('sha256',secret).update(address).digest('hex').slice(0,32);
}
export function assertTrustedInput(text:string){const warning=injectionWarning(text);if(warning)throw new GuardError(422,warning,'untrusted_instruction');}
export function chargeAI(request:Request){const key=clientKey(request);limiter.take(`ai-minute:${key}`,12,60000);limiter.take(`ai-day:${key}`,60,86400000);limiter.take('ai-process-minute',60,60000);}
export function probeAllowance(request:Request){return limiter.take(`probe:${clientKey(request)}`,5,60000);}
export async function guarded(request:Request,handler:(request:Request)=>Response|Promise<Response>){
 try{
  const key=clientKey(request),path=new URL(request.url).pathname;
  limiter.take(`all:${key}`,180,60000);
  limiter.take(`${request.method}:${path}:${key}`,request.method==='GET'?60:30,60000);
  if(request.method!=='GET'&&request.headers.get('origin')!==new URL(request.url).origin)throw new GuardError(403,'Only same-origin workspace requests are allowed.','origin_rejected');
  const response=await handler(request);
  response.headers.set('Cache-Control','private, no-store');response.headers.set('X-Content-Type-Options','nosniff');
  if(response.status===429&&!response.headers.has('Retry-After'))response.headers.set('Retry-After','60');
  return response;
 }catch(error){return guardFailure(error);}
}
export function guardFailure(error:unknown){const known=error instanceof ActionError,detail=error instanceof GuardError?error:null;return Response.json({error:known?error.message:'The protected request could not complete.',code:detail?.code||'request_failed',...(detail?.retryAfter?{retryAfter:detail.retryAfter}:{})},{status:known?error.status:500,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...(detail?.retryAfter?{'Retry-After':String(detail.retryAfter)}:{})}});}
