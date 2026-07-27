import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { useCart } from './CartContext';

export default function CartButton() {
  const { cartCount, setCartOpen } = useCart();
  return (
    <button onClick={() => setCartOpen(true)} className="relative p-2">
      <ShoppingCart className="w-5 h-5 text-primary" />
      {cartCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">{cartCount}</span>
      )}
    </button>
  );
}