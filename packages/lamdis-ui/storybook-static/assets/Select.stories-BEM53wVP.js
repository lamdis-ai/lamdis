import{j as e}from"./jsx-runtime-EKYJJIwR.js";const N="w-full rounded-md border border-slate-600/70 bg-slate-900 text-slate-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-400/40 disabled:opacity-50",r=({className:y="",sizeVariant:i="md",...w})=>{const E=i==="xs"?"px-1.5 py-1 text-xs":i==="sm"?"px-2 py-1.5 text-sm":"px-2.5 py-2 text-sm";return e.jsx("select",{className:`${N} ${E} ${y}`,...w})};r.__docgenInfo={description:"",methods:[],displayName:"Select",props:{sizeVariant:{required:!1,tsType:{name:"union",raw:"'sm' | 'md' | 'xs'",elements:[{name:"literal",value:"'sm'"},{name:"literal",value:"'md'"},{name:"literal",value:"'xs'"}]},description:"",defaultValue:{value:"'md'",computed:!1}},className:{defaultValue:{value:"''",computed:!1},required:!1}}};const _={title:"Base/Select",component:r,tags:["autodocs"],argTypes:{sizeVariant:{control:"select",options:["xs","sm","md"]},disabled:{control:"boolean"}}},s=e.jsxs(e.Fragment,{children:[e.jsx("option",{value:"",children:"Select severity..."}),e.jsx("option",{value:"error",children:"Error"}),e.jsx("option",{value:"warn",children:"Warning"}),e.jsx("option",{value:"info",children:"Info"})]}),a={args:{children:s}},t={args:{children:s,sizeVariant:"sm"}},n={args:{children:s,sizeVariant:"xs"}},o={args:{children:s,disabled:!0}},l={render:()=>e.jsxs("div",{className:"flex flex-col gap-3 max-w-xs",children:[e.jsx(r,{sizeVariant:"xs",children:s}),e.jsx(r,{sizeVariant:"sm",children:s}),e.jsx(r,{sizeVariant:"md",children:s})]})};var c,d,m;a.parameters={...a.parameters,docs:{...(c=a.parameters)==null?void 0:c.docs,source:{originalSource:`{
  args: {
    children: options
  }
}`,...(m=(d=a.parameters)==null?void 0:d.docs)==null?void 0:m.source}}};var p,u,x;t.parameters={...t.parameters,docs:{...(p=t.parameters)==null?void 0:p.docs,source:{originalSource:`{
  args: {
    children: options,
    sizeVariant: 'sm'
  }
}`,...(x=(u=t.parameters)==null?void 0:u.docs)==null?void 0:x.source}}};var f,g,S;n.parameters={...n.parameters,docs:{...(f=n.parameters)==null?void 0:f.docs,source:{originalSource:`{
  args: {
    children: options,
    sizeVariant: 'xs'
  }
}`,...(S=(g=n.parameters)==null?void 0:g.docs)==null?void 0:S.source}}};var h,z,v;o.parameters={...o.parameters,docs:{...(h=o.parameters)==null?void 0:h.docs,source:{originalSource:`{
  args: {
    children: options,
    disabled: true
  }
}`,...(v=(z=o.parameters)==null?void 0:z.docs)==null?void 0:v.source}}};var V,b,j;l.parameters={...l.parameters,docs:{...(V=l.parameters)==null?void 0:V.docs,source:{originalSource:`{
  render: () => <div className="flex flex-col gap-3 max-w-xs">\r
      <Select sizeVariant="xs">{options}</Select>\r
      <Select sizeVariant="sm">{options}</Select>\r
      <Select sizeVariant="md">{options}</Select>\r
    </div>
}`,...(j=(b=l.parameters)==null?void 0:b.docs)==null?void 0:j.source}}};const $=["Default","Small","ExtraSmall","Disabled","AllSizes"];export{l as AllSizes,a as Default,o as Disabled,n as ExtraSmall,t as Small,$ as __namedExportsOrder,_ as default};
