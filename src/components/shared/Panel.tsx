import React from "react";

interface PanelProps {
  children: React.ReactNode;
  className?: string;
}

export function Panel({ children, className = "" }: PanelProps) {
  return (
    <div
      className={`bg-bg-panel border border-border rounded-[var(--radius-panel)] ${className}`}
    >
      {children}
    </div>
  );
}
