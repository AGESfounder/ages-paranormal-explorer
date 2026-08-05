import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Zap, Loader2, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { showRewardedAd } from '@/lib/adService';
import { AD_REWARD_ENERGY, AD_REWARD_DAILY_LIMIT } from '@/lib/adRewards';

export default function AdRewardCard({ user, onRewardGranted }) {
  const [watching, setWatching] = useState(false);
  const [granting, setGranting] = useState(false);
  const [justGranted, setJustGranted] = useState(false);
  const [error, setError] = useState(null);

  // Calculate ads watched today (resets if the stored date isn't today)
  const today = new Date().toISOString().split('T')[0];
  const countToday = user?.ad_rewards_date === today ? (user?.ad_rewards_count || 0) : 0;
  const remaining = AD_REWARD_DAILY_LIMIT - countToday;

  const handleWatchAd = async () => {
    if (watching || granting || remaining <= 0) return;
    setError(null);
    setWatching(true);
    try {
      const result = await showRewardedAd();
      if (!result.rewarded) {
        setError('Ad was not completed. Try again.');
        setWatching(false);
        return;
      }
      setWatching(false);
      setGranting(true);
      const response = await base44.functions.invoke('grant-ad-reward', {});
      if (response.data?.success) {
        setJustGranted(true);
        setTimeout(() => setJustGranted(false), 2500);
        onRewardGranted?.(response.data);
        // Notify all useEnergyGate instances to refresh their user state
        window.dispatchEvent(new CustomEvent('ad-reward-granted'));
      } else {
        setError(response.data?.error || 'Failed to grant energy.');
      }
    } catch (e) {
      console.error('Ad reward error:', e);
      setError(e.response?.data?.error || e.message || 'Something went wrong.');
      setWatching(false);
    } finally {
      setGranting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-xl border border-primary/30 bg-primary/5"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/30">
          <Play className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="font-heading text-sm font-bold text-foreground">
            Watch Ad for +{AD_REWARD_ENERGY} Energy
          </p>
          <p className="text-[11px] text-muted-foreground">
            30-second ad · {remaining} of {AD_REWARD_DAILY_LIMIT} remaining today
          </p>
        </div>
      </div>

      {error && <p className="text-[11px] text-destructive mb-2">{error}</p>}

      <button
        onClick={handleWatchAd}
        disabled={watching || granting || remaining <= 0}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-heading text-xs uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2"
      >
        {watching ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Watching ad…</>
        ) : granting ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Granting energy…</>
        ) : justGranted ? (
          <><Check className="w-4 h-4" /> +{AD_REWARD_ENERGY} Energy Added!</>
        ) : remaining <= 0 ? (
          'Daily Limit Reached'
        ) : (
          <><Zap className="w-4 h-4" /> Watch &amp; Earn</>
        )}
      </button>
    </motion.div>
  );
}