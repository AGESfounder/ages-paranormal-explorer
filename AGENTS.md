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

## Commands
- `npm run dev` starts the existing Vite app.
- `npm run build` creates the web bundle.
- `npm run cap:sync` builds and syncs web assets into both native projects.
- `npm run cap:open:ios` opens the iOS project in Xcode.
- `npm run cap:open:android` opens the Android project in Android Studio.

## Native roadmap
- Validate the existing app in both Capacitor shells before adding native monetization.
- RevenueCat and AdMob are not integrated yet.
- Preserve the existing Base44 subscription, plan, energy, narration, ad, and backend flows until their native replacements are verified.