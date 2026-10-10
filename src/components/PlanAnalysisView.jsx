import React from 'react';
import { th, td, num } from '@/components/planAnalysis/tableStyles';
import StartHere from '@/components/planAnalysis/StartHere';
import ScenarioPnLTable from '@/components/planAnalysis/ScenarioPnLTable';

// Renders the full Plan Analysis report from a unified `data` object produced
// by src/lib/planAnalysisData.js. The page shell (PlanAnalysis.jsx) owns the
// A/B toggle and passes the active data object here.
export default function PlanAnalysisView({ data }) {
  const {
    plans, auraBundles, creditAudit, toolkitTiers, newlyVisibleCostlyTools,
    monthlyAnalysis, trailblazerAnalysis, trailblazer50, bundleAnalysis,
    scenarios, tierEconomics, pnlRows, adMobScenarios, rewardedAdScenarios,
    freeUserBreakdown, freeUserBreakdownTotal, freeUserBreakdownCost,
    ungatedTypical, ungatedWorstCase, perUser100,
    avgEnrichmentCredits, blendedManifestationCredits, enrichShare,
    fixedCostsFirstYear, fixedFirstYearTotal, fixedCostsOngoing,
    fixedOngoingAnnual, fixedOngoingMonthly,
    CREDITS_PER_MANIFESTATION, CREDITS_PER_NARRATION, COST_PER_CREDIT,
    ENRICHMENT_CREDITS_SINGLE_SITE, ENRICHMENT_CREDITS_MULTI_SITE,
    SINGLE_SITE_FRACTION, ENRICHMENT_CALL_FRACTION,
    BASE44_PLANS, STORE_FEE_PCT, STORE_FEE_PCT_HIGH, STORE_HIGH_THRESHOLD,
    REVENUECAT_FEE_PCT, REVENUECAT_THRESHOLD,
    APPLE_DEV_ANNUAL, GOOGLE_DEV_ONE_TIME, DEV_UPFRONT_ONE_TIME,
    ADMOB_ECPM, ADMOB_PER_IMPRESSION, ADS_PER_TOUR, TOURS_PER_FREE_USER_MO,
    AD_REV_PER_FREE_USER_MO, ADMOB_REWARDED_ECPM, ADMOB_REWARDED_PER_IMPRESSION,
    ADS_PER_PAID_USER_MO, AD_REWARD_ENERGY, AD_REWARD_NARRATION, AD_REWARD_MANIFESTATION,
    AD_REWARD_UTILIZATION, OBSERVER_NARRATION_ADS_PER_TOUR, NARRATION_AD_REV_PER_FREE_USER_MO,
    TOOL_USE_ADS_OBSERVER_MO, TOOL_USE_AD_REV_OBSERVER_MO, SAVE_ADS_MO, SAVE_AD_REV_MO,
    SAVE_UPLOAD_CREDITS_MO, SAVE_UPLOAD_COST_MO, OBSERVER_AD_REV_MO,
    NARRATION_PER_STOP, NARRATION_INTRO_CONCLUSION, AVG_STOPS_PER_TOUR,
    fullTourNarrationCredits, toursPerEnergy, auraSplit, batch, optionKey,
    AD_REWARD_CREDITS_PER_AD, AD_REWARD_REV_PER_PAID_USER_MO,
    AD_REWARD_COST_PER_PAID_USER_MO, AD_REWARD_NET_PER_PAID_USER_MO,
    calcCosts, storeFee, revenuecatFee, requiredBase44Plan,
    trailblazerMonths,
  } = data;

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const isB = optionKey === 'B';

  return (
    <div className="max-w-4xl mx-auto">
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
          .print-block { box-shadow: none !important; border-color: #ccc !important; }
          .print-text { color: black !important; }
          .print-muted { color: #555 !important; }
          table { page-break-inside: avoid; }
          h1, h2, h3 { color: black !important; }
        }
      `}</style>

      <div className="hidden print:block mb-6">
        <h1 className="font-heading text-2xl font-bold print-text">AGES Subscription Plan &amp; Profit Analysis — Cost Analysis {optionKey}</h1>
        <p className="text-sm print-muted mt-1">Generated {today}</p>
      </div>

      <StartHere tiers={tierEconomics} scenarios={scenarios} />

      {/* 1. Subscription Plans */}
      <section className="mb-8">
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">1. Subscription Tiers</h2>
        <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Plan</th>
                <th className={th}>Price</th>
                <th className={th}>Billing</th>
                <th className={`${th} ${num}`}>Manifestation Energy</th>
                <th className={`${th} ${num}`}>Narration Energy</th>
              </tr>
            </thead>
            <tbody>
              {plans.map(p => (
                <tr key={p.name}>
                  <td className={`${td} font-semibold print-text`}>{p.name}</td>
                  <td className={`${td} print-text`}>{p.price}</td>
                  <td className={`${td} print-muted`}>{p.billing}</td>
                  <td className={`${td} ${num} print-text`}>{p.manE}</td>
                  <td className={`${td} ${num} print-text`}>{p.narE}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 space-y-1">
          {plans.map(p => (
            <p key={p.name} className="text-xs print-muted"><span className="font-semibold print-text">{p.name}:</span> {p.features}</p>
          ))}
        </div>
      </section>

      {/* 2. Aura Bundles */}
      <section className="mb-8">
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">2. Aura Bundles (One-Time Energy Top-Ups)</h2>
        <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Bundle</th>
                <th className={`${th} ${num}`}>Energy</th>
                <th className={`${th} ${num}`}>Price</th>
                <th className={`${th} ${num}`}>$ / Energy</th>
              </tr>
            </thead>
            <tbody>
              {auraBundles.map(b => (
                <tr key={b.name}>
                  <td className={`${td} font-semibold print-text`}>{b.name}</td>
                  <td className={`${td} ${num} print-text`}>{b.energy}</td>
                  <td className={`${td} ${num} print-text`}>{b.price}</td>
                  <td className={`${td} ${num} print-muted`}>${(parseFloat(b.price.replace('$','')) / b.energy).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Cost Assumptions */}
      <section className="mb-8">
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">3. Cost Assumptions</h2>
        <div className="rounded-lg border border-border bg-card/40 print-block p-4 space-y-2 text-sm">
          <p className="print-text"><span className="font-semibold">Manifestation Energy:</span> 1 unit = 1 InvokeLLM call (Automatic model) ≈ {CREDITS_PER_MANIFESTATION} integration credits</p>
          <p className="print-text"><span className="font-semibold">Narration Energy:</span> 1 unit = 1 GenerateSpeech credit (1 credit / 50 chars of audio)</p>
          <p className="print-text"><span className="font-semibold">Platform cost:</span> ${COST_PER_CREDIT.toFixed(4)}/credit (Builder plan: $40/mo, 10,000 included credits). Pro: $80/mo, 20,000 credits. Elite: custom. Credits are hard-capped — actions FAIL when exhausted, not pay-per-use.</p>
          <p className="print-text"><span className="font-semibold">App Store / Google Play IAP fee:</span> {(STORE_FEE_PCT * 100).toFixed(0)}% of IAP revenue (both stores, small devs &lt; ${(STORE_HIGH_THRESHOLD / 1000000).toFixed(0)}M/yr). Apple jumps to {(STORE_FEE_PCT_HIGH * 100).toFixed(0)}% above that; Google stays 15%. The app publishes natively via iOS/Android IAP.</p>
          <p className="print-text"><span className="font-semibold">RevenueCat:</span> {(REVENUECAT_FEE_PCT * 100).toFixed(0)}% of monthly subscription sales above ${REVENUECAT_THRESHOLD.toLocaleString()}/mo (IAP subscription management layer for iOS/Android)</p>
          <p className="print-text"><span className="font-semibold">Fixed costs:</span> Apple Developer ${APPLE_DEV_ANNUAL}/yr · Google Play ${GOOGLE_DEV_ONE_TIME} one-time · CatDoes ${DEV_UPFRONT_ONE_TIME} upfront (one-time, no profit share)</p>
          <p className="print-text text-xs italic"><span className="font-semibold">Note:</span> Base44 plan costs are shown as actual fixed monthly tier costs in section 9 (e.g. Builder $40/mo, Pro $80/mo, Elite $200/mo), determined by the total credits consumed. The per-credit rate (${COST_PER_CREDIT.toFixed(4)}/credit) is used only for per-plan and per-bundle profit analysis in sections 4–6.</p>
          <p className="print-text"><span className="font-semibold">AdMob:</span> ${ADMOB_ECPM}/1k interstitial impressions (eCPM). Free users see ads on stops 2+ (~{ADS_PER_TOUR} ads/tour × {TOURS_PER_FREE_USER_MO} tours/mo = ${AD_REV_PER_FREE_USER_MO.toFixed(3)}/free user/mo)</p>
          <p className="print-text"><span className="font-semibold">AdMob (Observer narration):</span> Device narration plays one ad before each narration — a fully narrated tour is ~{OBSERVER_NARRATION_ADS_PER_TOUR} ads. {OBSERVER_NARRATION_ADS_PER_TOUR} ads × {TOURS_PER_FREE_USER_MO} tours/mo × ${ADMOB_PER_IMPRESSION.toFixed(3)} = ${NARRATION_AD_REV_PER_FREE_USER_MO.toFixed(2)}/free user/mo</p>
          <p className="print-text"><span className="font-semibold">AdMob (Observer tools + saves):</span> Audio Recorder / Radio Sweeper (30s ad = 30s use) ~{TOOL_USE_ADS_OBSERVER_MO} ads/mo = ${TOOL_USE_AD_REV_OBSERVER_MO.toFixed(2)}; ad-watched evidence saves (Observer and Seeker) ~{SAVE_ADS_MO}/mo = ${SAVE_AD_REV_MO.toFixed(2)}, each save costs 1 upload credit. <span className="font-semibold">Total Observer ad revenue: ${OBSERVER_AD_REV_MO.toFixed(2)}/free user/mo.</span></p>
          <p className="print-text"><span className="font-semibold">Narration modes:</span> Seeker and Technician use Device narration only (0 credits, no ads). Explorer / Investigator / Trailblazer can use Device (free) or Enhanced (spends narration energy). Rewarded energy top-up ads apply to Explorer+ only.</p>
          <p className="print-muted text-xs italic">Note: Credits are charged per action at runtime. Users who don't exhaust their monthly energy allotment cost less. Analysis shows 100% utilization (worst case) and 50–70% (realistic average).</p>
          <p className="print-text text-xs font-semibold text-green-500 mt-2">✓ Energy gating is implemented. All actions below are gated — free (Observer) users are blocked, and paid users are limited by their monthly energy allotment. Costs shown reflect gated usage.</p>
          <p className="print-text text-xs mt-2"><span className="font-semibold text-amber-500">⚠ Two-Pass Stop Enrichment (Sept 2026):</span> Single-site tours (landmark, ship, cold_spot) now run a <span className="font-semibold">second LLM pass</span> (rewriteForStopFocus) to remove general property history and keep stop-specific content. This doubles the enrichment cost to ~{ENRICHMENT_CREDITS_SINGLE_SITE} credits for those tours (was {ENRICHMENT_CREDITS_MULTI_SITE}). Area/road_trip tours are unchanged (1 pass). <span className="font-semibold">The user still pays 1 manifestation energy per stop</span> — the extra cost is borne by the app owner. Blended average: ~{avgEnrichmentCredits} credits/enrichment. Blended manifestation rate: ~{blendedManifestationCredits} credits/manifestation energy (was {CREDITS_PER_MANIFESTATION}).</p>
          {isB && (
            <p className="print-text text-xs mt-2"><span className="font-semibold text-primary">Option E — Enrichment:</span> 1 manifestation energy now covers {batch} stops (was 1 per stop). Blended manifestation rate: ~{blendedManifestationCredits.toFixed(2)} credits per manifestation energy. Aura bundles split {auraSplit} narration/manifestation.</p>
          )}
        </div>
      </section>

      {/* 3a. Base44 Credit Capacity */}
      <section className="mb-8">
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">3a. Base44 Credit Capacity — When to Upgrade</h2>
        <p className="text-xs print-muted mb-3">Integration credits are hard-capped per plan tier. When exhausted, all AI actions (narration, tour generation, enrichment) FAIL with an error until the next monthly reset. You must upgrade plans to support more users — there is no pay-per-credit overflow.</p>
        <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr>
                <th className={th}>Base44 Plan</th>
                <th className={`${th} ${num}`}>$/mo</th>
                <th className={`${th} ${num}`}>Credits/mo</th>
                <th className={`${th} ${num}`}>$/credit</th>
                <th className={`${th} ${num}`}>Explorer users (100%)</th>
                <th className={`${th} ${num}`}>Investigator users (100%)</th>
                <th className={`${th} ${num}`}>Trailblazer users (100%)</th>
              </tr>
            </thead>
            <tbody>
              {BASE44_PLANS.map(p => {
                const explorerCredits = perUser100.explorer;
                const investigatorCredits = perUser100.investigator;
                const trailblazerCredits = perUser100.trailblazer;
                return (
                  <tr key={p.name}>
                    <td className={`${td} font-semibold print-text`}>{p.name}</td>
                    <td className={`${td} ${num} print-text`}>${p.monthlyCost}</td>
                    <td className={`${td} ${num} print-text`}>{p.credits.toLocaleString()}</td>
                    <td className={`${td} ${num} print-muted`}>${p.costPerCredit.toFixed(4)}</td>
                    <td className={`${td} ${num} print-text`}>~{Math.floor(p.credits / explorerCredits)}</td>
                    <td className={`${td} ${num} print-text`}>~{Math.floor(p.credits / investigatorCredits)}</td>
                    <td className={`${td} ${num} print-text`}>~{Math.floor(p.credits / trailblazerCredits)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-card/40 border border-border/40">
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">At 50% Realistic Utilization</p>
            <p className="text-sm print-text mt-1">Builder (10k credits) supports: ~{Math.floor(10000 / (perUser100.explorer * 0.5))} Explorer, ~{Math.floor(10000 / (perUser100.investigator * 0.5))} Investigator, ~{Math.floor(10000 / (perUser100.trailblazer * 0.5))} Trailblazer users</p>
            <p className="text-sm print-text">Pro (20k credits) supports: ~{Math.floor(20000 / (perUser100.explorer * 0.5))} Explorer, ~{Math.floor(20000 / (perUser100.investigator * 0.5))} Investigator, ~{Math.floor(20000 / (perUser100.trailblazer * 0.5))} Trailblazer users</p>
          </div>
          <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/30">
            <p className="text-[10px] font-heading uppercase tracking-wider text-green-500">Upgrade Triggers (100% Util)</p>
            <p className="text-sm print-text mt-1"><span className="font-semibold">Builder → Pro:</span> At ~{Math.floor(10000 / perUser100.explorer)} Explorer, ~{Math.floor(10000 / perUser100.investigator)} Investigator, or ~{Math.floor(10000 / perUser100.trailblazer)} Trailblazer active users</p>
            <p className="text-sm print-text"><span className="font-semibold">Pro → Elite:</span> At ~{Math.floor(20000 / perUser100.explorer)} Explorer, ~{Math.floor(20000 / perUser100.investigator)} Investigator, or ~{Math.floor(20000 / perUser100.trailblazer)} Trailblazer active users</p>
            <p className="text-xs text-green-500 print-text mt-1">✓ Free (Observer), Seeker, and Technician users consume 0 AI credits — only Explorer+ credits determine the required plan tier.</p>
          </div>
        </div>
        <p className="text-xs print-muted mt-2 italic">Credits reset monthly with no carryover. Seeker and Technician have 0 AI energy — 0 credits. Free (Observer) users are gated — 0 credits. Elite pricing is estimated — check base44.com/pricing for current rates.</p>
      </section>

      {/* 3b. Full Narration Cost Per Tour */}
      <section className="mb-8">
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">3b. Full Narration Cost Per Tour (All Tabs)</h2>
        <p className="text-xs print-muted mb-3">Each tour stop has 4 independent narration buttons (GenerateSpeech @ 1 credit / 50 chars). A "fully narrated tour" = narrating every tab at every stop + intro + conclusion.</p>
        <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Narration Component</th>
                <th className={`${th} ${num}`}>Typical Chars</th>
                <th className={`${th} ${num}`}>Credits</th>
                <th className={th}>Per</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className={`${td} print-text`}>Ghost Story (narration_text)</td><td className={`${td} ${num} print-text`}>~300</td><td className={`${td} ${num} print-text`}>~6</td><td className={`${td} print-muted`}>stop</td></tr>
              <tr><td className={`${td} print-text`}>History tab (historical_info)</td><td className={`${td} ${num} print-text`}>~1,000</td><td className={`${td} ${num} print-text`}>~20</td><td className={`${td} print-muted`}>stop</td></tr>
              <tr><td className={`${td} print-text`}>Paranormal tab (paranormal_info)</td><td className={`${td} ${num} print-text`}>~1,000</td><td className={`${td} ${num} print-text`}>~20</td><td className={`${td} print-muted`}>stop</td></tr>
              <tr><td className={`${td} print-text`}>Investigate tab (suggestions)</td><td className={`${td} ${num} print-text`}>~300</td><td className={`${td} ${num} print-text`}>~6</td><td className={`${td} print-muted`}>stop</td></tr>
              <tr className="font-semibold border-t-2 border-border"><td className={`${td} print-text`}>Per-Stop Total</td><td className={`${td} ${num} print-text`}>~2,600</td><td className={`${td} ${num} print-text`}>~{NARRATION_PER_STOP}</td><td className={`${td} print-muted`}>stop</td></tr>
              <tr><td className={`${td} print-text`}>Tour Introduction</td><td className={`${td} ${num} print-text`}>~500</td><td className={`${td} ${num} print-text`}>~10</td><td className={`${td} print-muted`}>tour</td></tr>
              <tr><td className={`${td} print-text`}>Tour Conclusion</td><td className={`${td} ${num} print-text`}>~500</td><td className={`${td} ${num} print-text`}>~10</td><td className={`${td} print-muted`}>tour</td></tr>
              <tr className="font-semibold border-t-2 border-primary/40 bg-primary/5"><td className={`${td} print-text`}>Full Tour ({AVG_STOPS_PER_TOUR} stops avg)</td><td className={`${td} ${num} print-text`}>~{(AVG_STOPS_PER_TOUR * 2600 + 1000).toLocaleString()}</td><td className={`${td} ${num} print-text`}>~{fullTourNarrationCredits}</td><td className={`${td} print-muted`}>tour</td></tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { plan: 'Explorer', narE: plans[3].narE, tours: toursPerEnergy(plans[3].narE) },
            { plan: 'Investigator', narE: plans[4].narE, tours: toursPerEnergy(plans[4].narE) },
            { plan: 'Trailblazer', narE: plans[5].narE, tours: toursPerEnergy(plans[5].narE) },
          ].map(t => (
            <div key={t.plan} className="p-3 rounded-lg bg-card/40 border border-border/40">
              <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">{t.plan}</p>
              <p className="text-lg font-bold text-foreground print-text">{t.narE.toLocaleString()} narration energy</p>
              <p className="text-sm text-primary print-text">~{t.tours} fully narrated tours/mo</p>
              <p className="text-[10px] text-muted-foreground print-muted">{t.narE} ÷ {fullTourNarrationCredits} credits/tour</p>
            </div>
          ))}
        </div>
        <p className="text-xs print-muted mt-2 italic">Cost per fully narrated tour: {fullTourNarrationCredits} credits × ${COST_PER_CREDIT.toFixed(4)} = ${(fullTourNarrationCredits * COST_PER_CREDIT).toFixed(2)}/tour in platform costs. Users who only narrate ghost stories (not all tabs) use ~{NARRATION_PER_STOP} credits/stop instead of ~{NARRATION_PER_STOP * 4} credits/stop, stretching energy ~4× further.</p>
      </section>

      {/* 3c. Credit Consumption Audit */}
      <section className="mb-8">
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">3c. Credit Consumption Audit — Every User Action</h2>
        <p className="text-xs print-muted mb-3">Complete inventory of every action that costs integration credits. "Gated = Yes" means the action is restricted by the energy system — free users are blocked, paid users are limited by their energy allotment. <span className="font-semibold text-green-500 print-text">All 12 toolkit tools are visible to all users (Oct 2026)</span> — locked tools show an upgrade prompt. See section 3e.</p>
        <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr>
                <th className={th}>Action</th>
                <th className={th}>Page / Location</th>
                <th className={th}>Type</th>
                <th className={th}>Integration</th>
                <th className={`${th} ${num}`}>Credits</th>
                <th className={`${th} ${num}`}>Gated?</th>
              </tr>
            </thead>
            <tbody>
              {creditAudit.map((item, i) => (
                <tr key={i} className={item.type === 'Narration' ? 'bg-accent/5' : ''}>
                  <td className={`${td} text-xs print-text`}>{item.action}</td>
                  <td className={`${td} text-xs print-muted`}>{item.page}</td>
                  <td className={`${td} text-xs print-text`}>{item.type}</td>
                  <td className={`${td} text-xs print-muted`}>{item.integration}</td>
                  <td className={`${td} ${num} text-xs print-text`}>{item.credits}</td>
                  <td className={`${td} ${num} text-xs font-semibold text-red-500 print-text`}>{item.gated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-2">
          <p className="text-sm font-semibold text-green-500 print-text">Gated Cost Risk (Now Mitigated)</p>
          <p className="text-xs print-text">Energy gating is implemented. Free (Observer) users are blocked from credit-consuming actions. Estimated monthly platform cost per active <span className="font-semibold">paid</span> user (energy-limited):</p>
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="p-3 rounded-lg bg-card/40 border border-border/40">
              <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Typical User</p>
              <p className="text-lg font-bold text-foreground print-text">{ungatedTypical.totalCredits} credits</p>
              <p className="text-sm text-primary print-text">${ungatedTypical.monthlyCost.toFixed(2)}/mo</p>
              <p className="text-[10px] text-muted-foreground print-muted">~1 tour + 8 enrichments + 1 weather + 10 narrations</p>
            </div>
            <div className="p-3 rounded-lg bg-card/40 border border-border/40">
              <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Heavy User</p>
              <p className="text-lg font-bold text-foreground print-text">{ungatedWorstCase.totalCredits} credits</p>
              <p className="text-sm text-primary print-text">${ungatedWorstCase.monthlyCost.toFixed(2)}/mo</p>
              <p className="text-[10px] text-muted-foreground print-muted">3 tours + 24 enrichments + 40 narrations + 20 sweeper triggers</p>
            </div>
          </div>
          <p className="text-xs text-green-500 print-text mt-2">At 1,000 free users, gating saves ~${(1000 * ungatedTypical.monthlyCost).toFixed(0)}/mo (typical) to ~${(1000 * ungatedWorstCase.monthlyCost).toFixed(0)}/mo (heavy) in platform costs.</p>
        </div>

        {/* 3d. Itemized Free-Credit Leak Breakdown */}
        <div className="mt-4 rounded-lg border border-green-500/30 bg-green-500/5 p-4">
          <h3 className="font-heading text-sm font-semibold text-foreground mb-1 print-text">3d. Credits Saved by Gating — Per-Action Breakdown (Typical Free User)</h3>
          <p className="text-xs print-muted mb-3">Every row below is an action that was previously ungated — now gated by the energy system. Free (Observer) users are blocked from all of these. "Auto" actions silently skip for free users. This breakdown shows the credits that <span className="font-semibold">would</span> leak if gating were removed — <span className="font-semibold text-green-500">{freeUserBreakdownTotal} credits = ${freeUserBreakdownCost.toFixed(2)}/mo per free user</span> is now saved by gating.</p>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr>
                  <th className={th}>Action</th>
                  <th className={th}>Trigger</th>
                  <th className={`${th} ${num}`}>Freq/mo</th>
                  <th className={`${th} ${num}`}>Credits Each</th>
                  <th className={`${th} ${num}`}>Total Credits</th>
                  <th className={`${th} ${num}`}>Cost/mo</th>
                  <th className={th}>Fix (Gate With)</th>
                </tr>
              </thead>
              <tbody>
                {freeUserBreakdown.map((r, i) => (
                  <tr key={i} className={r.type === 'Narration' ? 'bg-accent/5' : ''}>
                    <td className={`${td} text-xs print-text`}>{r.action}</td>
                    <td className={`${td} text-xs print-muted`}>{r.trigger}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{r.freq}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{r.creditsEach}</td>
                    <td className={`${td} ${num} text-xs font-semibold print-text`}>{r.totalCredits}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${r.monthlyCost.toFixed(2)}</td>
                    <td className={`${td} text-xs text-primary print-text`}>{r.fix}</td>
                  </tr>
                ))}
                <tr className="font-semibold border-t-2 border-green-500/40 bg-green-500/5">
                  <td className={`${td} print-text`} colSpan={4}>Total saved per free user / month</td>
                  <td className={`${td} ${num} print-text`}>{freeUserBreakdownTotal}</td>
                  <td className={`${td} ${num} print-text`}>${freeUserBreakdownCost.toFixed(2)}</td>
                  <td className={`${td} print-muted`}></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { users: 250, label: '250 free users' },
              { users: 1000, label: '1,000 free users' },
              { users: 2500, label: '2,500 free users' },
              { users: 5000, label: '5,000 free users' },
            ].map(s => (
              <div key={s.users} className="p-3 rounded-lg bg-card/40 border border-border/40 text-center">
                <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">{s.label}</p>
                <p className="text-lg font-bold text-green-500 print-text">${(s.users * freeUserBreakdownCost).toFixed(0)}/mo saved</p>
                <p className="text-[10px] text-muted-foreground print-muted">{(s.users * freeUserBreakdownTotal).toLocaleString()} credits/mo saved</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3e. Toolkit Visibility & AdGate */}
      <section className="mb-8">
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">3e. Toolkit Visibility & AdGate (Oct 2026 — IMPLEMENTED)</h2>
        <p className="text-xs print-muted mb-3">All 12 toolkit tools are visible to every user. <span className="font-semibold print-text">Observer (free)</span> gets 4 tools — 2 free (Equipment Guide, Safety Protocol) + 2 ad-gated (Audio Recorder, Radio Sweeper: 30s ad = 30s use, 300s/day cap per tool). <span className="font-semibold print-text">Seeker</span> gets the same 4 tools ad-free. <span className="font-semibold print-text">Technician & Explorer</span> get 10 of 12 tools. <span className="font-semibold print-text">Investigator+</span> get all 12. Tapping a locked tool shows an upgrade prompt. Observer's ad-gated tools are device-only (0 integration credits), so the ad revenue is nearly pure profit.</p>
        <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr>
                <th className={th}>Tier</th>
                <th className={`${th} ${num}`}>Visible</th>
                <th className={`${th} ${num}`}>Accessible</th>
                <th className={`${th} ${num}`}>Locked</th>
                <th className={th}>Accessible Tools</th>
                <th className={th}>Locked Tools (Upgrade Prompt)</th>
              </tr>
            </thead>
            <tbody>
              {toolkitTiers.map(t => (
                <tr key={t.tier}>
                  <td className={`${td} font-semibold print-text`}>{t.tier}</td>
                  <td className={`${td} ${num} print-text`}>{t.visible}</td>
                  <td className={`${td} ${num} print-text`}>{t.accessible}</td>
                  <td className={`${td} ${num} print-text`}>{t.locked}</td>
                  <td className={`${td} text-xs print-muted`}>{t.accessibleTools || ''}</td>
                  <td className={`${td} text-xs print-muted`}>{t.lockedTools || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="font-heading text-sm font-semibold text-foreground mb-2 mt-4 print-text">Newly Visible Costly Tools (Previously Hidden from Observer/Explorer)</h3>
        <p className="text-xs print-muted mb-3">These 4 tools were previously invisible to Observer and Explorer users. They are now visible but gated — tapping them shows an upgrade prompt. Two of the four consume credits when used; the other two are sensor/camera-only (no credit cost).</p>
        <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr>
                <th className={th}>Tool</th>
                <th className={th}>Required Tier</th>
                <th className={th}>Cost Type</th>
                <th className={th}>Credits</th>
                <th className={th}>Description</th>
              </tr>
            </thead>
            <tbody>
              {newlyVisibleCostlyTools.map(t => (
                <tr key={t.name}>
                  <td className={`${td} font-semibold print-text`}>{t.name}</td>
                  <td className={`${td} text-xs print-text`}>{t.tier}</td>
                  <td className={`${td} text-xs print-muted`}>{t.costType}</td>
                  <td className={`${td} text-xs print-text`}>{t.credits}</td>
                  <td className={`${td} text-xs print-muted`}>{t.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Per-Plan Profit */}
      <section className="mb-8">
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">4. Per-Plan Profit — Monthly, 100% Utilization</h2>
        <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Plan</th>
                <th className={`${th} ${num}`}>Price</th>
                <th className={`${th} ${num}`}>Credits/mo</th>
                <th className={`${th} ${num}`}>Platform Cost</th>
                <th className={`${th} ${num}`}>Store Fee (15%)</th>
                <th className={`${th} ${num}`}>Total Cost</th>
                <th className={`${th} ${num}`}>Profit</th>
                <th className={`${th} ${num}`}>Margin</th>
              </tr>
            </thead>
            <tbody>
              {monthlyAnalysis.map(r => (
                <tr key={r.plan}>
                  <td className={`${td} font-semibold print-text`}>{r.plan}</td>
                  <td className={`${td} ${num} print-text`}>${r.price.toFixed(2)}</td>
                  <td className={`${td} ${num} print-text`}>{r.credits}</td>
                  <td className={`${td} ${num} print-text`}>${r.platformCost.toFixed(2)}</td>
                  <td className={`${td} ${num} print-text`}>${r.sf.toFixed(2)}</td>
                  <td className={`${td} ${num} print-text`}>${r.totalCost.toFixed(2)}</td>
                  <td className={`${td} ${num} font-semibold print-text`}>${r.profit.toFixed(2)}</td>
                  <td className={`${td} ${num} print-text`}>{r.margin.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs print-muted mt-2 italic">Seeker and Technician have 0 AI energy — 0 platform credits. Their only cost is the 15% store fee, making them the highest-margin tiers. Explorer and Investigator consume platform credits (manifestation + narration) at 100% utilization.</p>
      </section>

      {/* 5. Trailblazer */}
      <section className="mb-8">
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">5. Trailblazer — {trailblazerMonths}-Month Lifetime ($239.99)</h2>
        <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Utilization</th>
                <th className={`${th} ${num}`}>Credits ({trailblazerMonths} mo)</th>
                <th className={`${th} ${num}`}>Platform Cost</th>
                <th className={`${th} ${num}`}>Store Fee (15%)</th>
                <th className={`${th} ${num}`}>Total Cost</th>
                <th className={`${th} ${num}`}>Profit</th>
                <th className={`${th} ${num}`}>Margin</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={`${td} font-semibold print-text`}>100% (max use)</td>
                <td className={`${td} ${num} print-text`}>{trailblazerAnalysis.credits.toLocaleString()}</td>
                <td className={`${td} ${num} print-text`}>${trailblazerAnalysis.platformCost.toFixed(2)}</td>
                <td className={`${td} ${num} print-text`}>${trailblazerAnalysis.sf.toFixed(2)}</td>
                <td className={`${td} ${num} print-text`}>${trailblazerAnalysis.totalCost.toFixed(2)}</td>
                <td className={`${td} ${num} font-semibold print-text`}>${trailblazerAnalysis.profit.toFixed(2)}</td>
                <td className={`${td} ${num} print-text`}>{trailblazerAnalysis.margin.toFixed(1)}%</td>
              </tr>
              <tr>
                <td className={`${td} font-semibold print-text`}>50% (realistic)</td>
                <td className={`${td} ${num} print-text`}>{trailblazer50.credits.toLocaleString()}</td>
                <td className={`${td} ${num} print-text`}>${trailblazer50.platformCost.toFixed(2)}</td>
                <td className={`${td} ${num} print-text`}>${trailblazer50.sf.toFixed(2)}</td>
                <td className={`${td} ${num} print-text`}>${trailblazer50.totalCost.toFixed(2)}</td>
                <td className={`${td} ${num} font-semibold print-text`}>${trailblazer50.profit.toFixed(2)}</td>
                <td className={`${td} ${num} print-text`}>{trailblazer50.margin.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs print-muted mt-2 italic">With {plans[5].narE.toLocaleString()} narration energy/month over 30 months, Trailblazer {trailblazerAnalysis.profit >= 0 ? `is profitable at 100% utilization (~${trailblazerAnalysis.margin.toFixed(0)}% margin = $${trailblazerAnalysis.profit.toFixed(0)} profit)` : `loses $${Math.abs(trailblazerAnalysis.profit).toFixed(0)} at 100% utilization (${trailblazerAnalysis.margin.toFixed(0)}% margin)`}. At 50% realistic usage, margin {trailblazer50.profit >= 0 ? `improves to ~${trailblazer50.margin.toFixed(0)}%` : `is ${trailblazer50.margin.toFixed(0)}%`}. The 300-slot cap protects against credit cost exposure.</p>
      </section>

      {/* 6. Aura Bundle Profit */}
      <section className="mb-8">
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">6. Aura Bundle Profit — 100% Utilization</h2>
        <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Bundle</th>
                <th className={`${th} ${num}`}>Price</th>
                <th className={`${th} ${num}`}>Credits</th>
                <th className={`${th} ${num}`}>Platform Cost</th>
                <th className={`${th} ${num}`}>Store Fee (15%)</th>
                <th className={`${th} ${num}`}>Profit</th>
                <th className={`${th} ${num}`}>Margin</th>
              </tr>
            </thead>
            <tbody>
              {bundleAnalysis.map(r => (
                <tr key={r.name}>
                  <td className={`${td} font-semibold print-text`}>{r.name}</td>
                  <td className={`${td} ${num} print-text`}>${r.priceNum.toFixed(2)}</td>
                  <td className={`${td} ${num} print-text`}>{Math.round(r.credits)}</td>
                  <td className={`${td} ${num} print-text`}>${r.platformCost.toFixed(2)}</td>
                  <td className={`${td} ${num} print-text`}>${r.sf.toFixed(2)}</td>
                  <td className={`${td} ${num} font-semibold print-text`}>${r.profit.toFixed(2)}</td>
                  <td className={`${td} ${num} print-text`}>{r.margin.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs print-muted mt-2 italic">Store fee (15%) applies to all IAP purchases. Aura bundles are one-time energy top-ups available to Seeker+ tiers (Technician routes 100% to Save Energy; Explorer+ splits {auraSplit} narration/manifestation).</p>
      </section>

      {/* 7. Fixed Operating Costs */}
      <section className="mb-8">
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">7. Fixed Operating Costs</h2>
        <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Item</th>
                <th className={`${th} ${num}`}>Cost</th>
                <th className={th}>Period</th>
              </tr>
            </thead>
            <tbody>
              {fixedCostsFirstYear.map(c => (
                <tr key={c.item}>
                  <td className={`${td} print-text`}>{c.item}</td>
                  <td className={`${td} ${num} print-text`}>${c.cost}</td>
                  <td className={`${td} print-muted`}>{c.period}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className={`${td} print-text`}>First-Year Total</td>
                <td className={`${td} ${num} print-text`}>${fixedFirstYearTotal}</td>
                <td className={`${td} print-muted`}>${(fixedFirstYearTotal / 12).toFixed(2)}/mo</td>
              </tr>
              <tr><td colSpan={3} className={`${td} text-center print-muted text-xs`}>— Year 2+ —</td></tr>
              {fixedCostsOngoing.map(c => (
                <tr key={c.item}>
                  <td className={`${td} print-text`}>{c.item}</td>
                  <td className={`${td} ${num} print-text`}>${c.cost}</td>
                  <td className={`${td} print-muted`}>{c.period}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className={`${td} print-text`}>Ongoing Annual Total</td>
                <td className={`${td} ${num} print-text`}>${fixedOngoingAnnual}</td>
                <td className={`${td} print-muted`}>${fixedOngoingMonthly.toFixed(2)}/mo</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs print-muted mt-2 italic">Google Play's $25 is a one-time fee (not recurring). CatDoes charges ${DEV_UPFRONT_ONE_TIME} upfront (one-time, no profit share). Base44 plan costs are shown as actual tier costs in section 9, not listed here as fixed costs.</p>
      </section>

      {/* 8. AdMob Ad Revenue */}
      <section className="mb-8">
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">8. AdMob Ad Revenue</h2>

        <h3 className="font-heading text-sm font-semibold text-foreground mb-2 print-text">8a. Interstitial Ads (Free Users)</h3>
        <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Free Users</th>
                <th className={`${th} ${num}`}>Monthly Revenue</th>
                <th className={`${th} ${num}`}>Annual Revenue</th>
              </tr>
            </thead>
            <tbody>
              {adMobScenarios.map(s => (
                <tr key={s.label}>
                  <td className={`${td} font-semibold print-text`}>{s.label}</td>
                  <td className={`${td} ${num} print-text`}>${s.monthlyRev.toFixed(2)}</td>
                  <td className={`${td} ${num} print-text`}>${s.annualRev.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs print-muted mt-2 italic">Model: {ADS_PER_TOUR} ads/tour × {TOURS_PER_FREE_USER_MO} tours/mo × ${ADMOB_PER_IMPRESSION.toFixed(3)}/impression = ${AD_REV_PER_FREE_USER_MO.toFixed(3)}/free user/mo. Stop 1 paranormal history is free; stops 2+ show interstitial ads. Ad revenue is not subject to store fees.</p>

        <h3 className="font-heading text-sm font-semibold text-foreground mb-2 mt-6 print-text">8b. Rewarded Ads (Explorer+ — Energy Top-Ups)</h3>
        <p className="text-xs print-muted mb-3">Explorer+ users who hit an energy gate can watch a rewarded ad for +{AD_REWARD_ENERGY} energy (up to {5}/day). Each ad generates ${ADMOB_REWARDED_PER_IMPRESSION.toFixed(3)} in ad revenue, but the granted energy costs {AD_REWARD_CREDITS_PER_AD.toFixed(2)} credits ({Math.round(AD_REWARD_CREDITS_PER_AD * AD_REWARD_UTILIZATION)} at {Math.round(AD_REWARD_UTILIZATION * 100)}% utilization) = ${((AD_REWARD_CREDITS_PER_AD * AD_REWARD_UTILIZATION * COST_PER_CREDIT)).toFixed(3)} in platform costs when consumed. <span className="font-semibold">Net: ${AD_REWARD_NET_PER_PAID_USER_MO.toFixed(3)}/paid user/mo</span> — a small retention cost that prevents churn at energy gates.</p>
        <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr>
                <th className={th}>Explorer+ Users</th>
                <th className={`${th} ${num}`}>Ad Rev/mo</th>
                <th className={`${th} ${num}`}>Energy Cost/mo</th>
                <th className={`${th} ${num}`}>Net/mo</th>
                <th className={`${th} ${num}`}>Credits/mo</th>
              </tr>
            </thead>
            <tbody>
              {rewardedAdScenarios.map(s => (
                <tr key={s.label}>
                  <td className={`${td} font-semibold print-text`}>{s.label}</td>
                  <td className={`${td} ${num} print-text`}>${s.monthlyAdRev.toFixed(2)}</td>
                  <td className={`${td} ${num} print-text`}>${s.monthlyEnergyCost.toFixed(2)}</td>
                  <td className={`${td} ${num} font-semibold print-text`}>${s.monthlyNet.toFixed(2)}</td>
                  <td className={`${td} ${num} print-muted`}>{s.monthlyCredits.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs print-muted mt-2 italic">Model: {ADS_PER_PAID_USER_MO} ads/paid user/mo × ${ADMOB_REWARDED_PER_IMPRESSION.toFixed(3)}/impression = ${AD_REWARD_REV_PER_PAID_USER_MO.toFixed(3)} ad rev/paid user/mo. The net cost is a retention investment — ad-reward credits are included in the Base44 plan-tier calculation in section 9a.</p>
      </section>

      {/* 9. Revenue Scenarios */}
      <section id="projections" className="mb-8 scroll-mt-4">
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">9. Revenue Scenarios (Monthly, 70% Avg Utilization)</h2>
        <p className="text-xs print-muted mb-3">Monthly profit and loss for the <span className="font-semibold print-text">app as built</span>, at four user scales (70% utilization of Explorer+ energy). Mix: ~30% Seeker, ~20% Technician, ~30% Explorer, ~15% Investigator, ~5% Trailblazer. Read down a column: users → subscription revenue → ad revenue → costs → profit.</p>
        <ScenarioPnLTable scenarios={scenarios} rows={pnlRows} />
        <p className="text-xs print-muted mt-2 italic">Trailblazer revenue amortized over 30 months. 5:1 free-to-paid ratio assumed. "Base44 Plan" = actual monthly plan tier cost for paid-user credits (from section 9a). Ad revenue = Observer stop ads + Observer narration ads + Observer tool ads + Observer/Seeker save ads + Explorer+ rewarded top-ups. Seeker and Technician use Device narration only and have 0 AI energy — 0 platform credits. Free (Observer) users are gated — 0 AI credits. Store fees apply only to IAP subscription revenue, not AdMob. RevenueCat 1% applies above $2,500/mo in subscription sales.</p>

        {/* 9a. Base44 Plan Required Per Scenario */}
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <h3 className="font-heading text-sm font-semibold text-foreground mb-3 print-text">9a. Base44 Plan Required Per Scenario</h3>
          <p className="text-xs print-muted mb-3">Total monthly integration credits consumed by paid users (at 70% utilization) plus credits from consumed ad-reward energy, and the minimum Base44 plan needed to support them. Seeker and Technician have 0 AI energy — 0 credits. Free (Observer) users are gated — 0 credits.</p>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className={th}>Scenario</th>
                  <th className={`${th} ${num}`}>Subscription Credits</th>
                  <th className={`${th} ${num}`}>Ad-Reward Credits</th>
                  <th className={`${th} ${num}`}>Total Credits</th>
                  <th className={th}>Base44 Plan</th>
                  <th className={`${th} ${num}`}>Plan Cost/mo</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map(s => (
                  <tr key={s.label}>
                    <td className={`${td} font-semibold print-text whitespace-nowrap`}>{s.label}</td>
                    <td className={`${td} ${num} print-text`}>{(s.totalCredits - s.rewardedAdCredits).toLocaleString()}</td>
                    <td className={`${td} ${num} print-muted`}>{s.rewardedAdCredits.toLocaleString()}</td>
                    <td className={`${td} ${num} font-semibold print-text`}>{s.totalCredits.toLocaleString()}</td>
                    <td className={`${td} print-text`}>
                      <span className="font-semibold">{s.base44Plan.plan}</span>
                      <span className="text-[10px] print-muted block">{s.base44Plan.plans > 1 ? `${s.base44Plan.plans} plans` : ''}</span>
                    </td>
                    <td className={`${td} ${num} print-text`}>${s.base44Plan.cost}/mo</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-card/40 border border-border/40">
              <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Builder Plan</p>
              <p className="text-sm print-text mt-1">10,000 credits/mo — $40/mo</p>
              <p className="text-[10px] print-muted">Supports ~{Math.floor(10000 / perUser100.explorer)} Explorer or ~{Math.floor(10000 / perUser100.investigator)} Investigator users at 100% utilization</p>
            </div>
            <div className="p-3 rounded-lg bg-card/40 border border-border/40">
              <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Pro Plan</p>
              <p className="text-sm print-text mt-1">20,000 credits/mo — $80/mo</p>
              <p className="text-[10px] print-muted">Supports ~{Math.floor(20000 / perUser100.explorer)} Explorer or ~{Math.floor(20000 / perUser100.investigator)} Investigator users at 100% utilization</p>
            </div>
            <div className="p-3 rounded-lg bg-card/40 border border-border/40">
              <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Elite Plan</p>
              <p className="text-sm print-text mt-1">50,000 credits/mo — $200/mo</p>
              <p className="text-[10px] print-muted">Supports ~{Math.floor(50000 / perUser100.explorer)} Explorer or ~{Math.floor(50000 / perUser100.investigator)} Investigator users at 100% utilization</p>
            </div>
          </div>
          <p className="text-xs text-green-500 print-text mt-3">✓ Energy gating is deployed — free (Observer), Seeker, and Technician users consume 0 AI credits. Only Explorer+ credits determine the required Base44 plan tier.</p>
          <p className="text-xs print-muted mt-1 italic">"Ad-Reward Credits" = credits from consumed ad-reward energy (paid users watching rewarded ads for +{AD_REWARD_ENERGY} energy top-ups). These are included in the total and can push the required Base44 plan tier higher. Elite pricing is estimated — check base44.com/pricing for current rates.</p>
        </div>
      </section>

      {/* 10. Key Takeaways */}
      <section className="mb-8">
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">10. Key Takeaways</h2>
        <div className="rounded-lg border border-border bg-card/40 print-block p-4 space-y-2 text-sm print-text">
          <p>• <span className="font-semibold text-red-500">✓ CREDIT CAPACITY: Base44 Builder plan includes only 10,000 credits/mo.</span> At 100% utilization that supports just ~{Math.floor(10000 / perUser100.explorer)} Explorer, ~{Math.floor(10000 / perUser100.investigator)} Investigator, or ~{Math.floor(10000 / perUser100.trailblazer)} Trailblazer users. Pro (20k credits) doubles capacity. Free (Observer), Seeker, and Technician users consume 0 AI credits — upgrade plans as you scale Explorer+ users only.</p>
          <p>• <span className="font-semibold text-green-500">✓ Energy gating is deployed.</span> All 27 credit-consuming actions are gated. Free (Observer) users are blocked from creating tours, narrating, enriching stops, and using sweepers. Paid users are limited by their monthly energy allotment.</p>
          <p>• <span className="font-semibold text-green-500">✓ NEW HIGH-MARGIN TIERS (Oct 2026):</span> Seeker ($3.99/mo) and Technician ($5.99/mo) have 0 AI energy — they consume 0 platform credits. Their only cost is the 15% store fee. Seeker nets ~${(3.99 * 0.85).toFixed(2)}/mo, Technician ~${(5.99 * 0.85).toFixed(2)}/mo per user. These tiers capture ad-averse users without AI features, adding high-margin revenue that subsidizes the credit-consuming Explorer+ tiers.</p>
          <p>• <span className="font-semibold text-green-500">✓ OBSERVER AD REVENUE (as built):</span> each free user earns ~${OBSERVER_AD_REV_MO.toFixed(2)}/mo — stop ads ${AD_REV_PER_FREE_USER_MO.toFixed(2)} + narration ads ${NARRATION_AD_REV_PER_FREE_USER_MO.toFixed(2)} ({OBSERVER_NARRATION_ADS_PER_TOUR} ads per fully narrated tour) + tool ads ${TOOL_USE_AD_REV_OBSERVER_MO.toFixed(2)} + save ads ${SAVE_AD_REV_MO.toFixed(2)}. At 5,000 free users that is ~${Math.round(5000 * OBSERVER_AD_REV_MO).toLocaleString()}/mo. Seeker and Technician use Device narration only: 0 AI credits and no stop or narration ads (Seeker earns only ad-watched evidence saves).</p>
          <p>• <span className="font-semibold">27 credit-consuming actions identified</span> across 14 manifestation (InvokeLLM) and 13 narration (GenerateSpeech) actions. Full audit in section 3c.</p>
          <p>• <span className="font-semibold">Store fees (15% IAP)</span> are the largest non-platform cost — significantly higher than traditional payment processing (2.9% + $0.30). The app publishes natively via Apple/Google IAP.</p>
          <p>• <span className="font-semibold">Full narration cost:</span> Each fully narrated tour (all 4 tabs per stop + intro + conclusion) costs ~{fullTourNarrationCredits} credits = ${(fullTourNarrationCredits * COST_PER_CREDIT).toFixed(2)}/tour in platform costs. Energy budgets support: Explorer ~{toursPerEnergy(plans[3].narE)} tour/mo, Investigator ~{toursPerEnergy(plans[4].narE)} tours/mo, Trailblazer ~{toursPerEnergy(plans[5].narE)} tours/mo.</p>
          <p>• <span className="font-semibold">Per-plan margins at 100% utilization:</span> Seeker ~{monthlyAnalysis[0].margin.toFixed(0)}% (0 credits), Technician ~{monthlyAnalysis[1].margin.toFixed(0)}% (0 credits), Explorer ~{monthlyAnalysis[2].margin.toFixed(0)}%, Investigator ~{monthlyAnalysis[3].margin.toFixed(0)}%. Seeker and Technician are the highest-margin tiers (0 AI energy = 0 platform cost). All tiers are healthier when energy goes unused.</p>
          <p>• <span className="font-semibold text-green-500">✓ Trailblazer is {trailblazerAnalysis.profit >= 0 ? 'profitable at all utilization levels' : 'profitable at 50% utilization'}</span> (~{trailblazerAnalysis.margin.toFixed(0)}% margin at 100% = ${trailblazerAnalysis.profit.toFixed(0)} profit over 30 months; ~{trailblazer50.margin.toFixed(0)}% at 50% realistic usage). The 300-slot cap protects against credit cost exposure.</p>
          <p>• <span className="font-semibold">AdMob revenue</span> from free users (interstitial) meaningfully supplements subscription income — 5,000 free users generate ~${(5000 * AD_REV_PER_FREE_USER_MO).toFixed(0)}/mo, offsetting platform and store costs.</p>
          <p>• <span className="font-semibold">Rewarded ads</span> (Explorer+ users) generate ~${AD_REWARD_REV_PER_PAID_USER_MO.toFixed(2)}/paid user/mo in ad revenue, but the granted energy costs ~${AD_REWARD_COST_PER_PAID_USER_MO.toFixed(2)}/paid user/mo in platform credits when consumed (net ~${AD_REWARD_NET_PER_PAID_USER_MO.toFixed(2)}/paid user/mo). This is a <span className="font-semibold">retention investment</span>, not a profit center.</p>
          <p>• <span className="font-semibold">Fixed costs</span> (~${fixedOngoingMonthly.toFixed(0)}/mo ongoing) are negligible at scale but matter for small operations. First-year total: ${fixedFirstYearTotal} (includes ${DEV_UPFRONT_ONE_TIME} CatDoes upfront).</p>
          <p>• <span className="font-semibold">RevenueCat</span> 1% above $2,500/mo is minimal vs. store fees — only ~${revenuecatFee(scenarios[3].subRev).toFixed(0)}/mo at the Mature scenario.</p>
          <p>• <span className="font-semibold">RISK:</span> Apple's fee jumps to 30% above ${(STORE_HIGH_THRESHOLD / 1000000).toFixed(0)}M/yr revenue. At that rate, Trailblazer becomes a small loss at 100% utilization (~-7% margin) but remains profitable at 50% realistic usage (~31% margin). Revisit pricing before crossing ${(STORE_HIGH_THRESHOLD / 1000000).toFixed(0)}M.</p>
          <p>• <span className="font-semibold text-green-500">✓ Toolkit AdGate (Oct 2026 — IMPLEMENTED):</span> Observer gets 4 tools (2 ad-gated: Audio Recorder, Radio Sweeper — 30s ad = 30s use, 300s/day cap). Seeker gets 4 ad-free. Technician/Explorer get 10. Investigator+ get all 12. Device-only ad-gated tools cost 0 credits — ad revenue is nearly pure profit. See section 3e.</p>
          <p>• <span className="font-semibold text-amber-500">⚠ Two-pass stop enrichment (Sept 2026):</span> Single-site tours run a second LLM pass. Blended average ~{avgEnrichmentCredits} credits/enrichment. Blended manifestation rate ~{blendedManifestationCredits} credits/manifestation energy (was {CREDITS_PER_MANIFESTATION}). The extra cost is borne by the app owner, not the user.</p>
          {isB && (
            <p>• <span className="font-semibold text-primary">Option E — Hybrid energy:</span> Explorer {plans[3].manE}/{plans[3].narE.toLocaleString()}, Investigator/Trailblazer {plans[4].manE}/{plans[4].narE.toLocaleString()} energy. Enrichment: 1 energy per {batch} stops. Aura bundles: {auraSplit} split. Blended manifestation rate ~{blendedManifestationCredits.toFixed(2)} credits/energy. See Cost Analysis A for the current app-store numbers.</p>
          )}
        </div>
      </section>

      <footer className="text-center text-xs print-muted pt-4 border-t border-border/50">
        AGES — Accessible Ghost Exploration Solutions · Cost Analysis {optionKey}{isB ? ' (Option E — Hybrid energy)' : ''} · {today}
      </footer>
    </div>
  );
}