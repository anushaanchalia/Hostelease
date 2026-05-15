import React, { createContext, useContext, useMemo, useState } from 'react';

const SelectContext = createContext(null);

export function Select({ value, onValueChange, children }) {
  const [open, setOpen] = useState(false);

  const contextValue = useMemo(
    () => ({ value, onValueChange, open, setOpen }),
    [value, onValueChange, open]
  );

  return (
    <SelectContext.Provider value={contextValue}>
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ className = '', children, ...props }) {
  const { open, setOpen } = useContext(SelectContext);

  return (
    <button
      type="button"
      className={`flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-all focus:border-[#5B7FED] focus:ring-2 focus:ring-[#5B7FED]/20 ${className}`}
      onClick={() => setOpen(!open)}
      {...props}
    >
      {children}
    </button>
  );
}

export function SelectValue({ placeholder = 'Select an option' }) {
  const { value } = useContext(SelectContext);
  return <span>{value || placeholder}</span>;
}

export function SelectContent({ className = '', children }) {
  const { open } = useContext(SelectContext);

  if (!open) return null;

  return (
    <div className={`absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white p-1 shadow-lg ${className}`}>
      {children}
    </div>
  );
}

export function SelectItem({ value, children }) {
  const { onValueChange, setOpen } = useContext(SelectContext);

  return (
    <div
      className="cursor-pointer rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
      onClick={() => {
        onValueChange(value);
        setOpen(false);
      }}
    >
      {children}
    </div>
  );
}