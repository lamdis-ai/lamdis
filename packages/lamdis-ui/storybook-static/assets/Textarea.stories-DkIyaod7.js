import{j as g}from"./jsx-runtime-EKYJJIwR.js";const x="w-full rounded-md border border-slate-600/70 !bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40",m=({className:i="",mono:b,...f})=>g.jsx("textarea",{className:`${x} ${b?"font-mono text-xs":""} ${i}`,...f});m.__docgenInfo={description:"",methods:[],displayName:"Textarea",props:{mono:{required:!1,tsType:{name:"boolean"},description:""},className:{defaultValue:{value:"''",computed:!1},required:!1}}};const w={title:"Base/Textarea",component:m,tags:["autodocs"],argTypes:{mono:{control:"boolean"},disabled:{control:"boolean"},placeholder:{control:"text"},rows:{control:"number"}}},e={args:{placeholder:"Enter your test script...",rows:4}},r={args:{placeholder:'{ "key": "value" }',mono:!0,rows:4}},o={args:{placeholder:"Disabled",disabled:!0,rows:4}};var s,a,t;e.parameters={...e.parameters,docs:{...(s=e.parameters)==null?void 0:s.docs,source:{originalSource:`{
  args: {
    placeholder: 'Enter your test script...',
    rows: 4
  }
}`,...(t=(a=e.parameters)==null?void 0:a.docs)==null?void 0:t.source}}};var l,n,c;r.parameters={...r.parameters,docs:{...(l=r.parameters)==null?void 0:l.docs,source:{originalSource:`{
  args: {
    placeholder: '{ "key": "value" }',
    mono: true,
    rows: 4
  }
}`,...(c=(n=r.parameters)==null?void 0:n.docs)==null?void 0:c.source}}};var d,p,u;o.parameters={...o.parameters,docs:{...(d=o.parameters)==null?void 0:d.docs,source:{originalSource:`{
  args: {
    placeholder: 'Disabled',
    disabled: true,
    rows: 4
  }
}`,...(u=(p=o.parameters)==null?void 0:p.docs)==null?void 0:u.source}}};const y=["Default","Monospace","Disabled"];export{e as Default,o as Disabled,r as Monospace,y as __namedExportsOrder,w as default};
