import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Volume2, Zap, Gift, Crown, Check, Loader2, Calendar, TrendingUp, Ghost, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageContainer from '@/components/PageContainer';
import NavBar from '@/components/NavBar';
import SectionHeader from '@/components/SectionHeader';
import EnergyMeter from '@/components/EnergyMeter';
import { base44 } from '@/api/base44Client';
import { PLANS, AURA_BUNDLES, PLAN_ORDER } from '@/lib/plans';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
      const purchaseHistory = await base44.entities.Base44Purchase.list('-created_date', 20);
      setPurchases(purchaseHistory);
    } catch (e) {
      console.error('Dashboard load error:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handlePurchase = async (productId) => {
    setRedirecting(productId);
    try {
      const response = await base44.functions.invoke('create-subscription', { product_id: productId });
      if (response.data?.redirectUrl) {
        window.location.href = response.data.redirectUrl;
      } else if (response.data?.error) {
        alert(response.data.error);
        setRedirecting(null);
      }
    } catch (e) {
      console.error('Checkout error:', e);
      const msg = e.response?.data?.error || e.message || 'Checkout failed';
      alert(msg);
      setRedirecting(null);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <SectionHeader title="Dashboard" showBack />
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-primary animate-spin" /></div>
        <NavBar />
      </PageContainer>
    );
  }

  const currentPlan = PLANS[user?.plan || 'observer'];
  const isPaid = currentPlan.id !== 'observer';

  // Calculate days until reset
  const resetDate = user?.energy_reset_date ? new Date(user.energy_reset_date) : null;
  const daysUntilReset = resetDate ? Math.ceil((resetDate - new Date()) / (1000 * 60 * 60 * 24)) : null;

  // Calculate days until plan expiration (Trailblazer)
  const expirationDate = user?.plan_expiration_date ? new Date(user.plan_expiration_date) : null;
  const daysUntilExpiration = expirationDate ? Math.ceil((expirationDate - new Date()) / (1000 * 60 * 60 * 24)) : null;

  return (
    <PageContainer>
      <SectionHeader
        title="Dashboard"
        subtitle="Subscription & Energy"
        showBack
        rightAction={
          <Link to="/plan-analysis" className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card/60 text-foreground font-heading text-[11px] uppercase tracking-wider hover:bg-card hover:border-primary/40 transition-colors min-h-[44px]">
            <FileText className="w-3.5 h-3.5 text-primary" /> Plan PDF
          </Link>
        }
      />
      <div className="px-4 pb-28 space-y-5 pt-3">

        {/* ── Current Plan Card ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 rounded-xl border border-border/40 bg-card/40"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${currentPlan.badge} border`}>
                {currentPlan.id === 'trailblazer' ? <Crown className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
              </div>
              <div>
                <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Current Plan</p>
                <h2 className="font-heading text-lg font-bold text-foreground">{currentPlan.name}</h2>
              </div>
            </div>
            {isPaid && (
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-heading uppercase tracking-wider border ${currentPlan.badge}`}>
                {user?.subscription_status === 'active' ? 'Active' : currentPlan.id === 'trailblazer' ? 'Elite' : 'Active'}
              </span>
            )}
          </div>

          {/* Plan features */}
          <div className="space-y-1.5">
            {currentPlan.features.map((f, i) => (
              <div key={i} className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">{f}</p>
              </div>
            ))}
          </div>

          {/* Expiration / renewal info */}
          {daysUntilExpiration !== null && daysUntilExpiration > 0 && (
            <div className="mt-3 pt-3 border-t border-border/30 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <p className="text-xs text-muted-foreground">
                <span className="text-amber-400 font-heading">{daysUntilExpiration} days</span> remaining in your Trailblazer access
              </p>
            </div>
          )}
        </motion.div>

        {/* ── Energy Meters ── */}
        {isPaid ? (
          <div className="space-y-3">
            <h3 className="font-heading text-xs font-semibold tracking-wider uppercase text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Manifestation Energy
            </h3>
            <EnergyMeter
              label="Monthly Manifestation"
              current={user?.manifestation_energy || 0}
              max={currentPlan.manifestation_energy}
              icon={Sparkles}
              color="primary"
              subtitle="Used for AI tour & stop generation. Resets monthly."
            />
            {user?.aura_manifestation_energy > 0 && (
              <EnergyMeter
                label="Aura Manifestation (Rollover)"
                current={user?.aura_manifestation_energy || 0}
                max={user?.aura_manifestation_energy || 0}
                icon={Gift}
                color="amber"
                subtitle="Purchased energy — rolls over and never expires."
              />
            )}

            <h3 className="font-heading text-xs font-semibold tracking-wider uppercase text-foreground flex items-center gap-2 pt-2">
              <Volume2 className="w-4 h-4 text-accent-foreground" /> Narration Energy
            </h3>
            <EnergyMeter
              label="Monthly Narration"
              current={user?.narration_energy || 0}
              max={currentPlan.narration_energy}
              icon={Volume2}
              color="accent"
              subtitle="Used for AI text-to-speech narration. Resets monthly."
            />
            {user?.aura_narration_energy > 0 && (
              <EnergyMeter
                label="Aura Narration (Rollover)"
                current={user?.aura_narration_energy || 0}
                max={user?.aura_narration_energy || 0}
                icon={Gift}
                color="amber"
                subtitle="Purchased energy — rolls over and never expires."
              />
            )}

            {/* Reset countdown */}
            {daysUntilReset !== null && daysUntilReset > 0 && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <p className="text-xs text-muted-foreground">
                  Monthly energy resets in <span className="text-primary font-heading">{daysUntilReset} days</span>
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-border/30 bg-card/20 text-center">
            <Ghost className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground font-heading">No energy allocated</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Upgrade to a paid plan to unlock AI features</p>
          </div>
        )}

        {/* ── Upgrade Plans ── */}
        <div>
          <h3 className="font-heading text-xs font-semibold tracking-wider uppercase text-foreground mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> Upgrade Your Access
          </h3>
          <div className="space-y-3">
            {PLAN_ORDER.filter(id => id !== 'observer' && id !== user?.plan).map(planId => {
              const plan = PLANS[planId];
              const isTrailblazer = planId === 'trailblazer';
              return (
                <div key={planId} className="p-4 rounded-xl border border-border/40 bg-card/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-heading uppercase tracking-wider border ${plan.badge}`}>
                        {plan.name}
                      </span>
                      {isTrailblazer && <span className="text-[10px] text-amber-400 font-heading">3-Year Elite</span>}
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2 mb-3">
                    {isTrailblazer ? (
                      <>
                        <span className="font-display text-2xl text-amber-400">${plan.one_time_price}</span>
                        <span className="text-xs text-muted-foreground">one-time / 3 years</span>
                      </>
                    ) : (
                      <>
                        <span className="font-display text-2xl text-primary">${plan.monthly_price}</span>
                        <span className="text-xs text-muted-foreground">/month</span>
                        <span className="text-xs text-muted-foreground/60">· ${plan.annual_price}/year</span>
                      </>
                    )}
                  </div>
                  <div className="space-y-1 mb-3">
                    {plan.features.slice(0, 4).map((f, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <Check className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{f}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {!isTrailblazer && (
                      <>
                        <button
                          onClick={() => handlePurchase(`${planId}_monthly`)}
                          disabled={redirecting === `${planId}_monthly`}
                          className="flex-1 py-2.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors disabled:opacity-50 min-h-[44px] flex items-center justify-center"
                        >
                          {redirecting === `${planId}_monthly` ? <Loader2 className="w-4 h-4 animate-spin" /> : `Monthly $${plan.monthly_price}`}
                        </button>
                        <button
                          onClick={() => handlePurchase(`${planId}_annual`)}
                          disabled={redirecting === `${planId}_annual`}
                          className="flex-1 py-2.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-heading uppercase tracking-wider hover:bg-primary/30 transition-colors disabled:opacity-50 min-h-[44px] flex items-center justify-center"
                        >
                          {redirecting === `${planId}_annual` ? <Loader2 className="w-4 h-4 animate-spin" /> : `Annual $${plan.annual_price}`}
                        </button>
                      </>
                    )}
                    {isTrailblazer && (
                      <button
                        onClick={() => handlePurchase('trailblazer')}
                        disabled={redirecting === 'trailblazer'}
                        className="flex-1 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-heading uppercase tracking-wider hover:bg-amber-500/20 transition-colors disabled:opacity-50 min-h-[44px] flex items-center justify-center"
                      >
                        {redirecting === 'trailblazer' ? <Loader2 className="w-4 h-4 animate-spin" /> : `Get Trailblazer $${plan.one_time_price}`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Aura Bundles ── */}
        {isPaid && (
          <div>
            <h3 className="font-heading text-xs font-semibold tracking-wider uppercase text-foreground mb-3 flex items-center gap-2">
              <Gift className="w-4 h-4 text-amber-400" /> Aura Bundles
            </h3>
            <p className="text-xs text-muted-foreground mb-3">Top-up energy that rolls over to the next month. 80% Narration + 20% Manifestation.</p>
            <div className="grid grid-cols-2 gap-2.5">
              {Object.values(AURA_BUNDLES).map(bundle => (
                <div key={bundle.id} className="p-3 rounded-xl border border-border/40 bg-card/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{bundle.icon}</span>
                    <div>
                      <p className="text-sm font-heading font-bold text-foreground">{bundle.name}</p>
                      <p className="text-[10px] text-muted-foreground">{bundle.energy} energy</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handlePurchase(bundle.id)}
                    disabled={redirecting === bundle.id}
                    className="w-full py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-heading uppercase tracking-wider hover:bg-amber-500/20 transition-colors disabled:opacity-50 min-h-[44px] flex items-center justify-center"
                  >
                    {redirecting === bundle.id ? <Loader2 className="w-4 h-4 animate-spin" /> : `$${bundle.price}`}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Purchase History ── */}
        {purchases.length > 0 && (
          <div>
            <h3 className="font-heading text-xs font-semibold tracking-wider uppercase text-foreground mb-3">
              Purchase History
            </h3>
            <div className="space-y-2">
              {purchases.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-border/30 bg-card/20">
                  <div>
                    <p className="text-xs font-medium text-foreground">{p.product_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(p.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono text-foreground">${p.amount?.toFixed(2)}</p>
                    <span className={`text-[10px] font-heading uppercase tracking-wider ${p.status === 'paid' ? 'text-green-400' : 'text-muted-foreground'}`}>
                      {p.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <NavBar />
    </PageContainer>
  );
}