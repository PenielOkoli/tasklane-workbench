import { EvalDesk } from '@/components/eval-desk';
export default async function Page({searchParams}:{searchParams:Promise<{perf?:string}>}){const query=await searchParams;return <EvalDesk measurement={query.perf!==undefined}/>;}
