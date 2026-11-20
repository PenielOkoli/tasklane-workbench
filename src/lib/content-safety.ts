import sanitizeHtml from 'sanitize-html';
import {decodeHTML} from 'entities';

// No model-provided markup is needed by this product. Parsing and removing it is
// separate from React's final text-context escaping; never use this as raw HTML.
export function sanitizeModelText(value:string):string {
 return decodeHTML(sanitizeHtml(value,{allowedTags:[],allowedAttributes:{},disallowedTagsMode:'discard',nonTextTags:['script','style','textarea','option','iframe','object','svg','math','xmp','noscript'],nestingLimit:20})).trim();
}
export function sanitizeModelValue<T>(value:T):T {
 if(typeof value==='string')return sanitizeModelText(value) as T;
 if(Array.isArray(value))return value.map(item=>sanitizeModelValue(item)) as T;
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sanitizeModelValue(item)])) as T;
 return value;
}
