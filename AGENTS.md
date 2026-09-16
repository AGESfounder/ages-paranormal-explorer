# AGES Explorer

## Architecture
- The primary app is a Vite + React web SPA in `src/`.
- Routing uses `react-router-dom` in `src/App.jsx`.
- Base44 provides authentication, entities, file storage, LLM/TTS workflows, and server functions in `base44/`.
- The app remains the source of truth for screens, navigation, branding, data, audio, tours, maps, evidence tools, and backend behavior.

## Native shell
- Capacitor 7 wraps the existing web build for iOS and Android.
- Native projects live in `ios/` and `android/`.
- `capacitor.config.ts` loads the Vite output from `dist/` with app id `com.ages.explorer`.
- The Capacitor layer is an integration shell. Do not recreate the existing UI in React Native or redesign pages.

## Billing
- **Web / iOS checkout:** Wix via `create-subscription` + `payments-webhook` (unchanged). Explorer, Investigator, Aura bundles, and web/iOS Trailblazer still use this path.
- **Android Trailblazer:** RevenueCat (`@revenuecat/purchases-capacitor`) purchases Google Play product `trailblazer.30month` ($239.99 one-time). Public keys: `VITE_REVENUECAT_IOS_API_KEY`, `VITE_REVENUECAT_ANDROID_API_KEY`.
- Google product is **not** mapped to RevenueCat entitlement `trailblazer` (Apple-owned). Access is **not** granted from SDK entitlements.
- `revenuecat-webhook` reconciles Play purchases into isolated User fields (`google_trailblazer_*`) and `RevenueCatPurchase` ledger rows. Grant = purchase timestamp + 30 calendar months (UTC). Refunds clear only Google fields.
- Client paid checks use `src/lib/access.js` (mirrors `base44/shared/access.js`): effective plan honors generic `plan`/`plan_expiration_date` **and** active Google expiry. Expired Google access does not unlock paid features; Apple/Wix access stays independent.

## Commands
- `npm run dev` starts the existing Vite app.
- `npm run build` creates the web bundle.
- `npm run cap:sync` builds and syncs web assets into both native projects.
- `npm run cap:open:ios` opens the iOS project in Xcode.
- `npm run cap:open:android` opens the Android project in Android Studio.

## Native notes
- Android `MainActivity` launchMode is `standard` (required for Google Play purchase flows).
- AdMob is not integrated yet. Preserve existing ad gate / reward flows until native ads are verified.