import React, { useState, useEffect } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

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
      <Select value={gender} onValueChange={setGender}>
        <SelectTrigger className="h-7 w-auto min-w-[64px] px-2 text-xs gap-1 bg-secondary/50 border-border/40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Men's">Men's</SelectItem>
          <SelectItem value="Women's">Women's</SelectItem>
          <SelectItem value="Unisex">Unisex</SelectItem>
        </SelectContent>
      </Select>
      {sizes.length > 0 && (
        <Select value={size} onValueChange={setSize}>
          <SelectTrigger className="h-7 w-auto min-w-[48px] px-2 text-xs gap-1 bg-secondary/50 border-border/40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sizes.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {colors.length > 0 && (
        <Select value={color} onValueChange={setColor}>
          <SelectTrigger className="h-7 w-auto min-w-[64px] px-2 text-xs gap-1 bg-secondary/50 border-border/40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {colors.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}