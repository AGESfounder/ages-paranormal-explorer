import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, Loader2, Package, Sparkles } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import CartButton from '../components/store/CartButton';
import FeaturedCard from '../components/store/FeaturedCard';
import ProductDetailDialog from '../components/store/ProductDetailDialog';
import { useCart } from '../components/store/CartContext';
import { categoryRoutes } from '@/lib/storeCategories';
import { base44 } from '@/api/base44Client';
import PullToRefresh from '@/components/PullToRefresh';
import { Button } from '@/components/ui/button';

export default function Store() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [focusProduct, setFocusProduct] = useState(null);
  const { addToCart, clearCart } = useCart();

  const loadProducts = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const p = await base44.entities.Product.list();
      setProducts(p);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadProducts(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setOrderPlaced(true);
      clearCart();
      window.history.replaceState({}, '', '/store');
    }
  }, [clearCart]);

  if (orderPlaced) {
    return (
      <PageContainer>
        <SectionHeader title="Store" showBack onBack={() => setOrderPlaced(false)} rightAction={<CartButton />} />
        <div className="flex flex-col items-center justify-center px-6 pt-20 pb-28 gap-4">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
            <Check className="w-16 h-16 text-green-400" />
          </motion.div>
          <h2 className="font-heading text-lg text-foreground tracking-wider uppercase">Order Placed!</h2>
          <p className="text-sm text-muted-foreground text-center">Thank you for your purchase. You'll receive a confirmation email shortly.</p>
          <Button onClick={() => setOrderPlaced(false)} variant="outline" size="sm" className="text-xs">Continue Shopping</Button>
        </div>
        <NavBar />
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer>
        <SectionHeader title="AGES Store" subtitle="Ghost Hunting Gear & Apparel" showBack rightAction={<CartButton />} />
        <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        <NavBar />
      </PageContainer>
    );
  }

  const featured = products.find(p => p.is_featured) || products.find(p => p.original_price && p.original_price > p.price) || null;

  return (
    <PageContainer>
      <SectionHeader title="AGES Store" subtitle="Ghost Hunting Gear & Apparel" showBack rightAction={<CartButton />} />
      <PullToRefresh onRefresh={() => loadProducts(false)}>
      <div className="px-4 pb-28 pt-3 space-y-6">
        {/* Category buttons */}
        <div className="grid grid-cols-3 gap-2">
          {categoryRoutes.map(c => (
            <Link key={c.value} to={c.path} className="block">
              <Button className="w-full font-heading uppercase tracking-wider text-xs">{c.label}</Button>
            </Link>
          ))}
        </div>

        {/* Featured Product of the Week */}
        <div className="text-center">
          <h2 className="font-heading text-sm uppercase tracking-wider text-primary flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4" /> Featured Product of the Week!
          </h2>
        </div>

        {/* SALE */}
        <motion.h2
          animate={{ scale: [1, 1.04, 1], opacity: [0.8, 1, 0.8] }}
          transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut' }}
          className="text-center font-display text-5xl text-green-400"
          style={{ textShadow: '0 0 16px rgba(74,222,128,0.6)' }}
        >
          SALE
        </motion.h2>

        {featured ? (
          <FeaturedCard product={featured} onAdd={addToCart} onOpenFocus={setFocusProduct} />
        ) : (
          <div className="flex flex-col items-center py-8 gap-3">
            <Package className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground font-heading uppercase tracking-wider">No featured product yet</p>
          </div>
        )}
      </div>
      </PullToRefresh>
      <ProductDetailDialog product={focusProduct} onClose={() => setFocusProduct(null)} onAdd={addToCart} />
      <NavBar />
    </PageContainer>
  );
}