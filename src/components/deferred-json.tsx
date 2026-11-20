'use client';
import {useMemo,useState} from 'react';
export function DeferredJson({value,label}:{value:unknown;label:string}){const [open,setOpen]=useState(false);const text=useMemo(()=>open?JSON.stringify(value,null,2):'', [open,value]);return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary>{label}</summary>{open&&<pre data-response-json>{text}</pre>}</details>;}
