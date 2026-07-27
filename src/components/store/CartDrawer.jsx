import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, Trash2, Loader2, CreditCard, Package, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from './CartContext';
import BePatient from '@/components/BePatient';

export default function CartDrawer() {
  const { cart, cartOpen, setCartOpen, removeFromCart, updateQuantity, cartTotal, checkout, checkoutLoading } = useCart();

  return (
    <AnimatePresence>
      {cartOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCartOpen(false)} className="fixed inset-0 bg-black/60 z-[60]" />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-sm bg-card border-l border-border z-[70] flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b border-border/40">
              <h2 className="font-heading text-sm uppercase tracking-wider text-foreground">Your Cart ({cart.length})</h2>
              <button onClick={() => setCartOpen(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center py-16 gap-3">
                  <Package className="w-12 h-12 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground font-heading uppercase tracking-wider">Your cart is empty</p>
                </div>
              ) : cart.map(item => (
                <div key={item.key} className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-secondary/20">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                    <p className="text-xs text-primary">${item.price.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateQuantity(item.key, -1)} className="p-1 rounded text-muted-foreground hover:text-foreground"><Minus className="w-3.5 h-3.5" /></button>
                    <span className="text-sm font-mono w-6 text-center">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.key, 1)} className="p-1 rounded text-muted-foreground hover:text-foreground"><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                  <button onClick={() => removeFromCart(item.key)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>

            {cart.length > 0 && (
              <div className="p-4 border-t border-border/40 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-heading text-lg text-primary">${cartTotal.toFixed(2)}</span>
                </div>
                <Button onClick={checkout} disabled={checkoutLoading} className="w-full gap-2">
                  {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                  {checkoutLoading ? <BePatient /> : 'Pay with Card'}
                </Button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}