import React from 'react';

export function Input({ className = '', ...props }) {
  return (
    <input
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#5B7FED] focus:ring-2 focus:ring-[#5B7FED]/20 ${className}`}
      {...props}
    />
  );
}