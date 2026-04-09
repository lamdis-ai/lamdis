import{j as e}from"./jsx-runtime-EKYJJIwR.js";import{r as E}from"./index-JhL3uwfD.js";const w=E.forwardRef(function({label:n,description:l,inline:i=!1,className:C="",...I},D){return e.jsxs("label",{className:`group select-none ${i?"inline-flex items-center gap-2":"flex items-start gap-2"} text-sm cursor-pointer`,children:[e.jsxs("span",{className:"relative inline-block h-4 w-4",children:[e.jsx("input",{ref:D,type:"checkbox",className:`peer absolute inset-0 h-4 w-4 rounded border border-slate-600/70 bg-slate-900/40 text-brand-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed appearance-none transition-colors ${C}`,...I}),e.jsx("span",{className:"pointer-events-none absolute inset-0 rounded -m-0.5 peer-focus:ring-2 peer-focus:ring-brand-500/30"}),e.jsx("svg",{"aria-hidden":!0,className:"pointer-events-none absolute inset-0 m-auto w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity",viewBox:"0 0 20 20",fill:"none",stroke:"currentColor",strokeWidth:"3",strokeLinecap:"round",strokeLinejoin:"round",children:e.jsx("path",{d:"M5 10.5 8.5 14 15 6"})})]}),e.jsxs("span",{className:`mt-[1px] leading-snug ${i?"":"flex flex-col"}`,children:[n&&e.jsx("span",{className:"text-slate-200 peer-disabled:text-slate-500 flex items-center gap-1",children:n}),l&&e.jsx("span",{className:"text-[11px] text-slate-500 peer-disabled:text-slate-600 mt-0.5",children:l})]})]})});w.__docgenInfo={description:"",methods:[],displayName:"Checkbox",props:{label:{required:!1,tsType:{name:"string"},description:""},description:{required:!1,tsType:{name:"string"},description:""},inline:{required:!1,tsType:{name:"boolean"},description:"",defaultValue:{value:"false",computed:!1}},className:{defaultValue:{value:"''",computed:!1},required:!1}},composes:["Omit"]};const T={title:"Base/Checkbox",component:w,tags:["autodocs"],argTypes:{label:{control:"text"},description:{control:"text"},inline:{control:"boolean"},disabled:{control:"boolean"},checked:{control:"boolean"}}},s={args:{label:"Enable notifications"}},a={args:{label:"Auto-run tests",description:"Automatically run the test suite on every push to main"}},t={args:{label:"I agree to the terms",checked:!0}},r={args:{label:"Unavailable option",disabled:!0}},o={args:{label:"Inline checkbox",inline:!0}};var c,d,p;s.parameters={...s.parameters,docs:{...(c=s.parameters)==null?void 0:c.docs,source:{originalSource:`{
  args: {
    label: 'Enable notifications'
  }
}`,...(p=(d=s.parameters)==null?void 0:d.docs)==null?void 0:p.source}}};var u,m,b;a.parameters={...a.parameters,docs:{...(u=a.parameters)==null?void 0:u.docs,source:{originalSource:`{
  args: {
    label: 'Auto-run tests',
    description: 'Automatically run the test suite on every push to main'
  }
}`,...(b=(m=a.parameters)==null?void 0:m.docs)==null?void 0:b.source}}};var x,h,g;t.parameters={...t.parameters,docs:{...(x=t.parameters)==null?void 0:x.docs,source:{originalSource:`{
  args: {
    label: 'I agree to the terms',
    checked: true
  }
}`,...(g=(h=t.parameters)==null?void 0:h.docs)==null?void 0:g.source}}};var f,k,y;r.parameters={...r.parameters,docs:{...(f=r.parameters)==null?void 0:f.docs,source:{originalSource:`{
  args: {
    label: 'Unavailable option',
    disabled: true
  }
}`,...(y=(k=r.parameters)==null?void 0:k.docs)==null?void 0:y.source}}};var j,v,N;o.parameters={...o.parameters,docs:{...(j=o.parameters)==null?void 0:j.docs,source:{originalSource:`{
  args: {
    label: 'Inline checkbox',
    inline: true
  }
}`,...(N=(v=o.parameters)==null?void 0:v.docs)==null?void 0:N.source}}};const _=["Default","WithDescription","Checked","Disabled","Inline"];export{t as Checked,s as Default,r as Disabled,o as Inline,a as WithDescription,_ as __namedExportsOrder,T as default};
