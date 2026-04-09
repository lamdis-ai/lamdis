import{j as e}from"./jsx-runtime-EKYJJIwR.js";import{B as p}from"./Button-DNoIW74i.js";import{C as l}from"./Card-DvU04I-y.js";function r({connector:n}){return e.jsxs(l,{children:[e.jsx("div",{className:"font-medium",children:n.name}),e.jsx("div",{className:"text-xs text-gray-600",children:n.category}),e.jsx("p",{className:"text-sm mt-2",children:n.description}),e.jsx("form",{action:`/api/install/${n.key}`,method:"post",children:e.jsx(p,{className:"mt-3",children:"Install"})})]})}r.__docgenInfo={description:"",methods:[],displayName:"ConnectorCard",props:{connector:{required:!0,tsType:{name:"signature",type:"object",raw:"{ key: string; name: string; category: string; description?: string }",signature:{properties:[{key:"key",value:{name:"string",required:!0}},{key:"name",value:{name:"string",required:!0}},{key:"category",value:{name:"string",required:!0}},{key:"description",value:{name:"string",required:!1}}]}},description:""}}};const k={title:"UI/ConnectorCard",component:r,tags:["autodocs"]},o={args:{connector:{key:"zendesk",name:"Zendesk",category:"Support",description:"Connect your Zendesk instance to monitor support conversations."}}},t={render:()=>e.jsxs("div",{className:"grid grid-cols-2 gap-4 max-w-2xl",children:[e.jsx(r,{connector:{key:"zendesk",name:"Zendesk",category:"Support",description:"Monitor support conversations"}}),e.jsx(r,{connector:{key:"intercom",name:"Intercom",category:"Chat",description:"Track Intercom chat sessions"}}),e.jsx(r,{connector:{key:"salesforce",name:"Salesforce",category:"CRM",description:"Integrate with Salesforce Service Cloud"}}),e.jsx(r,{connector:{key:"slack",name:"Slack",category:"Messaging",description:"Monitor AI bot conversations in Slack"}})]})};var s,a,c;o.parameters={...o.parameters,docs:{...(s=o.parameters)==null?void 0:s.docs,source:{originalSource:`{
  args: {
    connector: {
      key: 'zendesk',
      name: 'Zendesk',
      category: 'Support',
      description: 'Connect your Zendesk instance to monitor support conversations.'
    }
  }
}`,...(c=(a=o.parameters)==null?void 0:a.docs)==null?void 0:c.source}}};var i,d,m;t.parameters={...t.parameters,docs:{...(i=t.parameters)==null?void 0:i.docs,source:{originalSource:`{
  render: () => <div className="grid grid-cols-2 gap-4 max-w-2xl">\r
      <ConnectorCard connector={{
      key: 'zendesk',
      name: 'Zendesk',
      category: 'Support',
      description: 'Monitor support conversations'
    }} />\r
      <ConnectorCard connector={{
      key: 'intercom',
      name: 'Intercom',
      category: 'Chat',
      description: 'Track Intercom chat sessions'
    }} />\r
      <ConnectorCard connector={{
      key: 'salesforce',
      name: 'Salesforce',
      category: 'CRM',
      description: 'Integrate with Salesforce Service Cloud'
    }} />\r
      <ConnectorCard connector={{
      key: 'slack',
      name: 'Slack',
      category: 'Messaging',
      description: 'Monitor AI bot conversations in Slack'
    }} />\r
    </div>
}`,...(m=(d=t.parameters)==null?void 0:d.docs)==null?void 0:m.source}}};const C=["Default","Multiple"];export{o as Default,t as Multiple,C as __namedExportsOrder,k as default};
