import React from 'react';

export function Progress({ value = 0, className = '' }) {
  return (
    <div className={`w-full overflow-hidden rounded-full bg-slate-200 ${className}`}>
      <div
        className="h-full rounded-full bg-[#5B7FED] transition-all"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}