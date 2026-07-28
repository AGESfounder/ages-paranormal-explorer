import React, { useState, useEffect } from 'react';

const genderLabels = { men: "Men's", women: "Women's", unisex: 'Unisex' };

export default function ApparelOptions({ product, onChange }) {
  const isApparel = product.category === 'apparel';
  const sizes = product.sizes || [];
  const colors = product.colors || [];
  const [gender, setGender] = useState(genderLabels[product.gender] || 'Unisex');
  const [size, setSize] = useState(sizes[0] || '');
  const [color, setColor] = useState(colors[0] || '');

  useEffect(() => {
    if (!isApparel) { onChange(''); return; }
    const parts = [gender, size, color].filter(Boolean);
    onChange(parts.length ? parts.join(' / ') : '');
  }, [gender, size, color, isApparel, onChange]);

  if (!isApparel) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      <select value={gender} onChange={e => setGender(e.target.value)} className="text-[10px] bg-secondary/50 border border-border/40 rounded px-1.5 py-1 text-foreground">
        <option>Men's</option>
        <option>Women's</option>
        <option>Unisex</option>
      </select>
      {sizes.length > 0 && (
        <select value={size} onChange={e => setSize(e.target.value)} className="text-[10px] bg-secondary/50 border border-border/40 rounded px-1.5 py-1 text-foreground">
          {sizes.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {colors.length > 0 && (
        <select value={color} onChange={e => setColor(e.target.value)} className="text-[10px] bg-secondary/50 border border-border/40 rounded px-1.5 py-1 text-foreground">
          {colors.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
    </div>
  );
}