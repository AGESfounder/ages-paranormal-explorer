import React from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart } from 'lucide-react';

export default function AddToCartButton({ onAdd, flash = false, label = 'Add to Cart', size = 'sm', disabled = false, className = '' }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      animate={flash ? { opacity: [0.7, 1, 0.7], scale: [1, 1.04, 1] } : {}}
      transition={flash ? { repeat: Infinity, duration: 1.3 } : {}}
      onClick={onAdd}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-heading uppercase tracking-wider bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors ${size === 'sm' ? 'text-[10px] px-2.5 py-1.5' : 'text-xs px-3 py-2'} ${className}`}
    >
      <ShoppingCart className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      {label}{flash ? '!' : ''}
    </motion.button>
  );
}