// Shared final sink: model text is always a React text node, never executable HTML.
export function ModelText({text}:{text:string}){return <span className="model-text">{text}</span>;}
