import{j as e}from"./jsx-runtime-EKYJJIwR.js";function t({title:g,className:x}){return e.jsx("h2",{className:`pb-1 text-3xl md:text-5xl font-heading font-semibold tracking-tight ${x??"text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-300 via-fuchsia-200 to-sky-300"}`,children:g})}t.__docgenInfo={description:"",methods:[],displayName:"SectionHeader",props:{title:{required:!0,tsType:{name:"string"},description:""},className:{required:!1,tsType:{name:"string"},description:""}}};const h={title:"UI/SectionHeader",component:t,tags:["autodocs"],argTypes:{title:{control:"text"},className:{control:"text"}}},r={args:{title:"Test Suites"}},s={args:{title:"Evidence Vault",className:"text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-rose-400"}},a={render:()=>e.jsxs("div",{className:"flex flex-col gap-8",children:[e.jsx(t,{title:"AI Testing"}),e.jsx(t,{title:"Assurance"}),e.jsx(t,{title:"Evidence"})]})};var o,n,i;r.parameters={...r.parameters,docs:{...(o=r.parameters)==null?void 0:o.docs,source:{originalSource:`{
  args: {
    title: 'Test Suites'
  }
}`,...(i=(n=r.parameters)==null?void 0:n.docs)==null?void 0:i.source}}};var c,l,d;s.parameters={...s.parameters,docs:{...(c=s.parameters)==null?void 0:c.docs,source:{originalSource:`{
  args: {
    title: 'Evidence Vault',
    className: 'text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-rose-400'
  }
}`,...(d=(l=s.parameters)==null?void 0:l.docs)==null?void 0:d.source}}};var m,p,u;a.parameters={...a.parameters,docs:{...(m=a.parameters)==null?void 0:m.docs,source:{originalSource:`{
  render: () => <div className="flex flex-col gap-8">\r
      <SectionHeader title="AI Testing" />\r
      <SectionHeader title="Assurance" />\r
      <SectionHeader title="Evidence" />\r
    </div>
}`,...(u=(p=a.parameters)==null?void 0:p.docs)==null?void 0:u.source}}};const v=["Default","CustomColor","Multiple"];export{s as CustomColor,r as Default,a as Multiple,v as __namedExportsOrder,h as default};
