import React from 'react';
import { motion } from 'framer-motion';
import { Maximize2 } from 'lucide-react';
import AddToCartButton from './AddToCartButton';
import StockBadge from './StockBadge';
import { getImages, getGallery } from '@/lib/productMedia';

export default function FeaturedCard({ product, onAdd, onOpenFocus }) {
  const onSale = product.original_price && product.original_price > product.price;
  const inStock = (product.stock ?? 0) > 0;
  const images = getImages(product);
  const gallery = getGallery(product);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-primary/30 bg-card/50 p-4 space-y-3 text-center">
      {onSale ? (
        <div className="flex justify-center gap-8 text-xs font-heading uppercase tracking-wider">
          <div>
            <p className="text-muted-foreground">Original Price=</p>
            <p className="line-through text-muted-foreground font-mono">${product.original_price.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-green-400">Discounted Price=</p>
            <p className="text-green-400 font-mono font-bold">${product.price.toFixed(2)}</p>
          </div>
        </div>
      ) : (
        <p className="text-lg font-heading text-primary">${product.price?.toFixed(2)}</p>
      )}
      <h3 className="font-heading text-lg text-foreground uppercase tracking-wide">{product.name}</h3>
      <div className="max-w-md mx-auto space-y-1 text-center">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Pictures/Video</p>
        <button type="button" onClick={() => onOpenFocus?.(product)} className="relative w-full h-56 bg-secondary/20 overflow-hidden rounded-xl flex items-center justify-center">
          {images[0] ? (
            <img src={images[0]} alt={product.name} className="w-full h-full object-contain" />
          ) : (
            <span className="text-muted-foreground/40 text-sm">No image</span>
          )}
          {gallery.length > 1 && (
            <span className="absolute bottom-2 right-2 bg-black/60 rounded-full p-1.5">
              <Maximize2 className="w-4 h-4 text-white" />
            </span>
          )}
        </button>
      </div>
      {product.description && <p className="text-sm text-muted-foreground max-w-md mx-auto">{product.description}</p>}
      <div className="flex items-center justify-center gap-3">
        <AddToCartButton onAdd={() => onAdd(product)} label="Add to Cart" flash size="md" />
        <StockBadge inStock={inStock} />
      </div>
    </motion.div>
  );
}