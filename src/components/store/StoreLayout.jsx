import React from 'react';
import { Outlet } from 'react-router-dom';
import { CartProvider } from './CartContext';
import CartDrawer from './CartDrawer';
import CreepyAmbience from './CreepyAmbience';

export default function StoreLayout() {
  return (
    <CartProvider>
      <Outlet />
      <CartDrawer />
      <CreepyAmbience />
    </CartProvider>
  );
}