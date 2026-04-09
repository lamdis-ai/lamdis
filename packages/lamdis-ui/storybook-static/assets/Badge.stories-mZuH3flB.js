import{j as a}from"./jsx-runtime-EKYJJIwR.js";import{B as r}from"./Badge-BywQeeGN.js";const A={title:"Base/Badge",component:r,tags:["autodocs"],argTypes:{variant:{control:"select",options:["success","warning","info","neutral","danger"]}}},e={args:{children:"Passed",variant:"success"}},n={args:{children:"Pending",variant:"warning"}},s={args:{children:"Running",variant:"info"}},i={args:{children:"Draft",variant:"neutral"}},t={args:{children:"Failed",variant:"danger"}},c={render:()=>a.jsxs("div",{className:"flex flex-wrap gap-2",children:[a.jsx(r,{variant:"success",children:"Passed"}),a.jsx(r,{variant:"warning",children:"Pending"}),a.jsx(r,{variant:"info",children:"Running"}),a.jsx(r,{variant:"neutral",children:"Draft"}),a.jsx(r,{variant:"danger",children:"Failed"})]})};var d,o,g;e.parameters={...e.parameters,docs:{...(d=e.parameters)==null?void 0:d.docs,source:{originalSource:`{
  args: {
    children: 'Passed',
    variant: 'success'
  }
}`,...(g=(o=e.parameters)==null?void 0:o.docs)==null?void 0:g.source}}};var l,u,p;n.parameters={...n.parameters,docs:{...(l=n.parameters)==null?void 0:l.docs,source:{originalSource:`{
  args: {
    children: 'Pending',
    variant: 'warning'
  }
}`,...(p=(u=n.parameters)==null?void 0:u.docs)==null?void 0:p.source}}};var m,v,f;s.parameters={...s.parameters,docs:{...(m=s.parameters)==null?void 0:m.docs,source:{originalSource:`{
  args: {
    children: 'Running',
    variant: 'info'
  }
}`,...(f=(v=s.parameters)==null?void 0:v.docs)==null?void 0:f.source}}};var h,x,B;i.parameters={...i.parameters,docs:{...(h=i.parameters)==null?void 0:h.docs,source:{originalSource:`{
  args: {
    children: 'Draft',
    variant: 'neutral'
  }
}`,...(B=(x=i.parameters)==null?void 0:x.docs)==null?void 0:B.source}}};var j,P,S;t.parameters={...t.parameters,docs:{...(j=t.parameters)==null?void 0:j.docs,source:{originalSource:`{
  args: {
    children: 'Failed',
    variant: 'danger'
  }
}`,...(S=(P=t.parameters)==null?void 0:P.docs)==null?void 0:S.source}}};var w,D,R;c.parameters={...c.parameters,docs:{...(w=c.parameters)==null?void 0:w.docs,source:{originalSource:`{
  render: () => <div className="flex flex-wrap gap-2">\r
      <Badge variant="success">Passed</Badge>\r
      <Badge variant="warning">Pending</Badge>\r
      <Badge variant="info">Running</Badge>\r
      <Badge variant="neutral">Draft</Badge>\r
      <Badge variant="danger">Failed</Badge>\r
    </div>
}`,...(R=(D=c.parameters)==null?void 0:D.docs)==null?void 0:R.source}}};const E=["Success","Warning","Info","Neutral","Danger","AllVariants"];export{c as AllVariants,t as Danger,s as Info,i as Neutral,e as Success,n as Warning,E as __namedExportsOrder,A as default};
