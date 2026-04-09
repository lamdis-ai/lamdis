import{j as e}from"./jsx-runtime-EKYJJIwR.js";import{r as O}from"./index-JhL3uwfD.js";import{M as B}from"./Modal-D_W2bxzO.js";import{B as i}from"./Button-DNoIW74i.js";import"./index-BPftEo5x.js";import"./index-hLVmTiZX.js";import"./index--eguXucd.js";const q={title:"Base/Modal",component:B,tags:["autodocs"],argTypes:{size:{control:"select",options:["sm","md","lg","xl","2xl"]},variant:{control:"select",options:["dark","light"]},closeOnBackdrop:{control:"boolean"},showCloseButton:{control:"boolean"}}},r=({size:d="md",variant:E="dark"})=>{const[N,s]=O.useState(!1);return e.jsxs(e.Fragment,{children:[e.jsxs(i,{onClick:()=>s(!0),children:["Open ",d," Modal"]}),e.jsx(B,{open:N,onClose:()=>s(!1),title:"Modal Title",subtitle:"A subtitle for additional context",size:d,variant:E,footer:e.jsxs("div",{className:"flex gap-2 justify-end",children:[e.jsx(i,{variant:"ghost",onClick:()=>s(!1),children:"Cancel"}),e.jsx(i,{variant:"primary",onClick:()=>s(!1),children:"Confirm"})]}),children:e.jsx("p",{className:"text-sm text-slate-300",children:"This is the modal body content. It can contain any React elements."})})]})},a={render:()=>e.jsx(r,{})},o={render:()=>e.jsx(r,{size:"sm"})},t={render:()=>e.jsx(r,{size:"lg"})},n={render:()=>e.jsx(r,{size:"xl"})},l={render:()=>e.jsx(r,{variant:"light"})},c={render:()=>e.jsxs("div",{className:"flex flex-wrap gap-3",children:[e.jsx(r,{size:"sm"}),e.jsx(r,{size:"md"}),e.jsx(r,{size:"lg"}),e.jsx(r,{size:"xl"}),e.jsx(r,{size:"2xl"})]})};var m,p,x;a.parameters={...a.parameters,docs:{...(m=a.parameters)==null?void 0:m.docs,source:{originalSource:`{
  render: () => <ModalDemo />
}`,...(x=(p=a.parameters)==null?void 0:p.docs)==null?void 0:x.source}}};var u,g,j;o.parameters={...o.parameters,docs:{...(u=o.parameters)==null?void 0:u.docs,source:{originalSource:`{
  render: () => <ModalDemo size="sm" />
}`,...(j=(g=o.parameters)==null?void 0:g.docs)==null?void 0:j.source}}};var f,z,h;t.parameters={...t.parameters,docs:{...(f=t.parameters)==null?void 0:f.docs,source:{originalSource:`{
  render: () => <ModalDemo size="lg" />
}`,...(h=(z=t.parameters)==null?void 0:z.docs)==null?void 0:h.source}}};var M,D,S;n.parameters={...n.parameters,docs:{...(M=n.parameters)==null?void 0:M.docs,source:{originalSource:`{
  render: () => <ModalDemo size="xl" />
}`,...(S=(D=n.parameters)==null?void 0:D.docs)==null?void 0:S.source}}};var v,C,k;l.parameters={...l.parameters,docs:{...(v=l.parameters)==null?void 0:v.docs,source:{originalSource:`{
  render: () => <ModalDemo variant="light" />
}`,...(k=(C=l.parameters)==null?void 0:C.docs)==null?void 0:k.source}}};var L,b,y;c.parameters={...c.parameters,docs:{...(L=c.parameters)==null?void 0:L.docs,source:{originalSource:`{
  render: () => <div className="flex flex-wrap gap-3">\r
      <ModalDemo size="sm" />\r
      <ModalDemo size="md" />\r
      <ModalDemo size="lg" />\r
      <ModalDemo size="xl" />\r
      <ModalDemo size="2xl" />\r
    </div>
}`,...(y=(b=c.parameters)==null?void 0:b.docs)==null?void 0:y.source}}};const G=["Default","Small","Large","ExtraLarge","Light","AllSizes"];export{c as AllSizes,a as Default,n as ExtraLarge,t as Large,l as Light,o as Small,G as __namedExportsOrder,q as default};
