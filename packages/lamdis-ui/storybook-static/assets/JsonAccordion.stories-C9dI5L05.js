import{j as u}from"./jsx-runtime-EKYJJIwR.js";import{r as v}from"./index-JhL3uwfD.js";import{J as g}from"./JsonAccordion-CiuGIX9i.js";const b={title:"Base/JsonAccordion",component:g,tags:["autodocs"],argTypes:{variant:{control:"select",options:["dark","light"]}}},o={name:"Password Reset Flow",config:{timeout:30,retries:2,headers:{Authorization:"Bearer ***","Content-Type":"application/json"}},tags:["auth","critical"]},e={args:{value:o,rootTitle:"Test Config"}},E=()=>{const[h,f]=v.useState(o);return u.jsx(g,{value:h,onChange:f,rootTitle:"Editable Config"})},r={render:()=>u.jsx(E,{})},a={args:{value:o,variant:"light"}};var t,s,n;e.parameters={...e.parameters,docs:{...(t=e.parameters)==null?void 0:t.docs,source:{originalSource:`{
  args: {
    value: sampleJson,
    rootTitle: 'Test Config'
  }
}`,...(n=(s=e.parameters)==null?void 0:s.docs)==null?void 0:n.source}}};var i,c,l;r.parameters={...r.parameters,docs:{...(i=r.parameters)==null?void 0:i.docs,source:{originalSource:`{
  render: () => <EditableDemo />
}`,...(l=(c=r.parameters)==null?void 0:c.docs)==null?void 0:l.source}}};var m,p,d;a.parameters={...a.parameters,docs:{...(m=a.parameters)==null?void 0:m.docs,source:{originalSource:`{
  args: {
    value: sampleJson,
    variant: 'light'
  }
}`,...(d=(p=a.parameters)==null?void 0:p.docs)==null?void 0:d.source}}};const j=["ReadOnly","Editable","Light"];export{r as Editable,a as Light,e as ReadOnly,j as __namedExportsOrder,b as default};
