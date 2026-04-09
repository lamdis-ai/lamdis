"use client";
import React from 'react';
import { Input, InputProps } from './Input';

export interface SearchInputProps extends Omit<InputProps,'type'> {
  onClear?: () => void;
}

const SearchInput: React.FC<SearchInputProps> = ({ className='', onClear, value, ...rest }) => {
  return (
    <div className={`relative group ${className}`}>
      <div className="pointer-events-none absolute inset-0 rounded-md border border-slate-700/60 bg-slate-900/40 group-hover:border-slate-600/60 transition-colors" />
      <div className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 group-hover:text-slate-300">
        <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="m21.53 20.47l-3.66-3.66A8.93 8.93 0 0 0 19 11a9 9 0 1 0-9 9a8.93 8.93 0 0 0 5.81-2.13l3.66 3.66zM4 11a7 7 0 1 1 7 7a7 7 0 0 1-7-7"/></svg>
      </div>
      <Input
        type="text"
        value={value as any}
        {...rest}
        className="pl-8 pr-7 py-2 w-full rounded-md border-none bg-transparent focus:ring-2 focus:ring-fuchsia-500/40 text-sm text-slate-100 placeholder-slate-500"
      />
      {value && onClear && (
        <button type="button" onClick={onClear} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300 px-2 py-0.5 rounded">
          Clear
        </button>
      )}
    </div>
  );
};

export default SearchInput;
