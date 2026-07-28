import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import ApparelOptions from './ApparelOptions';
import { getGallery } from '@/lib/productMedia';

const genderLabels = { men: "Men's", women: "Women's", unisex: 'Unisex' };

export default function ProductDetailDialog({ product, onClose, onAdd }) {
  const open = !!product;
  const gallery = product ? getGallery(product) : [];
  const [idx, setIdx] = useState(0);
  const [variant, setVariant] = useState('');

  useEffect(() => { setIdx(0); setVariant(''); }, [product]);

  if (!product) return null;
  const onSale = product.original_price && product.original_price > product.price;
  const inStock = (product.stock ?? 0) > 0;
  const current = gallery[idx];

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogTitle className="font-heading uppercase tracking-wide text-foreground">{product.name}</DialogTitle>
        <div className="space-y-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pictures/Videos</p>
          <div className="rounded-xl overflow-hidden bg-black h-64 flex items-center justify-center">
            {current?.type === 'video' ? (
              <video src={current.url} controls autoPlay className="w-full h-full object-contain" />
            ) : current ? (
              <img src={current.url} alt={product.name} className="w-full h-full object-contain" />
            ) : (
              <span className="text-muted-foreground text-sm">No media</span>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {gallery.map((m, i) => (
                <button key={i} onClick={() => setIdx(i)} className={`shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 ${i === idx ? 'border-primary' : 'border-transparent'}`}>
                  {m.type === 'video' ? (
                    <video src={m.url} className="w-full h-full object-contain bg-black" muted />
                  ) : (
                    <img src={m.url} alt="" className="w-full h-full object-contain bg-secondary/30" />
                  )}
                </button>
              ))}
            </div>
          )}

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
            <p className="text-center font-heading text-primary text-lg">${product.price?.toFixed(2)}</p>
          )}

          {product.category === 'apparel' && product.gender && (
            <p className="text-center text-xs text-muted-foreground uppercase tracking-wider">{genderLabels[product.gender] || product.gender}</p>
          )}

          {product.description && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{product.description}</p>
          )}

          <ApparelOptions product={product} onChange={setVariant} />

          <div className="flex items-center gap-3">
            <Button onClick={() => { onAdd(product, variant || undefined); onClose(); }} className="flex-1">
              Add to Cart
            </Button>
            <span className={`text-[10px] font-heading uppercase tracking-wider px-3 py-1 rounded-full border ${inStock ? 'text-green-400 border-green-500/50 bg-green-500/20' : 'text-destructive border-destructive/50 bg-destructive/20'}`}>
              {inStock ? 'In Stock' : 'Out of Stock'}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}