import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const CartContext = createContext(null);
const STORAGE_KEY = 'ages_cart';
const ADDR_KEY = 'ages_shipping_address';

const emptyAddress = { name: '', street: '', city: '', state: '', zip: '' };

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [shippingAddress, setShippingAddress] = useState(() => {
    try { return { ...emptyAddress, ...(JSON.parse(localStorage.getItem(ADDR_KEY) || '{}')) }; } catch { return { ...emptyAddress }; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch { /* */ }
  }, [cart]);

  useEffect(() => {
    try { localStorage.setItem(ADDR_KEY, JSON.stringify(shippingAddress)); } catch { /* */ }
  }, [shippingAddress]);

  const addToCart = useCallback((product, variant) => {
    const variantLabel = variant || '';
    const key = product.id + (variantLabel ? `__${variantLabel}` : '');
    setCart(prev => {
      const existing = prev.find(i => i.key === key);
      if (existing) return prev.map(i => i.key === key ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, {
        key,
        product_id: product.id,
        name: variantLabel ? `${product.name} — ${variantLabel}` : product.name,
        price: product.price,
        quantity: 1,
        weight_oz: product.weight_oz,
        length_in: product.length_in,
        width_in: product.width_in,
        height_in: product.height_in,
      }];
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
    const missing = ['name', 'street', 'city', 'state', 'zip'].find(k => !shippingAddress?.[k]);
    if (missing) { setCheckoutError('Please enter your full shipping address.'); return; }
    setCheckoutLoading(true);
    setCheckoutError('');
    try {
      const res = await base44.functions.invoke('create-checkout', { items: cart, shipping: shippingAddress });
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else if (res.data?.error) {
        setCheckoutError(res.data.error);
      }
    } catch (e) {
      setCheckoutError(e?.response?.data?.error || e?.message || 'Checkout failed. Please try again.');
    }
    setCheckoutLoading(false);
  }, [cart, shippingAddress]);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, cartTotal, cartCount, cartOpen, setCartOpen, checkout, checkoutLoading, checkoutError, setCheckoutError, shippingAddress, setShippingAddress }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}