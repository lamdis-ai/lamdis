import{j as e}from"./jsx-runtime-EKYJJIwR.js";function r({children:b,className:d}){const o="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 backdrop-blur-sm text-[11px] font-medium tracking-wide";return e.jsxs("div",{className:d?`${o} ${d}`:`${o} border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200`,children:[e.jsx("span",{className:"h-2 w-2 rounded-full bg-gradient-to-r from-fuchsia-400 to-sky-400 animate-pulse"}),b]})}r.__docgenInfo={description:"",methods:[],displayName:"Badge",props:{children:{required:!0,tsType:{name:"ReactReactNode",raw:"React.ReactNode"},description:""},className:{required:!1,tsType:{name:"string"},description:""}}};const N={title:"UI/Badge",component:r,tags:["autodocs"]},a={args:{children:"AI Powered"}},s={args:{children:"Custom Style",className:"border-emerald-500/30 bg-emerald-500/10 text-emerald-200"}},t={render:()=>e.jsxs("div",{className:"flex flex-wrap gap-2",children:[e.jsx(r,{children:"AI Powered"}),e.jsx(r,{className:"border-sky-500/30 bg-sky-500/10 text-sky-200",children:"Beta"}),e.jsx(r,{className:"border-amber-500/30 bg-amber-500/10 text-amber-200",children:"Experimental"})]})};var n,c,l;a.parameters={...a.parameters,docs:{...(n=a.parameters)==null?void 0:n.docs,source:{originalSource:`{
  args: {
    children: 'AI Powered'
  }
}`,...(l=(c=a.parameters)==null?void 0:c.docs)==null?void 0:l.source}}};var m,i,p;s.parameters={...s.parameters,docs:{...(m=s.parameters)==null?void 0:m.docs,source:{originalSource:`{
  args: {
    children: 'Custom Style',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
  }
}`,...(p=(i=s.parameters)==null?void 0:i.docs)==null?void 0:p.source}}};var u,g,x;t.parameters={...t.parameters,docs:{...(u=t.parameters)==null?void 0:u.docs,source:{originalSource:`{
  render: () => <div className="flex flex-wrap gap-2">\r
      <UIBadge>AI Powered</UIBadge>\r
      <UIBadge className="border-sky-500/30 bg-sky-500/10 text-sky-200">Beta</UIBadge>\r
      <UIBadge className="border-amber-500/30 bg-amber-500/10 text-amber-200">Experimental</UIBadge>\r
    </div>
}`,...(x=(g=t.parameters)==null?void 0:g.docs)==null?void 0:x.source}}};const y=["Default","CustomClassName","Multiple"];export{s as CustomClassName,a as Default,t as Multiple,y as __namedExportsOrder,N as default};
