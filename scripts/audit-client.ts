import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const files:string[]=[];
function walk(dir:string){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(js|html|json|map)$/.test(p))files.push(p);}}
walk('.next/static');
const forbidden=['GROQ_API_KEY','SESSION_SECRET','TASKLANE_PRIVATE_BUILD_CANARY'];
const hits=files.flatMap(path=>{const text=readFileSync(path,'utf8');return forbidden.filter(s=>text.includes(s)).map(marker=>({path,marker}));});
const result={at:new Date().toISOString(),filesScanned:files.length,forbiddenMarkers:forbidden,passed:hits.length===0,hits};
writeFileSync('docs/modules/10/client-bundle-audit.json',JSON.stringify(result,null,2)+'\n');console.log(result);if(hits.length)process.exitCode=1;
