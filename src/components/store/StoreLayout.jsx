import React from 'react';
import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CartProvider } from './CartContext';
import CartDrawer from './CartDrawer';
import CreepyAmbience from './CreepyAmbience';

export default function StoreLayout() {
  return (
    <CartProvider>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
        <Outlet />
      </motion.div>
      <CartDrawer />
      <CreepyAmbience />
    </CartProvider>
  );
}