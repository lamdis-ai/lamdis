import{j as e}from"./jsx-runtime-EKYJJIwR.js";import{I as n}from"./Input-Dw8W-mSr.js";const v={title:"Base/Input",component:n,tags:["autodocs"],argTypes:{sizeVariant:{control:"select",options:["xs","sm","md"]},mono:{control:"boolean"},disabled:{control:"boolean"},placeholder:{control:"text"}}},a={args:{placeholder:"Enter text..."}},r={args:{placeholder:"Small input",sizeVariant:"sm"}},s={args:{placeholder:"XS input",sizeVariant:"xs"}},o={args:{placeholder:"api_key_here",mono:!0}},l={args:{placeholder:"Disabled",disabled:!0}},t={render:()=>e.jsxs("div",{className:"flex flex-col gap-3 max-w-sm",children:[e.jsx(n,{sizeVariant:"xs",placeholder:"Extra small (xs)"}),e.jsx(n,{sizeVariant:"sm",placeholder:"Small (sm)"}),e.jsx(n,{sizeVariant:"md",placeholder:"Medium (md) — default"})]})};var c,m,d;a.parameters={...a.parameters,docs:{...(c=a.parameters)==null?void 0:c.docs,source:{originalSource:`{
  args: {
    placeholder: 'Enter text...'
  }
}`,...(d=(m=a.parameters)==null?void 0:m.docs)==null?void 0:d.source}}};var p,i,u;r.parameters={...r.parameters,docs:{...(p=r.parameters)==null?void 0:p.docs,source:{originalSource:`{
  args: {
    placeholder: 'Small input',
    sizeVariant: 'sm'
  }
}`,...(u=(i=r.parameters)==null?void 0:i.docs)==null?void 0:u.source}}};var x,g,h;s.parameters={...s.parameters,docs:{...(x=s.parameters)==null?void 0:x.docs,source:{originalSource:`{
  args: {
    placeholder: 'XS input',
    sizeVariant: 'xs'
  }
}`,...(h=(g=s.parameters)==null?void 0:g.docs)==null?void 0:h.source}}};var S,z,f;o.parameters={...o.parameters,docs:{...(S=o.parameters)==null?void 0:S.docs,source:{originalSource:`{
  args: {
    placeholder: 'api_key_here',
    mono: true
  }
}`,...(f=(z=o.parameters)==null?void 0:z.docs)==null?void 0:f.source}}};var V,b,E;l.parameters={...l.parameters,docs:{...(V=l.parameters)==null?void 0:V.docs,source:{originalSource:`{
  args: {
    placeholder: 'Disabled',
    disabled: true
  }
}`,...(E=(b=l.parameters)==null?void 0:b.docs)==null?void 0:E.source}}};var j,D,I;t.parameters={...t.parameters,docs:{...(j=t.parameters)==null?void 0:j.docs,source:{originalSource:`{
  render: () => <div className="flex flex-col gap-3 max-w-sm">\r
      <Input sizeVariant="xs" placeholder="Extra small (xs)" />\r
      <Input sizeVariant="sm" placeholder="Small (sm)" />\r
      <Input sizeVariant="md" placeholder="Medium (md) — default" />\r
    </div>
}`,...(I=(D=t.parameters)==null?void 0:D.docs)==null?void 0:I.source}}};const y=["Default","Small","ExtraSmall","Monospace","Disabled","AllSizes"];export{t as AllSizes,a as Default,l as Disabled,s as ExtraSmall,o as Monospace,r as Small,y as __namedExportsOrder,v as default};
