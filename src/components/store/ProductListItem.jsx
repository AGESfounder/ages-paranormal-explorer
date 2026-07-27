import React from 'react';
import { motion } from 'framer-motion';
import AddToCartButton from './AddToCartButton';

export default function ProductListItem({ product, onAdd, index }) {
  const inStock = (product.stock ?? 0) > 0;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }} className="flex gap-3 p-3 rounded-xl border border-border/40 bg-card/40">
      <div className="w-20 h-20 rounded-lg bg-secondary/30 overflow-hidden shrink-0">
        {product.image_url ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" /> : null}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-medium text-foreground">{product.name}</p>
        {product.description && <p className="text-[11px] text-muted-foreground line-clamp-2">{product.description}</p>}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-heading text-primary">${product.price?.toFixed(2)}</span>
            <AddToCartButton onAdd={() => onAdd(product)} disabled={!inStock} />
          </div>
          <span className={`text-[10px] font-heading uppercase tracking-wider px-2 py-0.5 rounded-full border ${inStock ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-destructive border-destructive/30 bg-destructive/10'}`}>
            {inStock ? 'In Stock' : 'Out of Stock'}
          </span>
        </div>
      </div>
    </motion.div>
  );
}