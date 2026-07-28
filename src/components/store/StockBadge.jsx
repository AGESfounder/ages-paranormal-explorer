import React from 'react';

export default function StockBadge({ inStock }) {
  return (
    <span className={`text-[10px] font-heading uppercase tracking-wider px-3 py-1 rounded-md border text-center leading-tight ${inStock ? 'text-green-400 border-green-500/50 bg-green-500/20' : 'text-destructive border-destructive/50 bg-destructive/20'}`}>
      <span className="block">{inStock ? 'In' : 'Out of'}</span>
      <span className="block">Stock</span>
    </span>
  );
}