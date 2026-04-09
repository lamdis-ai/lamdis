import{j as e}from"./jsx-runtime-EKYJJIwR.js";import{r as D}from"./index-JhL3uwfD.js";const a=D.forwardRef(function({label:n,description:i,inline:l=!0,className:j="",...R},N){return e.jsxs("label",{className:`group relative select-none ${l?"inline-flex items-center gap-2":"flex items-start gap-2"} text-sm cursor-pointer`,children:[e.jsx("input",{ref:N,type:"radio",className:`peer h-4 w-4 rounded-full border border-slate-600/70 bg-slate-900/40 text-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed appearance-none grid place-content-center transition-colors ${j}`,...R}),e.jsx("span",{className:"pointer-events-none absolute inset-0 rounded-full -m-0.5 peer-focus:ring-2 peer-focus:ring-brand-500/30"}),e.jsxs("span",{className:`mt-[1px] leading-snug ${l?"":"flex flex-col"}`,children:[n&&e.jsx("span",{className:"text-slate-200 peer-disabled:text-slate-500 flex items-center gap-1",children:n}),i&&e.jsx("span",{className:"text-[11px] text-slate-500 peer-disabled:text-slate-600 mt-0.5",children:i})]}),e.jsx("span",{className:"pointer-events-none absolute w-2.5 h-2.5 rounded-full bg-brand-500 left-[7px] top-[7px] opacity-0 peer-checked:opacity-100 transition-opacity"})]})});a.__docgenInfo={description:"",methods:[],displayName:"Radio",props:{label:{required:!1,tsType:{name:"string"},description:""},description:{required:!1,tsType:{name:"string"},description:""},inline:{required:!1,tsType:{name:"boolean"},description:"",defaultValue:{value:"true",computed:!1}},className:{defaultValue:{value:"''",computed:!1},required:!1}},composes:["Omit"]};const q={title:"Base/Radio",component:a,tags:["autodocs"],argTypes:{label:{control:"text"},description:{control:"text"},inline:{control:"boolean"},disabled:{control:"boolean"}}},r={args:{label:"Option A",name:"demo"}},s={args:{label:"Strict mode",description:"Fail the suite on any test error",name:"mode"}},t={args:{label:"Unavailable",disabled:!0,name:"demo"}},o={render:()=>e.jsxs("div",{className:"flex flex-col gap-2",children:[e.jsx(a,{name:"severity",label:"Error",description:"Fails the test run",defaultChecked:!0}),e.jsx(a,{name:"severity",label:"Warning",description:"Reports but does not fail"}),e.jsx(a,{name:"severity",label:"Info",description:"Informational only"})]})};var d,c,p;r.parameters={...r.parameters,docs:{...(d=r.parameters)==null?void 0:d.docs,source:{originalSource:`{
  args: {
    label: 'Option A',
    name: 'demo'
  }
}`,...(p=(c=r.parameters)==null?void 0:c.docs)==null?void 0:p.source}}};var m,u,f;s.parameters={...s.parameters,docs:{...(m=s.parameters)==null?void 0:m.docs,source:{originalSource:`{
  args: {
    label: 'Strict mode',
    description: 'Fail the suite on any test error',
    name: 'mode'
  }
}`,...(f=(u=s.parameters)==null?void 0:u.docs)==null?void 0:f.source}}};var b,x,g;t.parameters={...t.parameters,docs:{...(b=t.parameters)==null?void 0:b.docs,source:{originalSource:`{
  args: {
    label: 'Unavailable',
    disabled: true,
    name: 'demo'
  }
}`,...(g=(x=t.parameters)==null?void 0:x.docs)==null?void 0:g.source}}};var y,h,v;o.parameters={...o.parameters,docs:{...(y=o.parameters)==null?void 0:y.docs,source:{originalSource:`{
  render: () => <div className="flex flex-col gap-2">\r
      <Radio name="severity" label="Error" description="Fails the test run" defaultChecked />\r
      <Radio name="severity" label="Warning" description="Reports but does not fail" />\r
      <Radio name="severity" label="Info" description="Informational only" />\r
    </div>
}`,...(v=(h=o.parameters)==null?void 0:h.docs)==null?void 0:v.source}}};const w=["Default","WithDescription","Disabled","RadioGroup"];export{r as Default,t as Disabled,o as RadioGroup,s as WithDescription,w as __namedExportsOrder,q as default};
