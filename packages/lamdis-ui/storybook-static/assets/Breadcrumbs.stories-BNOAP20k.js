import{j as s}from"./jsx-runtime-EKYJJIwR.js";const g=({href:r,children:l,...e})=>s.jsx("a",{href:r,...e,children:l});g.__docgenInfo={description:"",methods:[],displayName:"Link",props:{href:{required:!0,tsType:{name:"string"},description:""},children:{required:!0,tsType:{name:"ReactReactNode",raw:"React.ReactNode"},description:""}}};function w({items:r,className:l=""}){return s.jsx("nav",{className:`flex items-center text-xs ${l}`,"aria-label":"Breadcrumb",children:s.jsx("ol",{className:"flex items-center flex-wrap gap-1",children:r.map((e,o)=>{const c=o===r.length-1;return s.jsxs("li",{className:"flex items-center",children:[o>0&&s.jsx("svg",{className:"w-3 h-3 text-slate-600 mx-1.5 flex-shrink-0",fill:"none",viewBox:"0 0 24 24",stroke:"currentColor",strokeWidth:2,children:s.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M9 5l7 7-7 7"})}),e.href&&!c?s.jsx(g,{href:e.href,className:"text-slate-400 hover:text-slate-200 transition-colors truncate max-w-[200px]",title:e.label,children:e.label}):s.jsx("span",{className:`truncate max-w-[200px] ${c?"text-slate-200":"text-slate-400"}`,title:e.label,children:e.label})]},o)})})})}w.__docgenInfo={description:"",methods:[],displayName:"Breadcrumbs",props:{items:{required:!0,tsType:{name:"Array",elements:[{name:"BreadcrumbItem"}],raw:"BreadcrumbItem[]"},description:""},className:{required:!1,tsType:{name:"string"},description:"",defaultValue:{value:"''",computed:!1}}}};const N={title:"Base/Breadcrumbs",component:w,tags:["autodocs"]},a={args:{items:[{label:"Dashboard",href:"/"},{label:"Suites",href:"/suites"},{label:"Password Reset Flow"}]}},t={args:{items:[{label:"Suites",href:"/suites"},{label:"Run #42"}]}},n={args:{items:[{label:"Dashboard"}]}};var i,d,m;a.parameters={...a.parameters,docs:{...(i=a.parameters)==null?void 0:i.docs,source:{originalSource:`{
  args: {
    items: [{
      label: 'Dashboard',
      href: '/'
    }, {
      label: 'Suites',
      href: '/suites'
    }, {
      label: 'Password Reset Flow'
    }]
  }
}`,...(m=(d=a.parameters)==null?void 0:d.docs)==null?void 0:m.source}}};var u,p,h;t.parameters={...t.parameters,docs:{...(u=t.parameters)==null?void 0:u.docs,source:{originalSource:`{
  args: {
    items: [{
      label: 'Suites',
      href: '/suites'
    }, {
      label: 'Run #42'
    }]
  }
}`,...(h=(p=t.parameters)==null?void 0:p.docs)==null?void 0:h.source}}};var x,b,f;n.parameters={...n.parameters,docs:{...(x=n.parameters)==null?void 0:x.docs,source:{originalSource:`{
  args: {
    items: [{
      label: 'Dashboard'
    }]
  }
}`,...(f=(b=n.parameters)==null?void 0:b.docs)==null?void 0:f.source}}};const R=["Default","TwoLevels","SingleItem"];export{a as Default,n as SingleItem,t as TwoLevels,R as __namedExportsOrder,N as default};
