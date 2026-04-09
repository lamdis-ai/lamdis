import{j as t}from"./jsx-runtime-EKYJJIwR.js";import{B as S}from"./Badge-BywQeeGN.js";function N({logs:a,limit:c=50}){if(!Array.isArray(a)||a.length===0)return t.jsx("div",{className:"text-slate-600 text-xs",children:"No logs yet."});const b=c>0?a.slice(-c):a,k=e=>{var n;return e&&((n=String(e).split("T")[1])==null?void 0:n.slice(0,8))||""},w=e=>{const r=String(e||"").toLowerCase();return r==="error"?"danger":r==="judge_check"?"info":r==="assistant_reply"?"success":r==="user_message"?"neutral":r==="env"||r==="persona"||r==="plan"?"warning":"neutral"};return t.jsx("div",{className:"text-xs text-slate-400 space-y-1 max-h-56 overflow-auto pr-1",children:b.map((e,r)=>{var n,m,u;return t.jsxs("div",{className:"flex items-start gap-2",children:[t.jsx("span",{className:"text-slate-600 shrink-0 w-12",children:k(e.t)}),t.jsx("div",{className:"shrink-0",children:t.jsx(S,{variant:w(e.type),children:String(e.type||"").toUpperCase()})}),t.jsxs("div",{className:"text-slate-300 whitespace-pre-wrap break-words",children:[e.subtype?t.jsxs("span",{className:"text-slate-400 mr-1",children:["[",String(e.subtype),"]"]}):null,e.content?t.jsx("span",{children:String(e.content)}):null,(n=e.details)!=null&&n.misses&&Array.isArray(e.details.misses)&&e.details.misses.length>0?t.jsxs("span",{className:"ml-2 text-slate-400",children:["misses: ",e.details.misses.join(", ")]}):null,typeof((m=e.details)==null?void 0:m.score)=="number"?t.jsxs("span",{className:"ml-2 text-slate-400",children:["score: ",(()=>{const s=Number(e.details.score);return isFinite(s)?(s<=1?s:s<=10?s/10:s/100).toFixed(2):"—"})()]}):null,((u=e.details)==null?void 0:u.threshold)!=null?t.jsxs("span",{className:"ml-2 text-slate-500",children:["threshold: ",(()=>{const s=Number(e.details.threshold);return isFinite(s)?(s<=1?s:s<=10?s/10:s/100).toFixed(2):"—"})()]}):null]})]},r)})})}N.__docgenInfo={description:"",methods:[],displayName:"LogList",props:{logs:{required:!0,tsType:{name:"Array",elements:[{name:"signature",type:"object",raw:`{\r
  t?: string;\r
  type?: string;\r
  subtype?: string;\r
  content?: string;\r
  details?: any;\r
  [k: string]: any;\r
}`,signature:{properties:[{key:"t",value:{name:"string",required:!1}},{key:"type",value:{name:"string",required:!1}},{key:"subtype",value:{name:"string",required:!1}},{key:"content",value:{name:"string",required:!1}},{key:"details",value:{name:"any",required:!1}},{key:{name:"string"},value:{name:"any",required:!0}}]}}],raw:"LogEntry[]"},description:""},limit:{required:!1,tsType:{name:"number"},description:"",defaultValue:{value:"50",computed:!1}}}};const A={title:"Base/LogList",component:N,tags:["autodocs"]},L=[{t:"2025-01-15T10:00:00Z",type:"env",content:"Environment initialized"},{t:"2025-01-15T10:00:01Z",type:"persona",content:"Persona loaded: support-agent-v2"},{t:"2025-01-15T10:00:02Z",type:"user_message",content:"I need to reset my password"},{t:"2025-01-15T10:00:04Z",type:"assistant_reply",content:"I can help you with that. Could you verify your email?"},{t:"2025-01-15T10:00:05Z",type:"judge_check",subtype:"rubric",content:"Identity verification: PASS",details:{score:.95}},{t:"2025-01-15T10:00:06Z",type:"error",content:"Timeout waiting for response",details:{timeout:3e4}}],i={args:{logs:L}},o={args:{logs:L,limit:3}},l={args:{logs:[]}};var d,p,g;i.parameters={...i.parameters,docs:{...(d=i.parameters)==null?void 0:d.docs,source:{originalSource:`{
  args: {
    logs: sampleLogs
  }
}`,...(g=(p=i.parameters)==null?void 0:p.docs)==null?void 0:g.source}}};var y,h,f;o.parameters={...o.parameters,docs:{...(y=o.parameters)==null?void 0:y.docs,source:{originalSource:`{
  args: {
    logs: sampleLogs,
    limit: 3
  }
}`,...(f=(h=o.parameters)==null?void 0:h.docs)==null?void 0:f.source}}};var x,v,j;l.parameters={...l.parameters,docs:{...(x=l.parameters)==null?void 0:x.docs,source:{originalSource:`{
  args: {
    logs: []
  }
}`,...(j=(v=l.parameters)==null?void 0:v.docs)==null?void 0:j.source}}};const E=["Default","Limited","Empty"];export{i as Default,l as Empty,o as Limited,E as __namedExportsOrder,A as default};
