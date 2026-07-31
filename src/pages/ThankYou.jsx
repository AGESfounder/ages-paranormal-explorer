import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, Ghost } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageContainer from '@/components/PageContainer';
import { base44 } from '@/api/base44Client';

export default function ThankYou() {
  const [status, setStatus] = useState('confirming'); // confirming | success | timeout
  const [user, setUser] = useState(null);

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 15;

    const checkStatus = async () => {
      attempts++;
      try {
        const userData = await base44.auth.me();
        setUser(userData);
        // If the user has a paid plan, payment was confirmed
        if (userData.plan && userData.plan !== 'observer') {
          setStatus('success');
          return;
        }
      } catch (e) {
        // User might not be logged in — keep polling
      }

      if (attempts >= maxAttempts) {
        setStatus('timeout');
        return;
      }

      setTimeout(checkStatus, 2000);
    };

    checkStatus();
  }, []);

  return (
    <PageContainer>
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        {status === 'confirming' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <Ghost className="w-16 h-16 text-primary" />
            </motion.div>
            <h1 className="font-heading text-xl font-bold text-foreground">Confirming Your Payment</h1>
            <p className="text-sm text-muted-foreground max-w-xs">
              We're activating your access. This usually takes a few seconds…
            </p>
            <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
          </motion.div>
        )}

        {status === 'success' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4"
          >
            <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-primary" />
            </div>
            <h1 className="font-heading text-xl font-bold text-foreground">Payment Confirmed!</h1>
            <p className="text-sm text-muted-foreground max-w-xs">
              Your <span className="text-primary font-heading uppercase">{user?.plan}</span> access is now active.
            </p>
            <Link
              to="/dashboard"
              className="inline-block px-6 py-3 rounded-lg bg-primary text-primary-foreground font-heading uppercase tracking-wider text-sm hover:bg-primary/80 transition-colors min-h-[44px] flex items-center"
            >
              Go to Dashboard
            </Link>
          </motion.div>
        )}

        {status === 'timeout' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4"
          >
            <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-500/40 flex items-center justify-center mx-auto">
              <Ghost className="w-8 h-8 text-amber-400" />
            </div>
            <h1 className="font-heading text-xl font-bold text-foreground">Payment Processing</h1>
            <p className="text-sm text-muted-foreground max-w-xs">
              Your payment is being processed. If your access doesn't activate within a few minutes, please contact support.
            </p>
            <Link
              to="/dashboard"
              className="inline-block px-6 py-3 rounded-lg border border-primary/30 text-primary font-heading uppercase tracking-wider text-sm hover:bg-primary/10 transition-colors min-h-[44px] flex items-center"
            >
              Go to Dashboard
            </Link>
          </motion.div>
        )}
      </div>
    </PageContainer>
  );
}