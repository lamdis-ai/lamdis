import{j as a}from"./jsx-runtime-EKYJJIwR.js";function e({value:c,max:i,label:u,variant:o="default"}){const m=Math.max(0,Math.min(100,Math.round(c/Math.max(1,i)*100))),N=o==="success"?"from-emerald-500 to-emerald-400":o==="warning"?"from-amber-500 to-amber-400":o==="danger"?"from-rose-500 to-rose-400":"from-fuchsia-500 to-sky-500";return a.jsxs("div",{className:"w-full",children:[u&&a.jsx("div",{className:"mb-1 text-xs text-slate-300",children:u}),a.jsx("div",{className:"h-2.5 w-full rounded-full bg-slate-800/80 overflow-hidden ring-1 ring-slate-700/60",children:a.jsx("div",{className:`h-full bg-gradient-to-r ${N}`,style:{width:`${m}%`}})}),a.jsxs("div",{className:"mt-1 text-[11px] text-slate-400",children:[c.toLocaleString()," / ",i.toLocaleString()," (",m,"%)"]})]})}e.__docgenInfo={description:"",methods:[],displayName:"ProgressBar",props:{value:{required:!0,tsType:{name:"number"},description:""},max:{required:!0,tsType:{name:"number"},description:""},label:{required:!1,tsType:{name:"string"},description:""},variant:{required:!1,tsType:{name:"union",raw:"'default'|'success'|'warning'|'danger'",elements:[{name:"literal",value:"'default'"},{name:"literal",value:"'success'"},{name:"literal",value:"'warning'"},{name:"literal",value:"'danger'"}]},description:"",defaultValue:{value:"'default'",computed:!1}}}};const R={title:"Base/ProgressBar",component:e,tags:["autodocs"],argTypes:{variant:{control:"select",options:["default","success","warning","danger"]},value:{control:{type:"range",min:0,max:100}}}},r={args:{value:72,max:100,label:"Test Progress"}},s={args:{value:95,max:100,label:"Pass Rate",variant:"success"}},n={args:{value:60,max:100,label:"Coverage",variant:"warning"}},l={args:{value:25,max:100,label:"Error Rate",variant:"danger"}},t={render:()=>a.jsxs("div",{className:"flex flex-col gap-4 max-w-md",children:[a.jsx(e,{value:85,max:100,label:"Default",variant:"default"}),a.jsx(e,{value:95,max:100,label:"Success",variant:"success"}),a.jsx(e,{value:60,max:100,label:"Warning",variant:"warning"}),a.jsx(e,{value:25,max:100,label:"Danger",variant:"danger"})]})};var d,g,v;r.parameters={...r.parameters,docs:{...(d=r.parameters)==null?void 0:d.docs,source:{originalSource:`{
  args: {
    value: 72,
    max: 100,
    label: 'Test Progress'
  }
}`,...(v=(g=r.parameters)==null?void 0:g.docs)==null?void 0:v.source}}};var p,x,f;s.parameters={...s.parameters,docs:{...(p=s.parameters)==null?void 0:p.docs,source:{originalSource:`{
  args: {
    value: 95,
    max: 100,
    label: 'Pass Rate',
    variant: 'success'
  }
}`,...(f=(x=s.parameters)==null?void 0:x.docs)==null?void 0:f.source}}};var b,h,w;n.parameters={...n.parameters,docs:{...(b=n.parameters)==null?void 0:b.docs,source:{originalSource:`{
  args: {
    value: 60,
    max: 100,
    label: 'Coverage',
    variant: 'warning'
  }
}`,...(w=(h=n.parameters)==null?void 0:h.docs)==null?void 0:w.source}}};var j,P,S;l.parameters={...l.parameters,docs:{...(j=l.parameters)==null?void 0:j.docs,source:{originalSource:`{
  args: {
    value: 25,
    max: 100,
    label: 'Error Rate',
    variant: 'danger'
  }
}`,...(S=(P=l.parameters)==null?void 0:P.docs)==null?void 0:S.source}}};var y,B,D;t.parameters={...t.parameters,docs:{...(y=t.parameters)==null?void 0:y.docs,source:{originalSource:`{
  render: () => <div className="flex flex-col gap-4 max-w-md">\r
      <ProgressBar value={85} max={100} label="Default" variant="default" />\r
      <ProgressBar value={95} max={100} label="Success" variant="success" />\r
      <ProgressBar value={60} max={100} label="Warning" variant="warning" />\r
      <ProgressBar value={25} max={100} label="Danger" variant="danger" />\r
    </div>
}`,...(D=(B=t.parameters)==null?void 0:B.docs)==null?void 0:D.source}}};const q=["Default","Success","Warning","Danger","AllVariants"];export{t as AllVariants,l as Danger,r as Default,s as Success,n as Warning,q as __namedExportsOrder,R as default};
