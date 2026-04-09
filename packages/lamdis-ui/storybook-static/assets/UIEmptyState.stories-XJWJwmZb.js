import{j as e}from"./jsx-runtime-EKYJJIwR.js";import{o as N,p as b}from"./index--eguXucd.js";import"./index-JhL3uwfD.js";function x({icon:i,title:y,description:f,action:t,className:h=""}){return e.jsxs("div",{className:`border border-slate-700 rounded-xl bg-slate-900/50 p-12 text-center ${h}`,children:[i&&e.jsx("div",{className:"mx-auto text-4xl text-slate-600 mb-4",children:i}),e.jsx("h3",{className:"text-slate-300 font-medium mb-2",children:y}),e.jsx("p",{className:"text-slate-500 text-sm mb-4 max-w-md mx-auto",children:f}),t&&e.jsxs("button",{onClick:t.onClick,className:"inline-flex items-center gap-2 px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg transition",children:[t.icon,t.label]})]})}x.__docgenInfo={description:"",methods:[],displayName:"EmptyState",props:{icon:{required:!1,tsType:{name:"ReactReactNode",raw:"React.ReactNode"},description:""},title:{required:!0,tsType:{name:"string"},description:""},description:{required:!0,tsType:{name:"string"},description:""},action:{required:!1,tsType:{name:"signature",type:"object",raw:`{\r
  label: string;\r
  onClick: () => void;\r
  icon?: React.ReactNode;\r
}`,signature:{properties:[{key:"label",value:{name:"string",required:!0}},{key:"onClick",value:{name:"signature",type:"function",raw:"() => void",signature:{arguments:[],return:{name:"void"}},required:!0}},{key:"icon",value:{name:"ReactReactNode",raw:"React.ReactNode",required:!1}}]}},description:""},className:{required:!1,tsType:{name:"string"},description:"",defaultValue:{value:"''",computed:!1}}}};const R={title:"UI/EmptyState",component:x,tags:["autodocs"]},s={args:{title:"No test suites",description:"Create your first test suite to start testing your AI assistant."}},r={args:{icon:e.jsx(b,{className:"w-8 h-8"}),title:"Inbox is empty",description:"No new evidence submissions to review."}},a={args:{icon:e.jsx(N,{className:"w-8 h-8"}),title:"No results found",description:"Try adjusting your search or filter criteria.",action:{label:"Clear Filters",onClick:()=>alert("Filters cleared")}}};var o,n,c;s.parameters={...s.parameters,docs:{...(o=s.parameters)==null?void 0:o.docs,source:{originalSource:`{
  args: {
    title: 'No test suites',
    description: 'Create your first test suite to start testing your AI assistant.'
  }
}`,...(c=(n=s.parameters)==null?void 0:n.docs)==null?void 0:c.source}}};var l,d,u;r.parameters={...r.parameters,docs:{...(l=r.parameters)==null?void 0:l.docs,source:{originalSource:`{
  args: {
    icon: <FiInbox className="w-8 h-8" />,
    title: 'Inbox is empty',
    description: 'No new evidence submissions to review.'
  }
}`,...(u=(d=r.parameters)==null?void 0:d.docs)==null?void 0:u.source}}};var m,p,g;a.parameters={...a.parameters,docs:{...(m=a.parameters)==null?void 0:m.docs,source:{originalSource:`{
  args: {
    icon: <FiSearch className="w-8 h-8" />,
    title: 'No results found',
    description: 'Try adjusting your search or filter criteria.',
    action: {
      label: 'Clear Filters',
      onClick: () => alert('Filters cleared')
    }
  }
}`,...(g=(p=a.parameters)==null?void 0:p.docs)==null?void 0:g.source}}};const C=["Default","WithIcon","WithAction"];export{s as Default,a as WithAction,r as WithIcon,C as __namedExportsOrder,R as default};
