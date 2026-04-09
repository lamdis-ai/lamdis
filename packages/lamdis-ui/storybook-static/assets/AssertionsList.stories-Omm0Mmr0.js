import{j as r}from"./jsx-runtime-EKYJJIwR.js";import{B as F}from"./Badge-BywQeeGN.js";function M({assertions:a}){return!Array.isArray(a)||a.length===0?null:r.jsx("div",{className:"space-y-1",children:a.map((e,A)=>{var c,u,d,l,p,y;const I=e.pass?"success":e.severity==="info"?"neutral":"danger",N=e.type==="semantic"?`Semantic${typeof((c=e==null?void 0:e.details)==null?void 0:c.score)=="number"?` ${(()=>{const s=Number(e.details.score);return isFinite(s)?s<=1?`${Math.round(s*100)}%`:s<=10?`${Math.round(s/10*100)}%`:`${Math.round(s)}%`:""})()}`:""}${((u=e==null?void 0:e.details)==null?void 0:u.threshold)!=null?` (≥ ${(()=>{const s=Number(e.details.threshold);return isFinite(s)?s<=1?`${Math.round(s*100)}%`:`${Math.round(s)}%`:""})()})`:""}`:e.type==="includes"?`Includes${typeof((d=e==null?void 0:e.details)==null?void 0:d.score)=="number"?` ${(()=>{const s=Number(e.details.score);return isFinite(s)?s<=1?`${Math.round(s*100)}%`:s<=10?`${Math.round(s/10*100)}%`:`${Math.round(s)}%`:""})()}`:""}`:String(e.type||"assertion"),o=e.type==="semantic"?((l=e.details)==null?void 0:l.reasoning)||"":(p=e.details)!=null&&p.misses?`Missing: ${(e.details.misses||[]).join(", ")}`:"",w=e.type==="includes"&&((y=e.config)!=null&&y.scope)?` • scope: ${e.config.scope}`:"";return r.jsxs("div",{className:"flex items-center justify-between gap-2 text-xs",children:[r.jsxs("div",{className:"text-slate-300 truncate",children:[r.jsx("span",{className:"mr-2",children:r.jsx(F,{variant:I,children:N})}),o&&r.jsxs("span",{className:"text-slate-500",children:[o,w]})]}),e.severity&&r.jsx("span",{className:"text-[10px] uppercase text-slate-500",children:e.severity})]},A)})})}M.__docgenInfo={description:"",methods:[],displayName:"AssertionsList",props:{assertions:{required:!0,tsType:{name:"Array",elements:[{name:"AssertionItem"}],raw:"AssertionItem[]"},description:""}}};const _={title:"Base/AssertionsList",component:M,tags:["autodocs"]},t={args:{assertions:[{type:"judge",pass:!0,severity:"error",details:{rubric:"Verify identity before reset"}},{type:"includes",pass:!0,severity:"warn",config:{value:"reset"}},{type:"judge",pass:!1,severity:"error",details:{rubric:"Must not reveal PII"}},{type:"latency",pass:!0,severity:"info",details:{avgMs:250,threshold:500}}]}},n={args:{assertions:[{type:"judge",pass:!0,severity:"error"},{type:"includes",pass:!0,severity:"warn"}]}},i={args:{assertions:[{type:"judge",pass:!1,severity:"error",details:{rubric:"Identity verification required"}},{type:"includes",pass:!1,severity:"error",config:{value:"password reset"}}]}};var m,f,g;t.parameters={...t.parameters,docs:{...(m=t.parameters)==null?void 0:m.docs,source:{originalSource:`{
  args: {
    assertions: [{
      type: 'judge',
      pass: true,
      severity: 'error',
      details: {
        rubric: 'Verify identity before reset'
      }
    }, {
      type: 'includes',
      pass: true,
      severity: 'warn',
      config: {
        value: 'reset'
      }
    }, {
      type: 'judge',
      pass: false,
      severity: 'error',
      details: {
        rubric: 'Must not reveal PII'
      }
    }, {
      type: 'latency',
      pass: true,
      severity: 'info',
      details: {
        avgMs: 250,
        threshold: 500
      }
    }]
  }
}`,...(g=(f=t.parameters)==null?void 0:f.docs)==null?void 0:g.source}}};var v,h,x;n.parameters={...n.parameters,docs:{...(v=n.parameters)==null?void 0:v.docs,source:{originalSource:`{
  args: {
    assertions: [{
      type: 'judge',
      pass: true,
      severity: 'error'
    }, {
      type: 'includes',
      pass: true,
      severity: 'warn'
    }]
  }
}`,...(x=(h=n.parameters)==null?void 0:h.docs)==null?void 0:x.source}}};var j,$,b;i.parameters={...i.parameters,docs:{...(j=i.parameters)==null?void 0:j.docs,source:{originalSource:`{
  args: {
    assertions: [{
      type: 'judge',
      pass: false,
      severity: 'error',
      details: {
        rubric: 'Identity verification required'
      }
    }, {
      type: 'includes',
      pass: false,
      severity: 'error',
      config: {
        value: 'password reset'
      }
    }]
  }
}`,...(b=($=i.parameters)==null?void 0:$.docs)==null?void 0:b.source}}};const q=["Mixed","AllPassing","AllFailing"];export{i as AllFailing,n as AllPassing,t as Mixed,q as __namedExportsOrder,_ as default};
