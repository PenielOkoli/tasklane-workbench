export const evidenceKeys=['tasklane-eval-runs','tasklane-eval-reviews','tasklane-feedback'] as const;
export const retentionKey='tasklane-retain-evidence';
export const retentionMs=7*86400000;
export function persistentEvidence(){return typeof window!=='undefined'&&localStorage.getItem(retentionKey)==='yes';}
export function readEvidence<T>(key:typeof evidenceKeys[number]):T[]{
 if(typeof window==='undefined')return [];
 const storage=persistentEvidence()?localStorage:sessionStorage;
 try{const value=JSON.parse(storage.getItem(key)||'null');if(!value)return [];if(typeof value.expiresAt!=='number'||value.expiresAt<=Date.now()||!Array.isArray(value.data)){storage.removeItem(key);return [];}return value.data;}catch{storage.removeItem(key);return [];}
}
export function writeEvidence(key:typeof evidenceKeys[number],data:unknown[]){
 const storage=persistentEvidence()?localStorage:sessionStorage;
 const other=persistentEvidence()?sessionStorage:localStorage;
 storage.setItem(key,JSON.stringify({expiresAt:Date.now()+retentionMs,data}));other.removeItem(key);
}
export function chooseRetention(enabled:boolean){
 const saved=evidenceKeys.map(key=>[key,readEvidence<unknown>(key)] as const);
 localStorage.setItem(retentionKey,enabled?'yes':'no');
 for(const [key,data] of saved)writeEvidence(key,data);
}
export function eraseEvidence(){for(const key of evidenceKeys){localStorage.removeItem(key);sessionStorage.removeItem(key);}localStorage.removeItem(retentionKey);}
