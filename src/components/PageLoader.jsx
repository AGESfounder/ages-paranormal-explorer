import React from 'react';
import { motion } from 'framer-motion';
import { Ghost } from 'lucide-react';

export default function PageLoader() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
        <Ghost className="w-10 h-10 text-primary" />
      </motion.div>
      <p className="text-sm text-muted-foreground font-heading tracking-wide">Loading…</p>
    </div>
  );
}