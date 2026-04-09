"use client";
import { useEffect, useState } from 'react';

type FieldType = 'string'|'number'|'boolean'|'object'|'array';
type Field = { name: string; type: FieldType; required?: boolean; children?: Field[]; items?: FieldType };

function toJsonSchema(fields: Field[]): any {
  const properties: Record<string, any> = {};
  const required: string[] = [];
  for (const f of fields) {
    let schema: any = { type: f.type };
    if (f.type === 'object') {
      const child = toJsonSchema(f.children || []);
      schema = { type: 'object', properties: child.properties, ...(child.required?.length ? { required: child.required } : {}) };
    }
    if (f.type === 'array') {
      const itemType = f.items || 'string';
      if (itemType === 'object') {
        const child = toJsonSchema(f.children || []);
        schema = { type: 'array', items: { type: 'object', properties: child.properties, ...(child.required?.length ? { required: child.required } : {}) } };
      } else {
        schema = { type: 'array', items: { type: itemType } };
      }
    }
    properties[f.name] = schema;
    if (f.required) required.push(f.name);
  }
  const root: any = { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties };
  if (required.length) root.required = required;
  return root;
}

function fromJsonSchema(schema: any): Field[] {
  const props = schema?.properties && typeof schema.properties==='object' ? schema.properties : {};
  const req = Array.isArray(schema?.required) ? schema.required : [];
  const arr: Field[] = [];
  for (const key of Object.keys(props)) {
    const s = props[key] || {};
    const type = s.type || 'string';
    let children: Field[] | undefined;
    let items: FieldType | undefined;
    if (type === 'object') {
      children = fromJsonSchema(s);
    }
    if (type === 'array' && s.items) {
      items = s.items.type || 'string';
      if (items === 'object') {
        children = fromJsonSchema(s.items);
      }
    }
    arr.push({ name: key, type, required: req.includes(key), ...(children ? { children } : {}), ...(items ? { items } : {}) });
  }
  return arr;
}

export default function JsonSchemaBuilder({ value, onChange, variant = 'dark' }: { value?: any; onChange: (schema: any) => void; variant?: 'dark' | 'light'; }) {
  const [fields, setFields] = useState<Field[]>([]);
  useEffect(() => {
    if (value && typeof value === 'object') {
      try { setFields(fromJsonSchema(value)); } catch { /* ignore */ }
    }
  }, [value]);
  function addField() { setFields([...fields, { name: '', type: 'string', required: false }]); }
  function update(i: number, patch: Partial<Field>) { const next = [...fields]; next[i] = { ...next[i], ...patch }; setFields(next); onChange(toJsonSchema(next)); }
  function remove(i: number) { const next = fields.filter((_, idx) => idx !== i); setFields(next); onChange(toJsonSchema(next)); }
  const dark = variant === 'dark';
  const inputCls = dark ? 'border border-slate-700/60 rounded px-2 py-1 bg-slate-800/60 text-slate-100 placeholder-slate-500' : 'border border-slate-300 rounded px-2 py-1 bg-white text-slate-900';
  const selectCls = inputCls;
  const btnCls = dark ? 'px-2 py-1 border border-slate-700/60 rounded text-sm bg-slate-800/60 text-slate-200 hover:bg-slate-700/60 transition' : 'px-2 py-1 border border-slate-300 rounded text-sm bg-white text-slate-700 hover:bg-slate-50 transition';
  const removeCls = dark ? 'text-red-400 hover:text-red-300 text-sm' : 'text-red-600 hover:text-red-500 text-sm';
  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <div key={i} className="space-y-2">
          <div className="grid grid-cols-12 gap-2 items-center">
            <input className={`col-span-4 ${inputCls}`} placeholder="field name" value={f.name} onChange={e=>update(i,{name:e.target.value})} />
            <select className={`col-span-3 ${selectCls}`} value={f.type} onChange={e=>update(i,{type:e.target.value as any, ...(e.target.value === 'array' ? { items: 'string' } : {})})}>
              {['string','number','boolean','object','array'].map(t=> <option key={t} value={t}>{t}</option>)}
            </select>
            <label className="col-span-3 text-sm flex items-center"><input type="checkbox" checked={!!f.required} onChange={e=>update(i,{required:e.target.checked})} className="mr-2"/>Required</label>
            <button className={`col-span-2 ${removeCls}`} onClick={()=>remove(i)}>Remove</button>
          </div>
          {f.type === 'array' && (
            <div className="ml-4 pl-3 border-l border-slate-700/50 space-y-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>Items type:</span>
                <select className={`${selectCls} text-xs`} value={f.items || 'string'} onChange={e=>update(i,{items:e.target.value as FieldType})}>
                  {['string','number','boolean','object'].map(t=> <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {f.items === 'object' && (
                <NestedFields parentIndex={i} fields={fields} setFields={setFields} onChange={(fs)=>onChange(toJsonSchema(fs))} variant={variant} />
              )}
            </div>
          )}
          {f.type === 'object' && (
            <div className="ml-4 pl-3 border-l border-slate-700/50">
              <NestedFields parentIndex={i} fields={fields} setFields={setFields} onChange={(fs)=>onChange(toJsonSchema(fs))} variant={variant} />
            </div>
          )}
        </div>
      ))}
      <button className={btnCls} onClick={addField}>Add field</button>
    </div>
  );
}

function NestedFields({ parentIndex, fields, setFields, onChange, variant }: { parentIndex: number; fields: Field[]; setFields: (fs: Field[])=>void; onChange: (fs: Field[])=>void; variant?: 'dark'|'light' }) {
  const dark = variant === 'dark';
  const inputCls = dark ? 'border border-slate-700/60 rounded px-2 py-1 bg-slate-800/60 text-slate-100 placeholder-slate-500' : 'border border-slate-300 rounded px-2 py-1 bg-white text-slate-900';
  const selectCls = inputCls;
  const btnCls = dark ? 'px-2 py-1 border border-slate-700/60 rounded text-sm bg-slate-800/60 text-slate-200 hover:bg-slate-700/60 transition' : 'px-2 py-1 border border-slate-300 rounded text-sm bg-white text-slate-700 hover:bg-slate-50 transition';
  const removeCls = dark ? 'text-red-400 hover:text-red-300 text-sm' : 'text-red-600 hover:text-red-500 text-sm';
  const parent = fields[parentIndex];
  const childFields = parent.children || [];
  function addChild() {
    const next = [...fields];
    const parentNode = { ...next[parentIndex] } as Field;
    parentNode.children = [...(parentNode.children || []), { name: '', type: 'string', required: false }];
    next[parentIndex] = parentNode;
    setFields(next); onChange(next);
  }
  function updateChild(i: number, patch: Partial<Field>) {
    const next = [...fields];
    const parentNode = { ...next[parentIndex] } as Field;
    const kids = [...(parentNode.children || [])];
    kids[i] = { ...kids[i], ...patch } as Field;
    parentNode.children = kids;
    next[parentIndex] = parentNode;
    setFields(next); onChange(next);
  }
  function removeChild(i: number) {
    const next = [...fields];
    const parentNode = { ...next[parentIndex] } as Field;
    const kids = (parentNode.children || []).filter((_, idx) => idx !== i);
    parentNode.children = kids;
    next[parentIndex] = parentNode;
    setFields(next); onChange(next);
  }
  return (
    <div className="space-y-2">
      {childFields.map((cf, i) => (
        <div key={i} className="space-y-2">
          <div className="grid grid-cols-12 gap-2 items-center">
            <input className={`col-span-4 ${inputCls}`} placeholder="field name" value={cf.name} onChange={e=>updateChild(i,{name:e.target.value})} />
            <select className={`col-span-3 ${selectCls}`} value={cf.type} onChange={e=>updateChild(i,{type:e.target.value as any})}>
              {['string','number','boolean','object','array'].map(t=> <option key={t} value={t}>{t}</option>)}
            </select>
            <label className="col-span-3 text-sm flex items-center"><input type="checkbox" checked={!!cf.required} onChange={e=>updateChild(i,{required:e.target.checked})} className="mr-2"/>Required</label>
            <button className={`col-span-2 ${removeCls}`} onClick={()=>removeChild(i)}>Remove</button>
          </div>
          {cf.type === 'object' && (
            <div className="col-span-12 ml-4 pl-3 border-l border-slate-700/40">
              <NestedFields parentIndex={i} fields={childFields as any} setFields={(kids: Field[])=>{
                const next = [...fields];
                const parentNode = { ...next[parentIndex] } as Field;
                const newChild = [...(parentNode.children || [])];
                newChild[i] = { ...newChild[i], children: kids } as Field;
                parentNode.children = newChild;
                next[parentIndex] = parentNode;
                setFields(next); onChange(next);
              }} onChange={()=>{}} variant={variant} />
            </div>
          )}
        </div>
      ))}
      <button className={btnCls} onClick={addChild}>Add nested field</button>
    </div>
  );
}
