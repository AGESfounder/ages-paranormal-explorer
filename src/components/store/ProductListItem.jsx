import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import AddToCartButton from './AddToCartButton';

const genderLabels = { men: "Men's", women: "Women's", unisex: 'Unisex' };

export default function ProductListItem({ product, onAdd, index }) {
  const inStock = (product.stock ?? 0) > 0;
  const isApparel = product.category === 'apparel';
  const sizes = product.sizes || [];
  const colors = product.colors || [];
  const [gender, setGender] = useState(genderLabels[product.gender] || 'Unisex');
  const [size, setSize] = useState(sizes[0] || '');
  const [color, setColor] = useState(colors[0] || '');

  const handleAdd = () => {
    let variant = '';
    if (isApparel) {
      const parts = [gender, size, color].filter(Boolean);
      if (parts.length) variant = parts.join(' / ');
    }
    onAdd(product, variant || undefined);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }} className="flex gap-3 p-3 rounded-xl border border-border/40 bg-card/40">
      <div className="w-20 h-20 rounded-lg bg-secondary/30 overflow-hidden shrink-0 relative">
        {product.image_url ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" /> : null}
        {product.video_url && (
          <span className="absolute bottom-0.5 right-0.5 bg-black/60 rounded-full p-0.5">
            <Play className="w-3 h-3 text-white" />
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-medium text-foreground">{product.name}</p>
        {isApparel && product.gender && (
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{genderLabels[product.gender] || product.gender}</span>
        )}
        {product.description && <p className="text-[11px] text-muted-foreground line-clamp-2">{product.description}</p>}
        {isApparel && (sizes.length > 0 || colors.length > 0) && (
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
        )}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-heading text-primary">${product.price?.toFixed(2)}</span>
            <AddToCartButton onAdd={handleAdd} disabled={!inStock} />
          </div>
          <span className={`text-[10px] font-heading uppercase tracking-wider px-2 py-0.5 rounded-full border ${inStock ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-destructive border-destructive/30 bg-destructive/10'}`}>
            {inStock ? 'In Stock' : 'Out of Stock'}
          </span>
        </div>
      </div>
    </motion.div>
  );
}