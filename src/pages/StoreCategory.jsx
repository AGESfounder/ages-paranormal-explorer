import React, { useState, useEffect } from 'react';
import { Loader2, Package } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import CartButton from '../components/store/CartButton';
import ProductListItem from '../components/store/ProductListItem';
import ProductDetailDialog from '../components/store/ProductDetailDialog';
import { useCart } from '../components/store/CartContext';
import { categoryLabels, isOtherCategory } from '@/lib/storeCategories';
import { base44 } from '@/api/base44Client';

export default function StoreCategory({ category }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addToCart } = useCart();
  const [focusProduct, setFocusProduct] = useState(null);

  useEffect(() => {
    base44.entities.Product.list().then(all => {
      const filtered = all.filter(p => category === 'other' ? isOtherCategory(p.category) : p.category === category);
      filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setProducts(filtered);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [category]);

  const title = categoryLabels[category] || category;

  return (
    <PageContainer>
      <SectionHeader title={title} subtitle="Ghost Hunting Gear" showBack rightAction={<CartButton />} />
      <div className="px-4 pb-28 pt-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <Package className="w-12 h-12 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground font-heading uppercase tracking-wider">No products yet</p>
          </div>
        ) : (
          products.map((p, i) => (
            <ProductListItem key={p.id} product={p} onAdd={addToCart} onOpenFocus={setFocusProduct} index={i} />
          ))
        )}
      </div>
      <ProductDetailDialog product={focusProduct} onClose={() => setFocusProduct(null)} onAdd={addToCart} />
      <NavBar />
    </PageContainer>
  );
}