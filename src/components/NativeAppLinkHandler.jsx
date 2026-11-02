import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { base44 } from "@/api/base44Client";

// Custom scheme used by the password-reset hand-off screen:
// agesexplorer://login?email=…
// Declared in ios/App/App/Info.plist and android/app/src/main/AndroidManifest.xml.
const APP_SCHEME = "agesexplorer:";

// Native launch state is session-scoped, not component-scoped: getLaunchUrl()
// does not consume its value, so a remount must not replay a handled launch.
const nativeReadyPromiseRef = { current: null };
const launchUrlPromiseRef = { current: null };
const launchUrlHandledRef = { current: false };
const liveUrlHandlingRef = { current: new Map() };

const parseSignInLink = (url) => {
  if (typeof url !== "string" || !url.startsWith(APP_SCHEME)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "login") return null;
    // AuthContext owns token callbacks, including tokens carried in a fragment.
    if (parsed.searchParams.has("access_token") ||
        new URLSearchParams(parsed.hash.replace(/^#/, "")).has("access_token")) return null;
    return { email: parsed.searchParams.get("email") || "" };
  } catch {
    return null;
  }
};

// Receives agesexplorer:// links inside the native shell on iOS and Android and
// opens the sign-in screen, carrying only the email through for prefill.
// Other deep links (e.g. OAuth callbacks carrying an access token) are ignored
// here and keep being handled by AuthContext.
export default function NativeAppLinkHandler() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    let cancelled = false;
    let listenerHandle;

    const handleUrl = async (url, isLaunch = false) => {
      if (cancelled || !url || (isLaunch && launchUrlHandledRef.current)) return false;
      const link = parseSignInLink(url);
      if (!link) return false;

      let signedIn = false;
      try {
        signedIn = await base44.auth.isAuthenticated();
      } catch {
        signedIn = false;
      }
      // Native startup can report the same URL through both APIs. Only the
      // launch fallback waits for a matching live delivery; live events never
      // filter each other. A cancelled live delivery leaves the fallback free
      // to finish in the next active effect.
      const liveHandling = isLaunch && liveUrlHandlingRef.current.get(url);
      const handledByLiveEvent = liveHandling ? await liveHandling : false;
      if (cancelled || (isLaunch && launchUrlHandledRef.current)) return false;
      // Consume the launch only once an active effect can finish handling it.
      if (isLaunch) {
        launchUrlHandledRef.current = true;
        liveUrlHandlingRef.current.clear();
        if (handledByLiveEvent) return true;
      }

      if (signedIn) {
        navigateRef.current("/", { replace: true });
        return true;
      }
      navigateRef.current(
        link.email ? `/login?email=${encodeURIComponent(link.email)}` : "/login",
        { replace: true }
      );
      return true;
    };

    // Snapshot mutable native launch state now, before any asynchronous setup.
    // Keep even an in-flight lookup available to the next active effect.
    if (!launchUrlPromiseRef.current) {
      launchUrlPromiseRef.current = CapacitorApp.getLaunchUrl().catch(() => {
        // A failed lookup is not a consumed launch; allow a later mount to retry.
        launchUrlPromiseRef.current = null;
        return null;
      });
    }

    // Complete a native round trip before registering: Android can otherwise
    // replay the first event via its legacy return path before its reply proxy
    // is assigned, allowing a launch response on the other path to overtake it.
    if (!nativeReadyPromiseRef.current) {
      nativeReadyPromiseRef.current = CapacitorApp.getState().catch(() => {});
    }

    const startListening = async () => {
      await nativeReadyPromiseRef.current;
      if (cancelled) return;

      const registration = CapacitorApp.addListener("appUrlOpen", (event) => {
        if (cancelled) return;
        const handling = handleUrl(event?.url);
        if (!launchUrlHandledRef.current) {
          liveUrlHandlingRef.current.set(event?.url, handling);
        }
      });
      registration.then((handle) => {
        if (cancelled) {
          handle.remove();
          return;
        }
        listenerHandle = handle;
      }).catch(() => {});

      // addListener resolves with a callback ID, not a native acknowledgement.
      // Fence retained-event delivery before consuming even a cached launch,
      // without waiting for its handle promise (which can stay pending on error).
      await CapacitorApp.getState().catch(() => {});
    };

    // Listener/fence failure must not discard a successful launch lookup.
    // Wait for setup to settle only to give retained events priority in the map.
    Promise.all([
      launchUrlPromiseRef.current,
      startListening().catch(() => {}),
    ])
      .then(([launchUrl]) => {
        if (cancelled || launchUrl === null) return;
        if (parseSignInLink(launchUrl?.url)) return handleUrl(launchUrl.url, true);
        launchUrlHandledRef.current = true;
        liveUrlHandlingRef.current.clear();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      listenerHandle?.remove();
    };
  }, []);

  return null;
}