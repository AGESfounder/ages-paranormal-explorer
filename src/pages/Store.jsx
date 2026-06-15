import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShoppingCart, Plus, Minus, Trash2, Loader2, Package, CreditCard, Check } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const categoryLabel = {
  equipment: 'Equipment',
  apparel: 'Apparel',
  books: 'Books',
  accessories: 'Accessories',
};

export default function Store() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);

  useEffect(() => {
    base44.entities.Product.list().then(p => { setProducts(p); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setOrderPlaced(true);
      setCart([]);
      window.history.replaceState({}, '', '/store');
    }
  }, []);

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: product.id, name: product.name, price: product.price, quantity: 1 }];
    });
  };

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(i => i.product_id !== productId));
  };

  const updateQuantity = (productId, delta) => {
    setCart(prev => {
      return prev.map(i => {
        if (i.product_id !== productId) return i;
        const newQty = i.quantity + delta;
        if (newQty <= 0) return null;
        return { ...i, quantity: newQty };
      }).filter(Boolean);
    });
  };

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const checkout = async () => {
    if (cart.length === 0) return;
    setCheckingOut(true);
    try {
      const res = await base44.functions.invoke('create-checkout', { items: cart });
      if (res.data?.url) window.location.href = res.data.url;
    } catch (e) { /* */ }
    setCheckingOut(false);
  };

  const filteredProducts = selectedCategory
    ? products.filter(p => p.category === selectedCategory)
    : products;

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

  if (orderPlaced) {
    return (
      <PageContainer>
        <SectionHeader title="Store" showBack onBack={() => setOrderPlaced(false)} />
        <div className="flex flex-col items-center justify-center px-6 pt-20 pb-28 gap-4">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
            <Check className="w-16 h-16 text-green-400" />
          </motion.div>
          <h2 className="font-heading text-lg text-foreground tracking-wider uppercase">Order Placed!</h2>
          <p className="text-sm text-muted-foreground text-center">Thank you for your purchase. You'll receive a confirmation email shortly.</p>
          <Link to="/store" className="text-primary text-sm font-heading uppercase tracking-wider" onClick={() => setOrderPlaced(false)}>Continue Shopping</Link>
        </div>
        <NavBar />
      </PageContainer>
    );
  }

  if (showCart) {
    return (
      <PageContainer>
        <SectionHeader title="Your Cart" subtitle={`${cart.length} item${cart.length !== 1 ? 's' : ''}`} showBack onBack={() => setShowCart(false)} />
        <div className="px-4 pb-28 space-y-3 pt-3">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <Package className="w-12 h-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground font-heading uppercase tracking-wider">Your cart is empty</p>
              <Button onClick={() => setShowCart(false)} variant="outline" size="sm" className="text-xs">Browse Products</Button>
            </div>
          ) : (
            <>
              {cart.map((item) => (
                <div key={item.product_id} className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-card/40">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                    <p className="text-xs text-primary">${item.price.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateQuantity(item.product_id, -1)} className="p-1 rounded text-muted-foreground hover:text-foreground"><Minus className="w-3.5 h-3.5" /></button>
                    <span className="text-sm font-mono w-6 text-center">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.product_id, 1)} className="p-1 rounded text-muted-foreground hover:text-foreground"><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                  <button onClick={() => removeFromCart(item.product_id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3 mt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground font-mono">${cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className="text-green-400 text-xs">Calculated at checkout</span>
                </div>
                <div className="border-t border-border/40 pt-2 flex justify-between">
                  <span className="font-heading text-xs uppercase tracking-wider text-foreground">Total</span>
                  <span className="font-heading text-lg text-primary">${cartTotal.toFixed(2)}</span>
                </div>
                <Button onClick={checkout} disabled={checkingOut} className="w-full gap-2">
                  {checkingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                  Pay with Card
                </Button>
              </div>
            </>
          )}
        </div>
        <NavBar />
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer>
        <SectionHeader title="Store" subtitle="Ghost Hunting Gear" showBack />
        <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        <NavBar />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SectionHeader
        title="A.G.E.S. Store"
        subtitle="Ghost Hunting Gear & Apparel"
        showBack
        rightAction={
          <button onClick={() => setShowCart(true)} className="relative p-2">
            <ShoppingCart className="w-5 h-5 text-primary" />
            {cart.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">{cart.reduce((s, i) => s + i.quantity, 0)}</span>
            )}
          </button>
        }
      />

      <div className="px-4 pb-28 space-y-4 pt-3">
        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setSelectedCategory(null)} className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-heading uppercase tracking-wider border transition-colors ${!selectedCategory ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border/40 text-muted-foreground hover:text-foreground'}`}>All</button>
            {categories.map(cat => (
              <button key={cat} onClick={() => setSelectedCategory(cat)} className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-heading uppercase tracking-wider border transition-colors ${selectedCategory === cat ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border/40 text-muted-foreground hover:text-foreground'}`}>{categoryLabel[cat] || cat}</button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {filteredProducts.map((product, i) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="rounded-xl border border-border/40 bg-card/40 overflow-hidden hover:border-primary/30 transition-all group"
            >
              {product.image_url && (
                <div className="aspect-square bg-secondary/30 overflow-hidden">
                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
              )}
              <div className="p-3 space-y-2">
                <div>
                  <p className="text-xs font-medium text-foreground leading-tight line-clamp-2">{product.name}</p>
                  {product.description && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{product.description}</p>}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-heading text-primary">${product.price.toFixed(2)}</span>
                  <button onClick={() => addToCart(product)} className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div className="flex flex-col items-center py-16 gap-3">
            <Package className="w-12 h-12 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground font-heading uppercase tracking-wider">No products yet</p>
          </div>
        )}
      </div>
      <NavBar />
    </PageContainer>
  );
}