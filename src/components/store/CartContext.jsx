import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const CartContext = createContext(null);
const STORAGE_KEY = 'ages_cart';

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch { /* */ }
  }, [cart]);

  const addToCart = useCallback((product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: product.id, name: product.name, price: product.price, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((productId) => {
    setCart(prev => prev.filter(i => i.product_id !== productId));
  }, []);

  const updateQuantity = useCallback((productId, delta) => {
    setCart(prev => prev.map(i => {
      if (i.product_id !== productId) return i;
      const q = i.quantity + delta;
      return q <= 0 ? null : { ...i, quantity: q };
    }).filter(Boolean));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const cartTotal = cart.reduce((s, i) => s + (i.price || 0) * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const checkout = useCallback(async () => {
    if (cart.length === 0) return;
    setCheckoutLoading(true);
    try {
      const res = await base44.functions.invoke('create-checkout', { items: cart });
      if (res.data?.url) window.location.href = res.data.url;
    } catch (e) { /* */ }
    setCheckoutLoading(false);
  }, [cart]);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, cartTotal, cartCount, cartOpen, setCartOpen, checkout, checkoutLoading }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}