import React from 'react';
import { Outlet } from 'react-router-dom';
import { CartProvider } from './CartContext';
import CartDrawer from './CartDrawer';

export default function StoreLayout() {
  return (
    <CartProvider>
      <Outlet />
      <CartDrawer />
    </CartProvider>
  );
}