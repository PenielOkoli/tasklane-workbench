// Safe to ship: inert, controlled demonstration strings, never executed as HTML.
export const attackSamples = [
 {id:'script',label:'Script + event handler',text:'Launch checks are ready.<script>window.__tasklaneAttack=1</script><img src=x onerror="window.__tasklaneAttack=1">'},
 {id:'link',label:'Unsafe link + embedded frame',text:'<a href="javascript:alert(1)">Review the checklist</a><iframe src="https://attacker.invalid">Hidden content</iframe>'},
 {id:'svg',label:'SVG + styling payload',text:'<svg onload="alert(1)"><a href="javascript:alert(1)">bad</a></svg><style>body{display:none}</style><b>Keep the approval step.</b>'},
 {id:'encoded',label:'Encoded markup',text:'&lt;img src=x onerror=alert(1)&gt; Safe text remains.'},
] as const;
