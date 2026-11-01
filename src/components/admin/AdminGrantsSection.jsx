import React from 'react';
import AdminGrantPanel from '@/components/admin/AdminGrantPanel';
import AdminAuraGrantPanel from '@/components/admin/AdminAuraGrantPanel';

// Admin-only grant controls for one account, laid out as two columns under one
// heading: paid-tier access on the left, Aura energy on the right.
export default function AdminGrantsSection({ user, onSubscriptionChanged, onAuraChanged }) {
  return (
    <div className="rounded-lg border border-border/30 bg-card/20 p-2.5 space-y-2.5">
      <p
        className="font-heading text-sm font-semibold uppercase tracking-[0.18em] text-primary"
        style={{ textShadow: '0 0 12px hsl(199 89% 48% / 0.55), 0 0 24px hsl(199 89% 48% / 0.25)' }}
      >
        Admin Access Grants
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-4">
        <div className="min-w-0 md:border-r md:border-border/20 md:pr-4">
          <AdminGrantPanel user={user} onChanged={onSubscriptionChanged} flush />
        </div>
        <div className="min-w-0">
          <AdminAuraGrantPanel user={user} onChanged={onAuraChanged} flush />
        </div>
      </div>
    </div>
  );
}