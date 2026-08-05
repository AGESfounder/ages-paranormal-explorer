import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Code2, Zap, Megaphone, CreditCard, Database, Smartphone, Shield, FileCode, Copy, Check } from 'lucide-react';
import PageContainer from '@/components/PageContainer';
import SectionHeader from '@/components/SectionHeader';

function CodeBlock({ code, label }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative rounded-lg border border-border bg-background/60 overflow-hidden">
      {label && (
        <div className="px-3 py-1.5 border-b border-border/50 bg-card/40 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          {label}
        </div>
      )}
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-card/60 border border-border/50 text-muted-foreground hover:text-foreground hover:bg-card transition-colors z-10"
        aria-label="Copy code"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <pre className="text-log p-3 overflow-x-auto text-[11px] leading-relaxed font-mono text-foreground/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Section({ icon: Icon, title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border/40 bg-card/30 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-card/50 transition-colors"
      >
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <h2 className="flex-1 font-heading text-sm font-semibold tracking-wide text-foreground uppercase">{title}</h2>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="px-4 pb-4 space-y-3"
        >
          {children}
        </motion.div>
      )}
    </div>
  );
}

function Info({ children }) {
  return <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>;
}

export default function DeveloperDocs() {
  return (
    <PageContainer>
      <SectionHeader title="Developer Docs" subtitle="Native bridge & integration reference" showBack />
      <div className="px-4 pb-28 pt-3 space-y-3 max-w-2xl mx-auto">

        <div className="p-4 rounded-xl border border-primary/20 bg-primary/5">
          <p className="text-xs text-foreground/80 leading-relaxed">
            This page is a technical reference for the developer handling the Capacitor export,
            AdMob plugin, and in-app purchase migration. All file paths, function names, entity
            fields, and bridge interfaces are documented below.
          </p>
        </div>

        {/* ── Capacitor Export ── */}
        <Section icon={Smartphone} title="Capacitor Export Setup" defaultOpen>
          <Info>
            The Base44 web app is exported and wrapped in a Capacitor native container for iOS/Android.
            After exporting the project, initialize Capacitor and add the native platforms.
          </Info>
          <CodeBlock label="Terminal — after exporting the Base44 project" code={`npm install @capacitor/core @capacitor/cli
npm install @capacitor/ios @capacitor/android
npx cap init "AGES" "com.ages.paranormal"
npx cap add ios
npx cap add android
npx cap sync`} />
          <Info>
            The web build output must be pointed at in <code className="text-primary">capacitor.config.ts</code>:
          </Info>
          <CodeBlock label="capacitor.config.ts" code={`import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ages.paranormal',
  appName: 'AGES',
  webDir: 'dist',  // or 'build' — match the Base44 export output dir
  server: {
    androidScheme: 'https',
  },
};

export default config;`} />
          <Info>
            After every web build, run <code className="text-primary">npx cap sync</code> to copy the
            updated web assets into the native projects.
          </Info>
        </Section>

        {/* ── AdMob Plugin ── */}
        <Section icon={Megaphone} title="AdMob Plugin & Ad Unit IDs">
          <Info>
            Interstitial ads (free users, stops 2+) and rewarded video ads (paid users earning energy)
            both use the <code className="text-primary">@capacitor-community/admob</code> plugin. The
            bridge detection is already implemented in <code className="text-primary">src/lib/adService.js</code> —
            it auto-detects <code className="text-primary">window.Capacitor.Plugins.AdMob</code> and falls
            back to a timed simulation in web preview.
          </Info>
          <CodeBlock label="Terminal — install AdMob plugin" code={`npm install @capacitor-community/admob
npx cap sync`} />
          <Info>
            Replace the placeholder ad-unit IDs in <code className="text-primary">src/lib/adService.js</code>:
          </Info>
          <CodeBlock label="src/lib/adService.js — lines 29-30 & 90-91" code={`// Interstitial (free users)
export const INTERSTITIAL_AD_ID_IOS = 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX';
export const INTERSTITIAL_AD_ID_ANDROID = 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX';

// Rewarded video (paid users earn energy)
export const REWARDED_AD_ID_IOS = 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX';
export const REWARDED_AD_ID_ANDROID = 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX';`} />
          <Info>
            The plugin must be registered in the native entry files so <code className="text-primary">window.Capacitor.Plugins.AdMob</code> is available:
          </Info>
          <CodeBlock label="ios/App/AppDelegate.swift" code={`import AdMob
// inside application(_:didFinishLaunchingWithOptions:)
AdMob.initialize()`} />
          <CodeBlock label="android/app/src/main/MainActivity.kt" code={`// inside onCreate():
registerPlugin(AdMob::class.java)`} />
          <Info>
            <strong className="text-foreground">App Tracking Transparency (iOS 14+):</strong> Add the
            <code className="text-primary">NSUserTrackingUsageDescription</code> key to Info.plist with a
            description, and request permission before loading ads.
          </Info>
        </Section>

        {/* ── Rewarded Ad Flow ── */}
        <Section icon={Zap} title="Rewarded Ad → Energy Grant Flow">
          <Info>
            Paid users who run out of energy can watch a rewarded ad to earn 20 energy (16 narration +
            4 manifestation). The flow spans the client bridge, a backend function, and the User entity.
          </Info>
          <CodeBlock label="Client flow (UpgradePrompt.jsx & AdRewardCard.jsx)" code={`// 1. Show the rewarded ad via the native bridge
const result = await showRewardedAd();  // src/lib/adService.js
// result = { rewarded: true } on completion

// 2. Grant energy server-side (enforces daily cap)
const response = await base44.functions.invoke('grant-ad-reward', {});
// response.data = { success, granted, remaining, aura_narration_energy, aura_manifestation_energy }

// 3. Notify all useEnergyGate hook instances to refresh
window.dispatchEvent(new CustomEvent('ad-reward-granted'));`} />
          <Info>
            <strong className="text-foreground">Backend function:</strong>{' '}
            <code className="text-primary">base44/functions/grant-ad-reward/entry.ts</code>
          </Info>
          <CodeBlock label="grant-ad-reward/entry.ts — what it does" code={`// - Reads the authenticated user via base44.auth.me()
// - Only paid users (or admins) can earn rewards (403 otherwise)
// - Enforces a 5/day cap using ad_rewards_count + ad_rewards_date
// - Grants 20 energy to the aura (rollover) pool:
//     80% narration  → aura_narration_energy  (+16)
//     20% manifestation → aura_manifestation_energy (+4)
// - Updates the User record as service role
// - Returns { success, granted, remaining, aura_narration_energy, aura_manifestation_energy }`} />
          <Info>
            <strong className="text-foreground">Constants</strong> live in{' '}
            <code className="text-primary">base44/shared/adRewards.js</code> (backend) and{' '}
            <code className="text-primary">src/lib/adRewards.js</code> (frontend display copy):
          </Info>
          <CodeBlock label="base44/shared/adRewards.js" code={`export const AD_REWARD_ENERGY = 20;        // energy per ad
export const AD_REWARD_DAILY_LIMIT = 5;     // max ads/day
export const AD_REWARD_NARRATION_PCT = 0.8; // 80% → narration
export const AD_REWARD_MANIFESTATION_PCT = 0.2; // 20% → manifestation`} />
        </Section>

        {/* ── Security: SSV ── */}
        <Section icon={Shield} title="AdMob Server-Side Verification (SSV)">
          <Info>
            In web preview, <code className="text-primary">grant-ad-reward</code> is called directly by
            the client after a simulated ad. For production, configure AdMob Server-Side Verification so
            AdMob calls the function with a verified callback — preventing energy farming via spoofed
            client calls.
          </Info>
          <CodeBlock label="AdMob SSV setup (per rewarded ad unit)" code={`// In the AdMob console → Rewarded ad unit → SSV:
//   - Set the callback URL to your deployed function endpoint:
//       https://<your-app>.base44.app/api/functions/grant-ad-reward
//   - AdMob will POST a signed callback with:
//       ad_network, ad_unit, reward_amount, custom_id, key_id, signature
//   - The function must verify the signature using your AdMob SSV public key
//     (store it as an app secret, e.g. ADMOB_SSV_PUBLIC_KEY)

// The grant logic in grant-ad-reward/entry.ts stays the same —
// only the entry point changes from "client calls directly" to
// "AdMob calls with a verified SSV callback".`} />
          <Info>
            <strong className="text-foreground">Current state:</strong> The function reads the user from
            <code className="text-primary">base44.auth.me()</code> (the app user's session). For SSV, you'll
            need to pass the user ID in the <code className="text-primary">custom_id</code> SSV parameter
            and look up the user by ID instead of session.
          </Info>
        </Section>

        {/* ── User Entity Fields ── */}
        <Section icon={Database} title="User Entity — Energy & Ad Fields">
          <Info>
            These custom fields on the built-in User entity track subscription plan, energy balances,
            and ad reward caps. They are read/written by the energy gate hook and the grant-ad-reward function.
          </Info>
          <CodeBlock label="User entity custom fields" code={`plan                    string   // 'observer' | 'explorer' | 'investigator' | 'trailblazer'
subscription_status     string   // 'active' | 'none'
plan_expiration_date    string   // ISO date (Trailblazer only)
energy_reset_date       string   // ISO date — next monthly reset

manifestation_energy    number   // monthly pool, resets monthly
narration_energy        number   // monthly pool, resets monthly
aura_manifestation_energy number // rollover pool (purchased + ad rewards), never expires
aura_narration_energy   number   // rollover pool (purchased + ad rewards), never expires

ad_rewards_count        number   // ads watched today
ad_rewards_date         string   // YYYY-MM-DD (UTC), resets the counter daily`} />
          <Info>
            <strong className="text-foreground">Admin bypass:</strong> Users with{' '}
            <code className="text-primary">role === 'admin'</code> bypass all energy gates and ad caps
            (see <code className="text-primary">useEnergyGate.js</code> and{' '}
            <code className="text-primary">grant-ad-reward/entry.ts</code>).
          </Info>
        </Section>

        {/* ── Energy Gate Hook ── */}
        <Section icon={Code2} title="Energy Gate Hook (useEnergyGate)">
          <Info>
            <code className="text-primary">src/hooks/useEnergyGate.js</code> is the central gate for all
            credit-consuming actions (InvokeLLM, GenerateSpeech). Every page that triggers AI features
            uses it.
          </Info>
          <CodeBlock label="Usage — gate + spend pattern" code={`const {
  gateManifestation, spendManifestation,   // InvokeLLM / tour generation
  gateNarration, spendNarration,           // GenerateSpeech / narration
  estimateNarrationCost,                   // ceil(text.length / 50), capped 1-100
  showUpgrade, setShowUpgrade, gateReason, // drives <UpgradePrompt />
  isPaid, manEnergy, auraManEnergy, narEnergy, auraNarEnergy,
} = useEnergyGate();

// Manifestation (1 credit per call)
if (!gateManifestation()) return;  // shows UpgradePrompt if blocked
await callJson(prompt);
await spendManifestation();

// Narration (cost = ceil(text.length / 50))
if (!gateNarration(text)) return;
await narrate(text);
await spendNarration(estimateNarrationCost(text));`} />
          <Info>
            The hook auto-refreshes user state when it receives the{' '}
            <code className="text-primary">'ad-reward-granted'</code> window event, so earned energy is
            immediately usable without a page reload.
          </Info>
        </Section>

        {/* ── IAP Migration ── */}
        <Section icon={CreditCard} title="In-App Purchase Migration (RevenueCat)">
          <Info>
            Apple/Google require digital subscriptions to use native IAP. The current Wix/Base44 Payments
            checkout works for web but must be replaced with StoreKit (iOS) / Google Play Billing (Android)
            in the native build. RevenueCat is the recommended cross-platform wrapper.
          </Info>
          <Info>
            <strong className="text-foreground">Product IDs to create in App Store Connect & Play Console</strong>{' '}
            (map 1:1 to the existing Wix product IDs in{' '}
            <code className="text-primary">base44/shared/plans.js</code>):
          </Info>
          <CodeBlock label="IAP product IDs (suggested)" code={`// Subscriptions (auto-renewing)
explorer_monthly     $7.99/mo    →  plan: 'explorer'
explorer_annual     $79.99/yr    →  plan: 'explorer'
investigator_monthly $11.99/mo   →  plan: 'investigator'
investigator_annual $119.99/yr   →  plan: 'investigator'

// Non-consumable (one-time, 30-month access)
trailblazer        $239.99       →  plan: 'trailblazer' (30 months)

// Consumable (energy bundles — buy repeatedly)
flicker              $2.99       →  150 energy (aura)
apparition            $6.49       →  500 energy (aura)
haunting             $16.99       →  1500 energy (aura)
spectral             $24.99       →  2500 energy (aura)`} />
          <Info>
            <strong className="text-foreground">Migration approach:</strong> Replace the{' '}
            <code className="text-primary">create-subscription</code> /{' '}
            <code className="text-primary">create-checkout</code> function calls in{' '}
            <code className="text-primary">Dashboard.jsx</code> (handlePurchase) with RevenueCat
            <code className="text-primary">purchasePackage()</code> calls. Keep the{' '}
            <code className="text-primary">payments-webhook</code> grant logic — point RevenueCat webhooks
            at it instead of Wix, mapping the same <code className="text-primary">product_id</code> values
            through <code className="text-primary">getGrantForProduct()</code> in{' '}
            <code className="text-primary">base44/shared/plans.js</code>.
          </Info>
          <CodeBlock label="RevenueCap capacitor plugin" code={`npm install @revenuecat/purchases-capacitor
npx cap sync

// In app init:
import { Purchases } from '@revenuecat/purchases-capacitor';
await Purchases.configure({ apiKey: 'appl_XXXXX' }); // or 'goog_XXXXX'`} />
        </Section>

        {/* ── Payment Webhook ── */}
        <Section icon={FileCode} title="Payment Webhook Flow">
          <Info>
            <code className="text-primary">base44/functions/payments-webhook/entry.ts</code> handles
            Wix/Base44 Payments events. It verifies JWT signatures, then grants access via{' '}
            <code className="text-primary">getGrantForProduct()</code>.
          </Info>
          <CodeBlock label="Webhook event handling" code={`// ORDER_APPROVED  → grants plan/energy, marks purchase 'paid', stores subscription_id
// SUBSCRIPTION_CANCELED → downgrades user to 'observer', resets energy
// SUBSCRIPTION_ENDED    → downgrades user to 'observer', resets energy

// The webhook is registered via wix_payments_register_webhook with all three
// event types. If cancellations stop revoking access, re-register with all
// three (each call replaces the previous registration).`} />
          <Info>
            <strong className="text-foreground">For IAP:</strong> RevenueCat sends its own webhooks
            (initial_purchase, renewal, cancellation). Create a new backend function (e.g.{' '}
            <code className="text-primary">revenuecat-webhook</code>) that verifies the RC signature and
            calls the same <code className="text-primary">getGrantForProduct()</code> logic.
          </Info>
        </Section>

        {/* ── File Reference ── */}
        <Section icon={FileCode} title="Key File Reference">
          <CodeBlock label="Files to modify / know for native build" code={`// Ad bridge (already implemented — just set ad unit IDs)
src/lib/adService.js              // showInterstitial(), showRewardedAd()
src/lib/adRewards.js              // AD_REWARD_ENERGY, AD_REWARD_DAILY_LIMIT (frontend)

// Backend functions
base44/functions/grant-ad-reward/entry.ts   // energy grant + daily cap
base44/functions/payments-webhook/entry.ts  // Wix payment → access grant
base44/functions/create-checkout/entry.ts    // Wix checkout session
base44/functions/create-subscription/entry.ts // Wix subscription checkout

// Shared logic
base44/shared/plans.js             // PLANS, AURA_BUNDLES, WIX_PRODUCTS, getGrantForProduct
base44/shared/adRewards.js         // ad reward constants + split logic

// Frontend energy gating
src/hooks/useEnergyGate.js         // gate + spend hook (all AI actions)
src/components/UpgradePrompt.jsx  // upgrade/ad-watch modal (energy gate)
src/components/AdRewardCard.jsx    // dashboard ad-watch card
src/components/EnergyCostBadge.jsx // shows credit cost on action buttons

// Dashboard (purchase entry points)
src/pages/Dashboard.jsx            // handlePurchase() → create-subscription`} />
        </Section>

      </div>
    </PageContainer>
  );
}