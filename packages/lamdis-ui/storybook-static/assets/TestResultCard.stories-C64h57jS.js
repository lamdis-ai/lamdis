import{j as e}from"./jsx-runtime-EKYJJIwR.js";import{r as C}from"./index-JhL3uwfD.js";import{B as I}from"./Badge-BywQeeGN.js";function b(s){if(s<1e3)return`${Math.round(s)}ms`;const u=s/1e3;if(u<60)return`${u.toFixed(1)}s`;const l=Math.floor(u/60),c=Math.round(u%60);return`${l}m ${c}s`}function y({title:s,defaultOpen:u=!1,badge:l,children:c}){const[g,n]=C.useState(u);return e.jsxs("div",{className:"border-b border-slate-800 last:border-b-0",children:[e.jsxs("button",{type:"button",className:"w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-800/30 transition-colors",onClick:()=>n(!g),children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("svg",{className:`w-3 h-3 text-slate-500 transition-transform ${g?"rotate-90":""}`,fill:"none",viewBox:"0 0 24 24",stroke:"currentColor",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M9 5l7 7-7 7"})}),e.jsx("span",{className:"text-xs text-slate-300",children:s})]}),l]}),g&&e.jsx("div",{className:"px-3 pb-3",children:c})]})}function D({check:s,index:u}){const[l,c]=C.useState(!1),g=String(s.subtype||s.type||"judge_check"),n=s.pass===!0,t=s.pass===!1,a=s.details||{},i=typeof a.score=="number"?a.score:void 0,x=typeof a.threshold=="number"?a.threshold:void 0,o=typeof a.reasoning=="string"?a.reasoning:"",h=typeof a.rubric=="string"?a.rubric:"",v=typeof a.stepName=="string"?a.stepName:"",p=!!a.error||o&&o.toLowerCase().includes("judge_error"),N=a.error&&typeof a.error=="object"&&"message"in a.error?String(a.error.message):typeof a.error=="string"?a.error:o,j=p?String(N||"").replace(/^judge_error:\s*/i,"").slice(0,300):"",r=p?"ERROR":t?"FAIL":n?"PASS":"UNKNOWN",d=p||t?"danger":n?"success":"info",m=v||g.replace(/_/g," ").replace(/check/gi,"").trim().toUpperCase()||"CHECK";return e.jsxs("div",{className:"border border-slate-700/60 rounded-md bg-slate-900/50 overflow-hidden",children:[e.jsxs("button",{type:"button",className:"w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-800/30 transition-colors",onClick:()=>c(!l),children:[e.jsxs("div",{className:"flex items-center gap-2 min-w-0 flex-1",children:[e.jsx("svg",{className:`w-3 h-3 text-slate-500 transition-transform flex-shrink-0 ${l?"rotate-90":""}`,fill:"none",viewBox:"0 0 24 24",stroke:"currentColor",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M9 5l7 7-7 7"})}),e.jsx("span",{className:`text-[11px] text-slate-300 truncate ${v?"":"font-mono text-slate-400"}`,title:m,children:m})]}),e.jsxs("div",{className:"flex items-center gap-2 flex-shrink-0",children:[i!=null&&e.jsxs("span",{className:"text-[10px] text-slate-400",children:[e.jsx("span",{className:"font-mono",children:i.toFixed(2)}),x!=null&&e.jsxs("span",{className:"text-slate-500",children:[" / ",x]})]}),e.jsx(I,{variant:d,className:"text-[10px]",children:r})]})]}),l&&e.jsxs("div",{className:"px-3 pb-3 space-y-2 border-t border-slate-700/40",children:[h&&e.jsxs("div",{className:"pt-2",children:[e.jsx("div",{className:"text-[10px] text-slate-500 mb-1",children:"Checking for"}),e.jsx("div",{className:"text-[11px] text-slate-300 whitespace-pre-wrap break-words bg-slate-800/50 rounded p-2",children:h})]}),i!=null&&e.jsxs("div",{className:"pt-2",children:[e.jsxs("div",{className:"flex items-center gap-4 text-[11px]",children:[e.jsxs("div",{children:[e.jsx("span",{className:"text-slate-500",children:"Score:"})," ",e.jsx("span",{className:"font-mono text-slate-200",children:i.toFixed(2)})]}),x!=null&&e.jsxs("div",{children:[e.jsx("span",{className:"text-slate-500",children:"Threshold:"})," ",e.jsx("span",{className:"font-mono text-slate-200",children:x})]})]}),e.jsx("div",{className:"mt-1.5 h-1.5 bg-slate-800 rounded-full overflow-hidden",children:e.jsx("div",{className:`h-full transition-all ${n?"bg-emerald-500":"bg-rose-500"}`,style:{width:`${Math.min(100,Math.max(0,(i<=1?i:i/100)*100))}%`}})})]}),o&&!p&&e.jsxs("div",{className:"pt-1",children:[e.jsx("div",{className:"text-[10px] text-slate-500 mb-1",children:"Reasoning"}),e.jsx("div",{className:"text-[11px] text-slate-300 whitespace-pre-wrap break-words bg-slate-800/50 rounded p-2",children:o})]}),p&&j&&e.jsxs("div",{className:"pt-1",children:[e.jsx("div",{className:"text-[10px] text-amber-400 mb-1",children:"Error"}),e.jsx("div",{className:"text-[11px] text-amber-300 whitespace-pre-wrap break-words bg-amber-900/20 border border-amber-700/30 rounded p-2",children:j})]})]})]})}function q({assertion:s,index:u}){var N,j,r,d,m,S,A,_;const[l,c]=C.useState(!1),g=s.pass?"success":s.severity==="info"?"neutral":"danger",n=f=>isFinite(f)?f<=1?`${Math.round(f*100)}%`:f<=10?`${Math.round(f/10*100)}%`:`${Math.round(f)}%`:"—",t=typeof((N=s.details)==null?void 0:N.score)=="number"?s.details.score:void 0,a=typeof((j=s.details)==null?void 0:j.threshold)=="number"?s.details.threshold:void 0,i=((r=s.details)==null?void 0:r.reasoning)||"",x=((d=s.config)==null?void 0:d.rubric)||((m=s.details)==null?void 0:m.rubric)||"",o=((S=s.config)==null?void 0:S.scope)||"",h=((A=s.details)==null?void 0:A.misses)||[],p=s.name||((_=s.details)==null?void 0:_.stepName)||""||(s.type==="semantic"?"Semantic":s.type==="includes"?"Includes":s.type==="assistant_check"?"Assistant Check":String(s.type||"Check"));return e.jsxs("div",{className:"border border-slate-700/60 rounded-md bg-slate-900/50 overflow-hidden",children:[e.jsxs("button",{type:"button",className:"w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-800/30 transition-colors",onClick:()=>c(!l),children:[e.jsxs("div",{className:"flex items-center gap-2 min-w-0 flex-1",children:[e.jsx("svg",{className:`w-3 h-3 text-slate-500 transition-transform flex-shrink-0 ${l?"rotate-90":""}`,fill:"none",viewBox:"0 0 24 24",stroke:"currentColor",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M9 5l7 7-7 7"})}),e.jsx("span",{className:"text-[11px] text-slate-300 truncate",title:p,children:p}),t!=null&&e.jsx("span",{className:"text-[10px] text-slate-400 font-mono flex-shrink-0",children:n(t)})]}),e.jsx(I,{variant:g,className:"text-[10px] flex-shrink-0",children:s.pass?"PASS":"FAIL"})]}),l&&e.jsxs("div",{className:"px-3 pb-3 space-y-2 border-t border-slate-700/40",children:[x&&e.jsxs("div",{className:"pt-2",children:[e.jsx("div",{className:"text-[10px] text-slate-500 mb-1",children:"Checking for"}),e.jsx("div",{className:"text-[11px] text-slate-300 whitespace-pre-wrap break-words bg-slate-800/50 rounded p-2",children:x})]}),o&&e.jsxs("div",{className:"text-[11px]",children:[e.jsx("span",{className:"text-slate-500",children:"Scope:"})," ",e.jsx("span",{className:"text-slate-300",children:o})]}),t!=null&&a!=null&&e.jsx("div",{className:"pt-1",children:e.jsxs("div",{className:"flex items-center gap-4 text-[11px]",children:[e.jsxs("div",{children:[e.jsx("span",{className:"text-slate-500",children:"Score:"})," ",e.jsx("span",{className:"font-mono text-slate-200",children:n(t)})]}),e.jsxs("div",{children:[e.jsx("span",{className:"text-slate-500",children:"Threshold:"})," ",e.jsx("span",{className:"font-mono text-slate-200",children:n(a)})]})]})}),i&&e.jsxs("div",{className:"pt-1",children:[e.jsx("div",{className:"text-[10px] text-slate-500 mb-1",children:"Reasoning"}),e.jsx("div",{className:"text-[11px] text-slate-300 whitespace-pre-wrap break-words bg-slate-800/50 rounded p-2",children:i})]}),h.length>0&&e.jsxs("div",{className:"pt-1",children:[e.jsx("div",{className:"text-[10px] text-rose-400 mb-1",children:"Missing"}),e.jsx("ul",{className:"text-[11px] text-slate-300 list-disc ml-4",children:h.map((f,U)=>e.jsx("li",{children:f},U))})]})]})]})}function W({item:s,index:u}){var N,j;const l=Array.isArray(s.transcript)?s.transcript:[],c=Array.isArray(s.assertions)?s.assertions:[],n=(Array.isArray((N=s.artifacts)==null?void 0:N.log)?s.artifacts.log:[]).filter(r=>(r==null?void 0:r.type)==="judge_check"),t=s.timings||{},a=s.testName||s.testId,i=c.filter(r=>r.pass).length,x=c.filter(r=>!r.pass).length,o=n.filter(r=>r.pass).length,h=n.filter(r=>!r.pass).length,v=c.length+n.length,p=i+o;return e.jsxs("div",{className:"rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden",children:[e.jsxs("div",{className:"px-4 py-3 bg-slate-900/50 border-b border-slate-800",children:[e.jsxs("div",{className:"flex items-start justify-between gap-3",children:[e.jsxs("div",{className:"min-w-0 flex-1",children:[e.jsx("h3",{className:"text-sm font-medium text-slate-100 truncate",title:a,children:a}),s.testName&&e.jsx("div",{className:"text-[10px] text-slate-500 font-mono truncate mt-0.5",children:s.testId})]}),e.jsx(I,{variant:s.status==="passed"?"success":s.status==="running"?"info":"danger",children:s.status})]}),e.jsxs("div",{className:"flex flex-wrap items-center gap-3 mt-2 text-[11px]",children:[v>0&&e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx("span",{className:`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-medium ${p===v?"bg-emerald-500/20 text-emerald-300":"bg-rose-500/20 text-rose-300"}`,children:p}),e.jsxs("span",{className:"text-slate-500",children:["/ ",v," checks"]})]}),s.messageCounts&&e.jsxs("div",{className:"text-slate-400",children:[s.messageCounts.total," messages"]}),t.avgMs!=null&&e.jsxs("div",{className:"text-slate-400",title:"Average assistant response time",children:["avg ",b(t.avgMs)," ",t.source==="assistant"&&e.jsx("span",{className:"text-slate-500",children:"(assistant)"})]})]})]}),e.jsxs("div",{className:"divide-y divide-slate-800",children:[n.length>0&&e.jsx(y,{title:"Judge Checks",defaultOpen:h>0,badge:e.jsxs("div",{className:"flex items-center gap-1 text-[10px]",children:[o>0&&e.jsxs("span",{className:"text-emerald-400",children:[o," pass"]}),h>0&&e.jsxs("span",{className:"text-rose-400",children:[h," fail"]})]}),children:e.jsx("div",{className:"space-y-2",children:n.map((r,d)=>e.jsx(D,{check:r,index:d},d))})}),c.length>0&&e.jsx(y,{title:"Assertions",defaultOpen:x>0,badge:e.jsxs("div",{className:"flex items-center gap-1 text-[10px]",children:[i>0&&e.jsxs("span",{className:"text-emerald-400",children:[i," pass"]}),x>0&&e.jsxs("span",{className:"text-rose-400",children:[x," fail"]})]}),children:e.jsx("div",{className:"space-y-2",children:c.map((r,d)=>e.jsx(q,{assertion:r,index:d},d))})}),e.jsx(y,{title:"Conversation",defaultOpen:!1,children:l.length>0?e.jsx("div",{className:"space-y-2 max-h-96 overflow-y-auto",children:l.map((r,d)=>{const m=String(r.role)==="user";return e.jsx("div",{className:m?"text-right":"text-left",children:e.jsxs("span",{className:`inline-block px-3 py-2 rounded-lg max-w-[85%] text-[12px] whitespace-pre-wrap break-words ${m?"bg-gradient-to-br from-fuchsia-600 to-sky-500 text-white":"bg-slate-800/70 border border-slate-700 text-slate-100"}`,children:[e.jsx("span",{className:`block text-[10px] uppercase tracking-wide mb-1 ${m?"text-white/70":"text-slate-400"}`,children:m?"Test User":"Assistant"}),String(r.content)]})},d)})}):e.jsx("div",{className:"text-[11px] text-slate-500",children:"No messages recorded."})}),(t.avgMs!=null||t.p50Ms!=null||t.p95Ms!=null||t.maxMs!=null)&&e.jsxs(y,{title:t.label||(t.source==="assistant"?"Assistant Response Latency":"Latency"),defaultOpen:!1,children:[e.jsx("div",{className:"text-[10px] text-slate-500 mb-2",children:t.source==="assistant"?"Time for the target assistant endpoint to respond to each message":"Response time per turn"}),e.jsxs("div",{className:"grid grid-cols-2 gap-2 text-[11px]",children:[t.avgMs!=null&&e.jsxs("div",{className:"bg-slate-800/50 rounded p-2",children:[e.jsx("div",{className:"text-slate-500 text-[10px]",children:"Average"}),e.jsx("div",{className:"font-mono text-slate-200",children:b(t.avgMs)})]}),t.p50Ms!=null&&e.jsxs("div",{className:"bg-slate-800/50 rounded p-2",children:[e.jsx("div",{className:"text-slate-500 text-[10px]",children:"p50"}),e.jsx("div",{className:"font-mono text-slate-200",children:b(t.p50Ms)})]}),t.p95Ms!=null&&e.jsxs("div",{className:"bg-slate-800/50 rounded p-2",children:[e.jsx("div",{className:"text-slate-500 text-[10px]",children:"p95"}),e.jsx("div",{className:"font-mono text-slate-200",children:b(t.p95Ms)})]}),t.maxMs!=null&&e.jsxs("div",{className:"bg-slate-800/50 rounded p-2",children:[e.jsx("div",{className:"text-slate-500 text-[10px]",children:"Max"}),e.jsx("div",{className:"font-mono text-slate-200",children:b(t.maxMs)})]})]})]}),((j=s.error)==null?void 0:j.message)&&e.jsx(y,{title:"Error",defaultOpen:!0,children:e.jsx("div",{className:"text-[11px] text-rose-400 bg-rose-900/20 border border-rose-700/30 rounded p-2",children:s.error.message})})]})]})}W.__docgenInfo={description:"",methods:[],displayName:"TestResultCard",props:{item:{required:!0,tsType:{name:"TestResultItem"},description:""},index:{required:!0,tsType:{name:"number"},description:""}}};const V={title:"Base/TestResultCard",component:W,tags:["autodocs"]},w={args:{index:0,item:{testId:"test_001",testName:"Password Reset Flow",status:"passed",messageCounts:{user:3,assistant:3,total:6},assertions:[{type:"judge",pass:!0,severity:"error"},{type:"includes",pass:!0,severity:"warn",config:{value:"reset"}}],timings:{source:"assistant",avgMs:250,p50Ms:200,p95Ms:400,maxMs:450}}}},k={args:{index:1,item:{testId:"test_002",testName:"Data Leak Prevention",status:"failed",messageCounts:{user:2,assistant:2,total:4},assertions:[{type:"judge",pass:!1,severity:"error",details:{rubric:"Must not reveal PII",reasoning:"Assistant disclosed email without verification"}}],artifacts:{log:[{type:"judge_check",subtype:"rubric",pass:!1,details:{rubric:"Must not reveal PII",score:.2,threshold:.7,reasoning:"PII was disclosed"}}]}}}},M={args:{index:2,item:{testId:"test_003",testName:"Timeout Test",status:"error",error:{message:"Connection timeout after 30000ms"}}}};var P,L,$;w.parameters={...w.parameters,docs:{...(P=w.parameters)==null?void 0:P.docs,source:{originalSource:`{
  args: {
    index: 0,
    item: {
      testId: 'test_001',
      testName: 'Password Reset Flow',
      status: 'passed',
      messageCounts: {
        user: 3,
        assistant: 3,
        total: 6
      },
      assertions: [{
        type: 'judge',
        pass: true,
        severity: 'error' as const
      }, {
        type: 'includes',
        pass: true,
        severity: 'warn' as const,
        config: {
          value: 'reset'
        }
      }],
      timings: {
        source: 'assistant',
        avgMs: 250,
        p50Ms: 200,
        p95Ms: 400,
        maxMs: 450
      }
    }
  }
}`,...($=(L=w.parameters)==null?void 0:L.docs)==null?void 0:$.source}}};var T,R,E;k.parameters={...k.parameters,docs:{...(T=k.parameters)==null?void 0:T.docs,source:{originalSource:`{
  args: {
    index: 1,
    item: {
      testId: 'test_002',
      testName: 'Data Leak Prevention',
      status: 'failed',
      messageCounts: {
        user: 2,
        assistant: 2,
        total: 4
      },
      assertions: [{
        type: 'judge',
        pass: false,
        severity: 'error' as const,
        details: {
          rubric: 'Must not reveal PII',
          reasoning: 'Assistant disclosed email without verification'
        }
      }],
      artifacts: {
        log: [{
          type: 'judge_check',
          subtype: 'rubric',
          pass: false,
          details: {
            rubric: 'Must not reveal PII',
            score: 0.2,
            threshold: 0.7,
            reasoning: 'PII was disclosed'
          }
        }]
      }
    }
  }
}`,...(E=(R=k.parameters)==null?void 0:R.docs)==null?void 0:E.source}}};var F,O,B;M.parameters={...M.parameters,docs:{...(F=M.parameters)==null?void 0:F.docs,source:{originalSource:`{
  args: {
    index: 2,
    item: {
      testId: 'test_003',
      testName: 'Timeout Test',
      status: 'error',
      error: {
        message: 'Connection timeout after 30000ms'
      }
    }
  }
}`,...(B=(O=M.parameters)==null?void 0:O.docs)==null?void 0:B.source}}};const z=["Passed","Failed","WithError"];export{k as Failed,w as Passed,M as WithError,z as __namedExportsOrder,V as default};
