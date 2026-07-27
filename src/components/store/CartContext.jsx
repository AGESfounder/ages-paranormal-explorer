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

  const addToCart = useCallback((product, variant) => {
    const variantLabel = variant || '';
    const key = product.id + (variantLabel ? `__${variantLabel}` : '');
    setCart(prev => {
      const existing = prev.find(i => i.key === key);
      if (existing) return prev.map(i => i.key === key ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { key, product_id: product.id, name: variantLabel ? `${product.name} — ${variantLabel}` : product.name, price: product.price, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((key) => {
    setCart(prev => prev.filter(i => i.key !== key));
  }, []);

  const updateQuantity = useCallback((key, delta) => {
    setCart(prev => prev.map(i => {
      if (i.key !== key) return i;
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