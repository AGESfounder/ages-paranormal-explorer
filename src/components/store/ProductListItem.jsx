import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Maximize2 } from 'lucide-react';
import AddToCartButton from './AddToCartButton';
import ApparelOptions from './ApparelOptions';
import { getImages, getGallery } from '@/lib/productMedia';

const genderLabels = { men: "Men's", women: "Women's", unisex: 'Unisex' };

export default function ProductListItem({ product, onAdd, onOpenFocus, index }) {
  const inStock = (product.stock ?? 0) > 0;
  const [variant, setVariant] = useState('');
  const images = getImages(product);
  const gallery = getGallery(product);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }} className="flex gap-3 p-3 rounded-xl border border-border/40 bg-card/40">
      <div className="shrink-0 space-y-1">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Pictures/Videos</p>
        <button type="button" onClick={() => onOpenFocus?.(product)} className="relative block w-20 h-20 rounded-lg bg-secondary/30 overflow-hidden">
          {images[0] ? (
            <img src={images[0]} alt={product.name} className="w-full h-full object-contain" />
          ) : (
            <span className="flex items-center justify-center w-full h-full text-muted-foreground/40 text-[10px]">No image</span>
          )}
          {gallery.length > 1 && (
            <span className="absolute bottom-0.5 right-0.5 bg-black/60 rounded-full p-0.5">
              <Maximize2 className="w-3 h-3 text-white" />
            </span>
          )}
        </button>
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <button type="button" onClick={() => onOpenFocus?.(product)} className="text-left block">
          <p className="text-sm font-medium text-foreground hover:text-primary transition-colors">{product.name}</p>
        </button>
        {product.category === 'apparel' && product.gender && (
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{genderLabels[product.gender] || product.gender}</span>
        )}
        {product.description && <p className="text-[11px] text-muted-foreground line-clamp-2">{product.description}</p>}
        <ApparelOptions product={product} onChange={setVariant} />
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-heading text-primary">${product.price?.toFixed(2)}</span>
            <AddToCartButton onAdd={() => onAdd(product, variant || undefined)} disabled={!inStock} />
          </div>
          <span className={`text-[10px] font-heading uppercase tracking-wider px-2 py-0.5 rounded-full border ${inStock ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-destructive border-destructive/30 bg-destructive/10'}`}>
            {inStock ? 'In Stock' : 'Out of Stock'}
          </span>
        </div>
      </div>
    </motion.div>
  );
}