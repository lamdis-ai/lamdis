import{j as a}from"./jsx-runtime-EKYJJIwR.js";import{A as n}from"./AiLoader-De7VcnVJ.js";const L={title:"Base/AiLoader",component:n,tags:["autodocs"],argTypes:{variant:{control:"select",options:["dark","light"]},label:{control:"text"}}},r={args:{variant:"dark"}},e={args:{variant:"light"}},s={args:{variant:"dark",label:"Processing"}},t={render:()=>a.jsxs("div",{className:"flex gap-8 items-center",children:[a.jsxs("div",{className:"p-6 rounded-lg bg-slate-800",children:[a.jsx("p",{className:"text-xs text-slate-400 mb-3",children:"Dark variant"}),a.jsx(n,{variant:"dark"})]}),a.jsxs("div",{className:"p-6 rounded-lg bg-slate-200",children:[a.jsx("p",{className:"text-xs text-slate-600 mb-3",children:"Light variant"}),a.jsx(n,{variant:"light"})]})]})};var o,i,c;r.parameters={...r.parameters,docs:{...(o=r.parameters)==null?void 0:o.docs,source:{originalSource:`{
  args: {
    variant: 'dark'
  }
}`,...(c=(i=r.parameters)==null?void 0:i.docs)==null?void 0:c.source}}};var d,l,m;e.parameters={...e.parameters,docs:{...(d=e.parameters)==null?void 0:d.docs,source:{originalSource:`{
  args: {
    variant: 'light'
  }
}`,...(m=(l=e.parameters)==null?void 0:l.docs)==null?void 0:m.source}}};var p,g,x;s.parameters={...s.parameters,docs:{...(p=s.parameters)==null?void 0:p.docs,source:{originalSource:`{
  args: {
    variant: 'dark',
    label: 'Processing'
  }
}`,...(x=(g=s.parameters)==null?void 0:g.docs)==null?void 0:x.source}}};var v,u,h;t.parameters={...t.parameters,docs:{...(v=t.parameters)==null?void 0:v.docs,source:{originalSource:`{
  render: () => <div className="flex gap-8 items-center">\r
      <div className="p-6 rounded-lg bg-slate-800">\r
        <p className="text-xs text-slate-400 mb-3">Dark variant</p>\r
        <AiLoader variant="dark" />\r
      </div>\r
      <div className="p-6 rounded-lg bg-slate-200">\r
        <p className="text-xs text-slate-600 mb-3">Light variant</p>\r
        <AiLoader variant="light" />\r
      </div>\r
    </div>
}`,...(h=(u=t.parameters)==null?void 0:u.docs)==null?void 0:h.source}}};const N=["Dark","Light","CustomLabel","BothVariants"];export{t as BothVariants,s as CustomLabel,r as Dark,e as Light,N as __namedExportsOrder,L as default};
