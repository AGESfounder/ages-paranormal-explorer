import React from 'react';
import { motion } from 'framer-motion';
import AddToCartButton from './AddToCartButton';

export default function FeaturedCard({ product, onAdd }) {
  const onSale = product.original_price && product.original_price > product.price;
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
      {product.image_url && (
        <div className="h-56 bg-secondary/20 overflow-hidden rounded-xl max-w-md mx-auto flex items-center justify-center">
          <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" />
        </div>
      )}
      {product.video_url && (
        <div className="max-w-md mx-auto rounded-xl overflow-hidden">
          <video src={product.video_url} controls className="w-full max-h-64 bg-black" />
        </div>
      )}
      {product.description && <p className="text-sm text-muted-foreground max-w-md mx-auto">{product.description}</p>}
      <AddToCartButton onAdd={() => onAdd(product)} label="Add to Cart" flash size="md" />
    </motion.div>
  );
}