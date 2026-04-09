import{j as e}from"./jsx-runtime-EKYJJIwR.js";import{R as s}from"./ReviewStatusBadge-CXFsszEA.js";import"./index--eguXucd.js";import"./index-JhL3uwfD.js";const H={title:"UI/ReviewStatusBadge",component:s,tags:["autodocs"],argTypes:{status:{control:"select",options:["pending_review","approved","rejected","needs_investigation","false_positive","acknowledged"]},size:{control:"select",options:["sm","md","lg"]},showIcon:{control:"boolean"},interactive:{control:"boolean"}}},a={args:{status:"pending_review"}},t={args:{status:"approved"}},r={args:{status:"rejected"}},o={args:{status:"needs_investigation"}},n={args:{status:"false_positive"}},i={args:{status:"acknowledged"}},d={render:()=>e.jsxs("div",{className:"flex flex-wrap gap-3",children:[e.jsx(s,{status:"pending_review"}),e.jsx(s,{status:"approved"}),e.jsx(s,{status:"rejected"}),e.jsx(s,{status:"needs_investigation"}),e.jsx(s,{status:"false_positive"}),e.jsx(s,{status:"acknowledged"})]})},c={render:()=>e.jsxs("div",{className:"flex flex-wrap gap-3 items-center",children:[e.jsx(s,{status:"approved",size:"sm"}),e.jsx(s,{status:"approved",size:"md"}),e.jsx(s,{status:"approved",size:"lg"})]})},p={args:{status:"pending_review",interactive:!0,onClick:()=>alert("Clicked!")}};var u,g,l;a.parameters={...a.parameters,docs:{...(u=a.parameters)==null?void 0:u.docs,source:{originalSource:`{
  args: {
    status: 'pending_review'
  }
}`,...(l=(g=a.parameters)==null?void 0:g.docs)==null?void 0:l.source}}};var m,v,w;t.parameters={...t.parameters,docs:{...(m=t.parameters)==null?void 0:m.docs,source:{originalSource:`{
  args: {
    status: 'approved'
  }
}`,...(w=(v=t.parameters)==null?void 0:v.docs)==null?void 0:w.source}}};var S,x,j;r.parameters={...r.parameters,docs:{...(S=r.parameters)==null?void 0:S.docs,source:{originalSource:`{
  args: {
    status: 'rejected'
  }
}`,...(j=(x=r.parameters)==null?void 0:x.docs)==null?void 0:j.source}}};var _,R,f;o.parameters={...o.parameters,docs:{...(_=o.parameters)==null?void 0:_.docs,source:{originalSource:`{
  args: {
    status: 'needs_investigation'
  }
}`,...(f=(R=o.parameters)==null?void 0:R.docs)==null?void 0:f.source}}};var k,B,z;n.parameters={...n.parameters,docs:{...(k=n.parameters)==null?void 0:k.docs,source:{originalSource:`{
  args: {
    status: 'false_positive'
  }
}`,...(z=(B=n.parameters)==null?void 0:B.docs)==null?void 0:z.source}}};var A,I,N;i.parameters={...i.parameters,docs:{...(A=i.parameters)==null?void 0:A.docs,source:{originalSource:`{
  args: {
    status: 'acknowledged'
  }
}`,...(N=(I=i.parameters)==null?void 0:I.docs)==null?void 0:N.source}}};var C,P,h;d.parameters={...d.parameters,docs:{...(C=d.parameters)==null?void 0:C.docs,source:{originalSource:`{
  render: () => <div className="flex flex-wrap gap-3">\r
      <ReviewStatusBadge status="pending_review" />\r
      <ReviewStatusBadge status="approved" />\r
      <ReviewStatusBadge status="rejected" />\r
      <ReviewStatusBadge status="needs_investigation" />\r
      <ReviewStatusBadge status="false_positive" />\r
      <ReviewStatusBadge status="acknowledged" />\r
    </div>
}`,...(h=(P=d.parameters)==null?void 0:P.docs)==null?void 0:h.source}}};var b,E,F;c.parameters={...c.parameters,docs:{...(b=c.parameters)==null?void 0:b.docs,source:{originalSource:`{
  render: () => <div className="flex flex-wrap gap-3 items-center">\r
      <ReviewStatusBadge status="approved" size="sm" />\r
      <ReviewStatusBadge status="approved" size="md" />\r
      <ReviewStatusBadge status="approved" size="lg" />\r
    </div>
}`,...(F=(E=c.parameters)==null?void 0:E.docs)==null?void 0:F.source}}};var y,O,T;p.parameters={...p.parameters,docs:{...(y=p.parameters)==null?void 0:y.docs,source:{originalSource:`{
  args: {
    status: 'pending_review',
    interactive: true,
    onClick: () => alert('Clicked!')
  }
}`,...(T=(O=p.parameters)==null?void 0:O.docs)==null?void 0:T.source}}};const J=["PendingReview","Approved","Rejected","NeedsInvestigation","FalsePositive","Acknowledged","AllStatuses","Sizes","Interactive"];export{i as Acknowledged,d as AllStatuses,t as Approved,n as FalsePositive,p as Interactive,o as NeedsInvestigation,a as PendingReview,r as Rejected,c as Sizes,J as __namedExportsOrder,H as default};
