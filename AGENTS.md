# AGES Explorer

## Architecture
- The primary app is a Vite + React SPA in `src/`.
- Routing uses `react-router-dom` in `src/App.jsx`.
- Base44 provides authentication, entities, file storage, LLM/TTS workflows, and server functions in `base44/`.
- The app remains the source of truth for screens, navigation, branding, data, audio, tours, maps, evidence tools, and backend behavior.

## Native shell
- Capacitor 7 wraps the existing web build for iOS and Android.
- Native projects live in `ios/` and `android/`.
- `capacitor.config.ts` loads the Vite output from `dist/` with app id `com.ages.explorer`.
- The Capacitor layer is an integration shell. Do not recreate the existing UI in React Native or redesign pages.

## Ads (AdMob)
- Plugin: `@capacitor-community/admob@7.0.0` (Capacitor 7-compatible).
- Seam: `src/lib/adService.js` — production interstitial/rewarded unit IDs, UMP consent bootstrap, iOS ATT, NPA when tracking unavailable, web simulation fallback.
- Bootstrap: `initializeAdMob()` from `src/App.jsx` after auth/public-settings settle (native only; web no-op).
- UI callers unchanged: `AdGate` (interstitial fail-open), `AdRewardCard` / `UpgradePrompt` (rewarded → client `grant-ad-reward`).
- Consent: conservative fail-closed gate (`OBTAINED` / `NOT_REQUIRED` only). No privacy-options button (v7 lacks live privacy-options API; do not fake with `resetConsentInfo`).
- Audience: general public — `MaxAdContentRating.General`, not child-directed / under-age.
- SSV audit: `base44/functions/admob-ssv` verifies Google's signed GET callback, allow-lists the two production rewarded units, and writes `AdMobReward` by `transaction_id` (idempotent). Does **not** grant a second energy reward. Immediate client `grant-ad-reward` remains the UX path and is not SSV-proof against a malicious direct invoke.
- Native App IDs live in Android `strings.xml` / manifest meta-data and iOS `GADApplicationIdentifier` (never put ad-unit IDs in App ID slots).

## Billing
- **Web checkout:** Wix via `create-subscription` + `payments-webhook` (unchanged) — all products on web: Explorer/Investigator subscriptions, Aura bundles, and Trailblazer.
- **iOS Explorer/Investigator:** RevenueCat (`@revenuecat/purchases-capacitor`) StoreKit subscriptions. `revenuecat-webhook` grants the generic Base44 entitlement fields (`plan`, `plan_expiration_date`, `subscription_status`, `subscription_id`, energy) — the same fields the Wix webhook writes. iOS Trailblazer stays on the Wix path.
- **iOS Aura bundles:** RevenueCat/StoreKit **consumables** — `com.ages.explorer.aura.{flicker,apparition,haunting,spectral}`. `revenuecat-webhook` adds to the existing `aura_narration_energy` / `aura_manifestation_energy` rollover fields at the existing `AURA_BUNDLES` reward amounts (80/20 split via `getGrantForProduct`), idempotent by `transaction_id` in `RevenueCatPurchase`; refunds claw back only the granted amounts. Consumables never touch plan/subscription fields. Web and Android Aura bundles stay on the Wix path.
- **Android Trailblazer:** RevenueCat (`@revenuecat/purchases-capacitor`) purchases Google Play product `trailblazer.30month` ($239.99 one-time). Public keys: `VITE_REVENUECAT_IOS_API_KEY`, `VITE_REVENUECAT_ANDROID_API_KEY`.
- Google product is **not** mapped to RevenueCat entitlement `trailblazer` (Apple-owned). Access is **not** granted from SDK entitlements.
- `revenuecat-webhook` reconciles Play purchases into isolated User fields (`google_trailblazer_*`) and `RevenueCatPurchase` ledger rows. Grant = purchase timestamp + 30 calendar months (UTC). Refunds clear only Google fields.
- Client seam `src/lib/revenuecat.js`; Dashboard `handlePurchase` routes by platform. RevenueCat grants land server-side via webhook — the client polls `auth.me()` and never trusts SDK entitlements.
- Client paid checks use `src/lib/access.js` (mirrors `base44/shared/access.js`): effective plan honors generic `plan`/`plan_expiration_date` **and** active Google expiry. Expired Google access does not unlock paid features; Apple/Wix access stays independent.

## Commands
- `npm run dev` starts the existing Vite app.
- `npm run build` creates the web bundle.
- `npm run cap:sync` builds and syncs web assets into both native projects.
- `npm run cap:open:ios` opens the iOS project in Xcode.
- `npm run cap:open:android` opens the Android project in Android Studio.

## Native notes
- Android `MainActivity` launchMode is `standard` (required for Google Play purchase flows).
- AdMob App IDs, ATT usage description, and SKAdNetwork items are configured in the native shells; exercise consent/ads/SSV on physical devices before release.