export type Feedback={id:string;question:string;rating:string;note:string;at:string;status:string;response?:unknown};
export const reviewPageSize=10;
export function historyPage<T>(items:readonly T[],requested:number){const pages=Math.max(1,Math.ceil(items.length/reviewPageSize));const page=Math.max(0,Math.min(pages-1,Number.isFinite(requested)?Math.floor(requested):0));return {page,pages,items:items.slice(page*reviewPageSize,(page+1)*reviewPageSize),start:items.length?page*reviewPageSize+1:0,end:Math.min((page+1)*reviewPageSize,items.length)};}
export function updateReviewStatus(items:Feedback[],id:string,status:string){if(!['New','Reviewed','Add to golden tasks'].includes(status))return items;return items.map(item=>item.id===id?{...item,status}:item);}

export type ReviewFilter = 'all' | 'reviewed' | 'needs-review';
export function filterReviewHistory(items: readonly Feedback[], filter: ReviewFilter) {
 return items.filter(item => filter === 'all' || (filter === 'reviewed' ? item.status === 'Reviewed' : item.status !== 'Reviewed'));
}
