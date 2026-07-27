import React from 'react';
import { motion } from 'framer-motion';
import AddToCartButton from './AddToCartButton';

export default function FeaturedCard({ product, onAdd }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-primary/30 bg-card/50 overflow-hidden">
      {product.image_url && (
        <div className="aspect-video bg-secondary/30 overflow-hidden">
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-4 space-y-2 text-center">
        <h3 className="font-heading text-base text-foreground uppercase tracking-wide">{product.name}</h3>
        {product.description && <p className="text-xs text-muted-foreground">{product.description}</p>}
        <p className="text-lg font-heading text-primary">${product.price?.toFixed(2)}</p>
        <AddToCartButton onAdd={() => onAdd(product)} label="Add to Cart" />
      </div>
    </motion.div>
  );
}