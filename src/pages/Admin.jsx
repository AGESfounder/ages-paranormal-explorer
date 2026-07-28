import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Trash2, Edit3, Check, Search, Loader2, Shield, MapPin, Clock, Footprints, Car, Package, ShoppingBag, Plus, Truck, Mail, Map, X } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MediaUpload from '@/components/store/MediaUpload';
import MultiImageUpload from '@/components/store/MultiImageUpload';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const categoryOptions = [
  { value: 'equipment', label: 'Devices' },
  { value: 'apparel', label: 'Apparel' },
  { value: 'other', label: 'Other' },
];

const categoryLabelMap = Object.fromEntries(categoryOptions.map(c => [c.value, c.label]));

const statusColors = {
  pending: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  paid: 'bg-green-500/20 text-green-300 border-green-500/30',
  shipped: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  delivered: 'bg-primary/20 text-primary border-primary/30',
  cancelled: 'bg-destructive/20 text-destructive border-destructive/30',
};

export default function Admin() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('tours');

  // Tours
  const [tours, setTours] = useState([]);
  const [tourSearch, setTourSearch] = useState('');
  const [editingTour, setEditingTour] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Products
  const [products, setProducts] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState({});
  const [productDeleteConfirm, setProductDeleteConfirm] = useState(null);

  // Orders
  const [orders, setOrders] = useState([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [updatingOrderId, setUpdatingOrderId] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [t, p, o] = await Promise.all([
        base44.entities.Tour.list('-created_date', 500),
        base44.entities.Product.list('-created_date', 200),
        base44.entities.Order.list('-created_date', 200),
      ]);
      setTours(t);
      setProducts(p);
      setOrders(o);
    } catch (e) { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        if (me?.role === 'admin') await loadAll();
        else setLoading(false);
      } catch (e) { setLoading(false); }
    })();
  }, [loadAll]);

  // --- Tours ---
  const filteredTours = tours.filter(t =>
    t.title?.toLowerCase().includes(tourSearch.toLowerCase()) ||
    t.state?.toLowerCase().includes(tourSearch.toLowerCase()) ||
    t.city?.toLowerCase().includes(tourSearch.toLowerCase())
  );

  const openEdit = (tour) => {
    setEditingTour(tour);
    setEditForm({
      title: tour.title || '', city: tour.city || '', state: tour.state || '',
      tour_type: tour.tour_type || 'walking', difficulty: tour.difficulty || 'moderate',
      estimated_duration: tour.estimated_duration || '', total_distance: tour.total_distance || '',
      description: tour.description || '', safety_info: tour.safety_info || '',
      best_time: tour.best_time || '', start_location_name: tour.start_location_name || '',
    });
  };

  const saveEdit = async () => {
    if (!editingTour) return;
    setSaving(true);
    await base44.entities.Tour.update(editingTour.id, editForm);
    setTours(prev => prev.map(t => t.id === editingTour.id ? { ...t, ...editForm } : t));
    setEditingTour(null); setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeletingId(deleteConfirm.id);
    const stops = await base44.entities.TourStop.filter({ tour_id: deleteConfirm.id });
    for (const s of stops) await base44.entities.TourStop.delete(s.id);
    const favs = await base44.entities.Favorite.filter({ tour_id: deleteConfirm.id });
    for (const f of favs) await base44.entities.Favorite.delete(f.id);
    await base44.entities.Tour.delete(deleteConfirm.id);
    setTours(prev => prev.filter(t => t.id !== deleteConfirm.id));
    setDeletingId(null); setDeleteConfirm(null);
  };

  // --- Products ---
  const openAddProduct = () => {
    setEditingProduct('new');
    setProductForm({ name: '', description: '', price: '', original_price: '', video_url: '', category: 'equipment', stock: 0, is_featured: false, gender: 'unisex', sizes_text: '', colors_text: '', images: [], weight_oz: '', length_in: '', width_in: '', height_in: '' });
  };

  const openEditProduct = (p) => {
    setEditingProduct(p.id);
    setProductForm({
      name: p.name || '', description: p.description || '', price: p.price || '',
      original_price: p.original_price || '', video_url: p.video_url || '',
      category: p.category || 'equipment', stock: p.stock || 0, is_featured: p.is_featured || false,
      gender: p.gender || 'unisex', sizes_text: (p.sizes || []).join(', '), colors_text: (p.colors || []).join(', '),
      images: (p.images && p.images.length) ? p.images : (p.image_url ? [p.image_url] : []),
      weight_oz: p.weight_oz ?? '', length_in: p.length_in ?? '', width_in: p.width_in ?? '', height_in: p.height_in ?? '',
    });
  };

  const saveProduct = async () => {
    setSaving(true);
    const { sizes_text, colors_text, weight_oz, length_in, width_in, height_in, ...rest } = productForm;
    const numOr = (v, d) => (v === '' || v === null || v === undefined || isNaN(parseFloat(v))) ? d : parseFloat(v);
    const data = { ...rest, price: parseFloat(rest.price) || 0, stock: parseInt(rest.stock) || 0, original_price: rest.original_price ? parseFloat(rest.original_price) : null, is_featured: !!rest.is_featured, image_url: (rest.images && rest.images[0]) || null, images: rest.images || [], gender: rest.category === 'apparel' ? (rest.gender || 'unisex') : null, sizes: rest.category === 'apparel' && sizes_text ? sizes_text.split(',').map(s => s.trim()).filter(Boolean) : [], colors: rest.category === 'apparel' && colors_text ? colors_text.split(',').map(s => s.trim()).filter(Boolean) : [], weight_oz: numOr(weight_oz, 16), length_in: numOr(length_in, 10), width_in: numOr(width_in, 8), height_in: numOr(height_in, 6) };
    if (editingProduct === 'new') {
      const created = await base44.entities.Product.create(data);
      setProducts(prev => [created, ...prev]);
    } else {
      await base44.entities.Product.update(editingProduct, data);
      setProducts(prev => prev.map(p => p.id === editingProduct ? { ...p, ...data } : p));
    }
    setEditingProduct(null); setSaving(false);
  };

  const deleteProduct = async () => {
    if (!productDeleteConfirm) return;
    await base44.entities.Product.delete(productDeleteConfirm.id);
    setProducts(prev => prev.filter(p => p.id !== productDeleteConfirm.id));
    setProductDeleteConfirm(null);
  };

  // --- Orders ---
  const [orderFilter, setOrderFilter] = useState('action'); // 'action' | 'all'

  const pendingCount = orders.filter(o => o.status === 'pending' || o.status === 'paid').length;
  const shippedCount = orders.filter(o => o.status === 'shipped').length;

  const filteredOrders = orders
    .filter(o => orderFilter === 'action' ? (o.status === 'pending' || o.status === 'paid') : true)
    .filter(o =>
      o.shipping_name?.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.shipping_email?.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.shipping_city?.toLowerCase().includes(orderSearch.toLowerCase())
    );

  const updateOrderStatus = async (orderId, status) => {
    setUpdatingOrderId(orderId);
    await base44.entities.Order.update(orderId, { status });
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    setUpdatingOrderId(null);
  };

  if (loading) {
    return (
      <PageContainer>
        <SectionHeader title="Admin Panel" />
        <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        <NavBar />
      </PageContainer>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <PageContainer>
        <SectionHeader title="Access Denied" />
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <Shield className="w-16 h-16 text-destructive/50" />
          <p className="text-sm text-muted-foreground font-heading uppercase tracking-wider">Admin access required</p>
        </div>
        <NavBar />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SectionHeader title="Admin Panel" showBack />
      <div className="px-4 pb-28 pt-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full bg-card/50 border border-border/40 mb-4">
            <TabsTrigger value="tours" className="flex-1 text-xs font-heading">Tours</TabsTrigger>
            <TabsTrigger value="products" className="flex-1 text-xs font-heading">Products</TabsTrigger>
            <TabsTrigger value="orders" className="flex-1 text-xs font-heading">Orders</TabsTrigger>
          </TabsList>

          {/* === TOURS TAB === */}
          <TabsContent value="tours" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search tours..." value={tourSearch} onChange={e => setTourSearch(e.target.value)} className="pl-9 bg-card/50 border-border/40 text-sm" />
            </div>
            <div className="space-y-2">
              {filteredTours.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No tours found.</p>
              ) : (
                filteredTours.map((tour, i) => (
                  <motion.div key={tour.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} className="p-3 rounded-lg border border-border/40 bg-card/40 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{tour.title}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{tour.city}, {tour.state}</span>
                          <span className="flex items-center gap-1">{tour.tour_type === 'walking' ? <Footprints className="w-2.5 h-2.5" /> : tour.tour_type === 'mixed' ? <><Footprints className="w-2.5 h-2.5" /><Car className="w-2 h-2" /></> : <Car className="w-2.5 h-2.5" />}{tour.tour_type}</span>
                          <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{tour.estimated_duration || '—'}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEdit(tour)} className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={() => setDeleteConfirm(tour)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </TabsContent>

          {/* === PRODUCTS TAB === */}
          <TabsContent value="products" className="space-y-4">
            <Button onClick={openAddProduct} size="sm" className="w-full gap-2">
              <Plus className="w-4 h-4" /> Add Product
            </Button>
            <div className="space-y-2">
              {products.length === 0 ? (
                <div className="flex flex-col items-center py-12 gap-3">
                  <Package className="w-10 h-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground font-heading uppercase tracking-wider">No products yet</p>
                </div>
              ) : (
                products.map((p, i) => (
                  <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} className="p-3 rounded-lg border border-border/40 bg-card/40 space-y-2">
                    <div className="flex items-start gap-3">
                      {p.image_url && <img src={p.image_url} alt="" className="w-12 h-12 rounded-md object-cover shrink-0 bg-secondary/30" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{p.description || '—'}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-mono text-primary">${p.price?.toFixed(2)}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary/50 text-muted-foreground uppercase">{categoryLabelMap[p.category] || p.category}</span>
                          {p.original_price > p.price && <span className="text-[10px] text-green-400 font-heading uppercase">Sale</span>}
                          <span className="text-[10px] text-muted-foreground">Stock: {p.stock ?? 0}</span>
                          {p.video_url && <span className="text-[10px] text-cyan-glow">🎬 Video</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEditProduct(p)} className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={() => setProductDeleteConfirm(p)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </TabsContent>

          {/* === ORDERS TAB === */}
          <TabsContent value="orders" className="space-y-4">
            {/* Dashboard Summary */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-center">
                <p className="text-2xl font-mono font-bold text-amber-300">{pendingCount}</p>
                <p className="text-[10px] font-heading uppercase tracking-wider text-amber-300/70 mt-0.5">To Fulfill</p>
              </div>
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-center">
                <p className="text-2xl font-mono font-bold text-blue-300">{shippedCount}</p>
                <p className="text-[10px] font-heading uppercase tracking-wider text-blue-300/70 mt-0.5">Shipped</p>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-center">
                <p className="text-2xl font-mono font-bold text-primary">${orders.reduce((sum, o) => sum + (o.total || 0), 0).toFixed(2)}</p>
                <p className="text-[10px] font-heading uppercase tracking-wider text-primary/70 mt-0.5">Revenue</p>
              </div>
            </div>

            {/* Filter */}
            <div className="flex gap-2">
              <button onClick={() => setOrderFilter('action')} className={`flex-1 py-1.5 rounded-full text-[10px] font-heading uppercase tracking-wider border transition-colors ${orderFilter === 'action' ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'border-border/40 text-muted-foreground hover:text-foreground'}`}>Needs Fulfillment</button>
              <button onClick={() => setOrderFilter('all')} className={`flex-1 py-1.5 rounded-full text-[10px] font-heading uppercase tracking-wider border transition-colors ${orderFilter === 'all' ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border/40 text-muted-foreground hover:text-foreground'}`}>All Orders</button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search orders by name, email, city..." value={orderSearch} onChange={e => setOrderSearch(e.target.value)} className="pl-9 bg-card/50 border-border/40 text-sm" />
            </div>

            <div className="space-y-3">
              {filteredOrders.length === 0 ? (
                <div className="flex flex-col items-center py-12 gap-3">
                  <ShoppingBag className="w-10 h-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground font-heading uppercase tracking-wider">{orderFilter === 'action' ? 'No orders to fulfill' : 'No orders yet'}</p>
                </div>
              ) : (
                filteredOrders.map((order, i) => (
                  <motion.div key={order.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} className="rounded-lg border border-border/40 bg-card/40 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between p-3 border-b border-border/30">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-heading uppercase tracking-wider ${statusColors[order.status] || statusColors.pending}`}>{order.status}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">#{order.id?.slice(-8)}</span>
                      </div>
                      <span className="font-mono text-sm font-bold text-primary">${order.total?.toFixed(2)}</span>
                    </div>

                    {/* Shipping Address */}
                    <div className="px-3 py-2 border-b border-border/20 bg-secondary/20">
                      <p className="text-[9px] font-heading uppercase tracking-wider text-muted-foreground mb-1">Ship To</p>
                      <p className="text-xs font-medium text-foreground">{order.shipping_name || 'Customer'}</p>
                      {order.shipping_address && <p className="text-[11px] text-muted-foreground">{order.shipping_address}</p>}
                      <p className="text-[11px] text-muted-foreground">{[order.shipping_city, order.shipping_state, order.shipping_zip].filter(Boolean).join(', ')}</p>
                      {order.shipping_email && <p className="text-[10px] text-primary/70 mt-0.5">{order.shipping_email}</p>}
                    </div>

                    {/* Items */}
                    <div className="px-3 py-2 space-y-1">
                      {order.items?.map((item, j) => (
                        <div key={j} className="flex justify-between text-xs">
                          <span className="text-foreground flex items-center gap-1.5">
                            <span className="w-3.5 h-3.5 rounded-full bg-secondary/50 flex items-center justify-center text-[8px] font-mono text-muted-foreground">{item.quantity || 1}</span>
                            {item.name || item.product_name}
                          </span>
                          <span className="font-mono text-muted-foreground">${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    {order.status !== 'delivered' && order.status !== 'cancelled' && (
                      <div className="px-3 pb-3 pt-1 flex gap-2">
                        {(order.status === 'pending' || order.status === 'paid') && (
                          <Button size="sm" onClick={() => updateOrderStatus(order.id, 'shipped')} disabled={updatingOrderId === order.id} className="text-[10px] h-8 flex-1 gap-1">
                            {updatingOrderId === order.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Truck className="w-3 h-3" />}
                            Mark Fulfilled
                          </Button>
                        )}
                        {order.status === 'shipped' && (
                          <Button size="sm" onClick={() => updateOrderStatus(order.id, 'delivered')} disabled={updatingOrderId === order.id} className="text-[10px] h-8 flex-1 gap-1">
                            {updatingOrderId === order.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            Mark Delivered
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="text-[10px] h-8 text-destructive hover:text-destructive px-3" onClick={() => updateOrderStatus(order.id, 'cancelled')} disabled={updatingOrderId === order.id}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    )}

                    <p className="px-3 pb-2 text-[9px] text-muted-foreground/50">{new Date(order.created_date).toLocaleString()}</p>
                  </motion.div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Tour Edit Dialog */}
      <Dialog open={!!editingTour} onOpenChange={(open) => !open && setEditingTour(null)}>
        <DialogContent className="bg-card border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-wider text-sm">Edit Tour</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Title</Label><Input value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">City</Label><Input value={editForm.city} onChange={e => setEditForm({ ...editForm, city: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
              <div><Label className="text-xs">State</Label><Input value={editForm.state} onChange={e => setEditForm({ ...editForm, state: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Tour Type</Label><Select value={editForm.tour_type} onValueChange={v => setEditForm({ ...editForm, tour_type: v })}><SelectTrigger className="bg-secondary/50 border-border/40 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="walking">Walking</SelectItem><SelectItem value="driving">Driving</SelectItem><SelectItem value="mixed">Mixed</SelectItem></SelectContent></Select></div>
              <div><Label className="text-xs">Difficulty</Label><Select value={editForm.difficulty} onValueChange={v => setEditForm({ ...editForm, difficulty: v })}><SelectTrigger className="bg-secondary/50 border-border/40 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="easy">Easy</SelectItem><SelectItem value="moderate">Moderate</SelectItem><SelectItem value="challenging">Challenging</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Duration</Label><Input value={editForm.estimated_duration} onChange={e => setEditForm({ ...editForm, estimated_duration: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
              <div><Label className="text-xs">Distance</Label><Input value={editForm.total_distance} onChange={e => setEditForm({ ...editForm, total_distance: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
            </div>
            <div><Label className="text-xs">Start Location</Label><Input value={editForm.start_location_name} onChange={e => setEditForm({ ...editForm, start_location_name: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
            <div><Label className="text-xs">Description</Label><Input value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
            <div><Label className="text-xs">Best Time</Label><Input value={editForm.best_time} onChange={e => setEditForm({ ...editForm, best_time: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
            <div><Label className="text-xs">Safety Info</Label><Input value={editForm.safety_info} onChange={e => setEditForm({ ...editForm, safety_info: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTour(null)} className="text-xs">Cancel</Button>
            <Button onClick={saveEdit} disabled={saving} className="text-xs">{saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tour Delete Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-wider text-sm">Delete Tour</DialogTitle></DialogHeader>
          <p className="text-sm text-foreground/80">Permanently delete <strong>{deleteConfirm?.title}</strong> and all its stops and favorites?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="text-xs">Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deletingId} className="text-xs">{deletingId ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />}Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Form Dialog */}
      <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
        <DialogContent className="bg-card border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-wider text-sm">{editingProduct === 'new' ? 'Add Product' : 'Edit Product'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Name *</Label><Input value={productForm.name} onChange={e => setProductForm({ ...productForm, name: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
            <div><Label className="text-xs">Description</Label><Input value={productForm.description} onChange={e => setProductForm({ ...productForm, description: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Price ($) *</Label><Input type="number" step="0.01" value={productForm.price} onChange={e => setProductForm({ ...productForm, price: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
              <div><Label className="text-xs">Stock</Label><Input type="number" value={productForm.stock} onChange={e => setProductForm({ ...productForm, stock: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
            </div>
            <div><Label className="text-xs">Original Price ($) — for sale items</Label><Input type="number" step="0.01" value={productForm.original_price} onChange={e => setProductForm({ ...productForm, original_price: e.target.value })} placeholder="Leave empty if not on sale" className="bg-secondary/50 border-border/40 text-sm" /></div>
            <div className="flex items-center gap-3">
              <Label className="text-xs">Featured Product of the Week</Label>
              <button type="button" onClick={() => setProductForm({ ...productForm, is_featured: !productForm.is_featured })} className={`px-3 py-1.5 rounded-lg text-xs font-heading uppercase tracking-wider border ${productForm.is_featured ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border/40 text-muted-foreground'}`}>{productForm.is_featured ? '★ Featured' : 'Mark as Featured'}</button>
            </div>
            <div><Label className="text-xs">Category</Label><Select value={productForm.category} onValueChange={v => setProductForm({ ...productForm, category: v })}><SelectTrigger className="bg-secondary/50 border-border/40 text-sm"><SelectValue /></SelectTrigger><SelectContent>{categoryOptions.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
            {productForm.category === 'apparel' && (
              <div className="space-y-3 p-3 rounded-lg border border-border/40 bg-secondary/20">
                <div><Label className="text-xs">Gender</Label><Select value={productForm.gender || 'unisex'} onValueChange={v => setProductForm({ ...productForm, gender: v })}><SelectTrigger className="bg-secondary/50 border-border/40 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="men">Men's</SelectItem><SelectItem value="women">Women's</SelectItem><SelectItem value="unisex">Unisex</SelectItem></SelectContent></Select></div>
                <div><Label className="text-xs">Sizes (comma separated, e.g. S, M, L, XL)</Label><Input value={productForm.sizes_text} onChange={e => setProductForm({ ...productForm, sizes_text: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
                <div><Label className="text-xs">Colors (comma separated)</Label><Input value={productForm.colors_text} onChange={e => setProductForm({ ...productForm, colors_text: e.target.value })} className="bg-secondary/50 border-border/40 text-sm" /></div>
              </div>
            )}
            <div className="space-y-2 p-3 rounded-lg border border-border/40 bg-secondary/20">
              <Label className="text-xs">Shipping specs (used for live carrier rates)</Label>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[10px] text-muted-foreground">Weight (oz)</Label><Input type="number" step="0.1" value={productForm.weight_oz} onChange={e => setProductForm({ ...productForm, weight_oz: e.target.value })} placeholder="16" className="bg-secondary/50 border-border/40 text-sm" /></div>
                <div><Label className="text-[10px] text-muted-foreground">Length (in)</Label><Input type="number" step="0.1" value={productForm.length_in} onChange={e => setProductForm({ ...productForm, length_in: e.target.value })} placeholder="10" className="bg-secondary/50 border-border/40 text-sm" /></div>
                <div><Label className="text-[10px] text-muted-foreground">Width (in)</Label><Input type="number" step="0.1" value={productForm.width_in} onChange={e => setProductForm({ ...productForm, width_in: e.target.value })} placeholder="8" className="bg-secondary/50 border-border/40 text-sm" /></div>
                <div><Label className="text-[10px] text-muted-foreground">Height (in)</Label><Input type="number" step="0.1" value={productForm.height_in} onChange={e => setProductForm({ ...productForm, height_in: e.target.value })} placeholder="6" className="bg-secondary/50 border-border/40 text-sm" /></div>
              </div>
            </div>
            <MultiImageUpload label="Product Pictures" value={productForm.images || []} onChange={imgs => setProductForm({ ...productForm, images: imgs })} />
            <MediaUpload label="Product Video" accept="video/*" type="video" value={productForm.video_url} onChange={url => setProductForm({ ...productForm, video_url: url })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProduct(null)} className="text-xs">Cancel</Button>
            <Button onClick={saveProduct} disabled={saving || !productForm.name || !productForm.price} className="text-xs">{saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Delete Dialog */}
      <Dialog open={!!productDeleteConfirm} onOpenChange={(open) => !open && setProductDeleteConfirm(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-wider text-sm">Delete Product</DialogTitle></DialogHeader>
          <p className="text-sm text-foreground/80">Permanently delete <strong>{productDeleteConfirm?.name}</strong>?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDeleteConfirm(null)} className="text-xs">Cancel</Button>
            <Button variant="destructive" onClick={deleteProduct} className="text-xs"><Trash2 className="w-3 h-3 mr-1" />Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NavBar />
    </PageContainer>
  );
}