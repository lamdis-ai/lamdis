import{j as e}from"./jsx-runtime-EKYJJIwR.js";function O({label:a,error:r,className:c="",...s}){return e.jsxs("div",{className:"w-full",children:[a&&e.jsxs("label",{className:"block text-sm font-medium text-slate-300 mb-1.5",children:[a,s.required&&" *"]}),e.jsx("input",{...s,className:`w-full px-3 py-2 rounded-lg bg-slate-800/70 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 focus:border-transparent transition-colors ${r?"border-red-500":""} ${c}`,style:{colorScheme:"dark"}}),r&&e.jsx("p",{className:"mt-1 text-sm text-red-400",children:r})]})}function u({label:a,error:r,className:c="",...s}){return e.jsxs("div",{className:"w-full",children:[a&&e.jsxs("label",{className:"block text-sm font-medium text-slate-300 mb-1.5",children:[a,s.required&&" *"]}),e.jsx("textarea",{...s,className:`w-full px-3 py-2 rounded-lg bg-slate-800/70 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 focus:border-transparent resize-none transition-colors ${r?"border-red-500":""} ${c}`,style:{colorScheme:"dark"}}),r&&e.jsx("p",{className:"mt-1 text-sm text-red-400",children:r})]})}O.__docgenInfo={description:"",methods:[],displayName:"Input",props:{label:{required:!1,tsType:{name:"string"},description:""},error:{required:!1,tsType:{name:"string"},description:""},className:{defaultValue:{value:"''",computed:!1},required:!1}}};u.__docgenInfo={description:"",methods:[],displayName:"Textarea",props:{label:{required:!1,tsType:{name:"string"},description:""},error:{required:!1,tsType:{name:"string"},description:""},className:{defaultValue:{value:"''",computed:!1},required:!1}}};const A={title:"UI/Input",component:O,tags:["autodocs"],argTypes:{label:{control:"text"},error:{control:"text"},required:{control:"boolean"},disabled:{control:"boolean"},placeholder:{control:"text"}}},t={args:{label:"Suite Name",placeholder:"Enter suite name..."}},l={args:{label:"API Key",placeholder:"lam_sk_...",required:!0}},o={args:{label:"Email",value:"invalid",error:"Please enter a valid email address"}},n={args:{label:"Organization",value:"Acme Corp",disabled:!0}},d={render:()=>e.jsx(u,{label:"Test Script",placeholder:"user: Hello\\nassistant: (should greet)",rows:4})},i={render:()=>e.jsx(u,{label:"JSON Body",value:"{ invalid json }",error:"Invalid JSON format",rows:3})};var m,p,x;t.parameters={...t.parameters,docs:{...(m=t.parameters)==null?void 0:m.docs,source:{originalSource:`{
  args: {
    label: 'Suite Name',
    placeholder: 'Enter suite name...'
  }
}`,...(x=(p=t.parameters)==null?void 0:p.docs)==null?void 0:x.source}}};var b,f,g;l.parameters={...l.parameters,docs:{...(b=l.parameters)==null?void 0:b.docs,source:{originalSource:`{
  args: {
    label: 'API Key',
    placeholder: 'lam_sk_...',
    required: true
  }
}`,...(g=(f=l.parameters)==null?void 0:f.docs)==null?void 0:g.source}}};var h,v,N;o.parameters={...o.parameters,docs:{...(h=o.parameters)==null?void 0:h.docs,source:{originalSource:`{
  args: {
    label: 'Email',
    value: 'invalid',
    error: 'Please enter a valid email address'
  }
}`,...(N=(v=o.parameters)==null?void 0:v.docs)==null?void 0:N.source}}};var S,y,T;n.parameters={...n.parameters,docs:{...(S=n.parameters)==null?void 0:S.docs,source:{originalSource:`{
  args: {
    label: 'Organization',
    value: 'Acme Corp',
    disabled: true
  }
}`,...(T=(y=n.parameters)==null?void 0:y.docs)==null?void 0:T.source}}};var j,q,E;d.parameters={...d.parameters,docs:{...(j=d.parameters)==null?void 0:j.docs,source:{originalSource:`{
  render: () => <Textarea label="Test Script" placeholder="user: Hello\\nassistant: (should greet)" rows={4} />
}`,...(E=(q=d.parameters)==null?void 0:q.docs)==null?void 0:E.source}}};var I,_,w;i.parameters={...i.parameters,docs:{...(I=i.parameters)==null?void 0:I.docs,source:{originalSource:`{
  render: () => <Textarea label="JSON Body" value="{ invalid json }" error="Invalid JSON format" rows={3} />
}`,...(w=(_=i.parameters)==null?void 0:_.docs)==null?void 0:w.source}}};const D=["Default","Required","WithError","Disabled","TextareaVariant","TextareaWithError"];export{t as Default,n as Disabled,l as Required,d as TextareaVariant,i as TextareaWithError,o as WithError,D as __namedExportsOrder,A as default};
