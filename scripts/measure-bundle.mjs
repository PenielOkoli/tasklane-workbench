import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
const label=process.argv[2];if(!/^(baseline|lazy-grader|candidate)$/.test(label))throw Error('Use baseline, lazy-grader or candidate');
const html=await (await fetch('http://localhost:3011/evaluation')).text();
const scripts=[...new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]))];
const files=scripts.map(url=>{const content=readFileSync('.next/'+url.replace('/_next/',''));return {url,bytes:content.length,gzipBytes:gzipSync(content).length};});
const styles=[...new Set([...html.matchAll(/<link[^>]+href="([^\"]+\.css)"/g)].map(m=>m[1]))].map(url=>({url,bytes:statSync('.next/'+url.replace('/_next/','')).size}));
const result={label,at:new Date().toISOString(),route:'/evaluation',node:process.version,method:'Scripts referenced in production route HTML; raw and gzip level-default bytes. Includes framework runtime. Excludes on-demand chunks. Not a network timing.',files,totalBytes:files.reduce((n,f)=>n+f.bytes,0),totalGzipBytes:files.reduce((n,f)=>n+f.gzipBytes,0),styles};
writeFileSync(`docs/modules/11/bundle-${label}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({label,totalBytes:result.totalBytes,totalGzipBytes:result.totalGzipBytes}));
