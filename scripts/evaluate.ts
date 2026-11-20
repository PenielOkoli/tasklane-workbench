import {writeFileSync} from 'node:fs';
import {goldenTasks,grade,passed,suiteVersion,releaseGate,type Run,type Variant} from '../src/lib/evaluation';
async function main(){
const origin=process.argv[2]||'http://localhost:3029';
const consent=process.argv.includes('--ai');
const run:Run={id:crypto.randomUUID(),suite:suiteVersion,origin,consent,startedAt:new Date().toISOString(),rows:[],complete:false};
const init=await fetch(origin+'/api/knowledge');
if(!init.ok)throw new Error(`Workspace initialization failed: ${init.status}`);
const cookie=init.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
for(const task of goldenTasks)for(const variant of ['baseline','candidate'] as Variant[]){const start=Date.now();try{const res=await fetch(origin+'/api/knowledge',{method:'POST',headers:{origin,cookie,'Content-Type':'application/json'},body:JSON.stringify({question:task.question,sources:task.sources,consent,variant}),signal:AbortSignal.timeout(55000)});const response=await res.json();run.rows.push({taskId:task.id,variant,at:new Date().toISOString(),latencyMs:Date.now()-start,response,checks:grade(task,response,consent),...(!res.ok?{error:response.error||`HTTP ${res.status}`}:{})});}catch(error){run.rows.push({taskId:task.id,variant,at:new Date().toISOString(),latencyMs:Date.now()-start,response:null,checks:[],error:String(error)});}console.log(`${task.id} ${variant}: ${passed(run.rows.at(-1)!)?'PASS':'FAIL'}`);}
run.complete=true;
const output=process.argv.find(v=>v.startsWith('--output='))?.slice(9)||'docs/modules/10/evaluation-results.json';
writeFileSync(output,JSON.stringify({run,releaseGate:releaseGate(run,[])},null,2)+'\n');
console.log(JSON.stringify({output,baseline:run.rows.filter(r=>r.variant==='baseline'&&passed(r)).length,candidate:run.rows.filter(r=>r.variant==='candidate'&&passed(r)).length,gate:'HOLD until AI and human review requirements pass'}));

}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
