import{j as a}from"./jsx-runtime-EKYJJIwR.js";import{r as E}from"./index-JhL3uwfD.js";import{K as g}from"./KeyValueEditor-R_bj8yqC.js";const k={title:"Base/KeyValueEditor",component:g,tags:["autodocs"],argTypes:{variant:{control:"select",options:["dark","light"]},allowEmpty:{control:"boolean"}}},o=({initial:y={},variant:x="dark"})=>{const[h,j]=E.useState(y);return a.jsx(g,{value:h,onChange:j,variant:x})},e={render:()=>a.jsx(o,{initial:{"Content-Type":"application/json",Authorization:"Bearer token"}})},r={render:()=>a.jsx(o,{})},t={render:()=>a.jsx(o,{initial:{key:"value"},variant:"light"})};var s,n,i;e.parameters={...e.parameters,docs:{...(s=e.parameters)==null?void 0:s.docs,source:{originalSource:`{
  render: () => <KVDemo initial={{
    'Content-Type': 'application/json',
    Authorization: 'Bearer token'
  }} />
}`,...(i=(n=e.parameters)==null?void 0:n.docs)==null?void 0:i.source}}};var c,p,m;r.parameters={...r.parameters,docs:{...(c=r.parameters)==null?void 0:c.docs,source:{originalSource:`{
  render: () => <KVDemo />
}`,...(m=(p=r.parameters)==null?void 0:p.docs)==null?void 0:m.source}}};var l,u,d;t.parameters={...t.parameters,docs:{...(l=t.parameters)==null?void 0:l.docs,source:{originalSource:`{
  render: () => <KVDemo initial={{
    key: 'value'
  }} variant="light" />
}`,...(d=(u=t.parameters)==null?void 0:u.docs)==null?void 0:d.source}}};const v=["Default","Empty","Light"];export{e as Default,r as Empty,t as Light,v as __namedExportsOrder,k as default};
