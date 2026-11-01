import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { base44 } from "@/api/base44Client";

// Custom scheme used by the password-reset hand-off screen:
// agesexplorer://login?email=…
// Declared in ios/App/App/Info.plist and android/app/src/main/AndroidManifest.xml.
const APP_SCHEME = "agesexplorer:";

const parseSignInLink = (url) => {
  if (typeof url !== "string" || !url.startsWith(APP_SCHEME)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "login") return null;
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

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    let cancelled = false;
    let listenerHandle;
    let lastHandledUrl = null;

    const handleUrl = async (url) => {
      if (cancelled || !url || url === lastHandledUrl) return;
      const link = parseSignInLink(url);
      if (!link) return;
      lastHandledUrl = url;

      let signedIn = false;
      try {
        signedIn = await base44.auth.isAuthenticated();
      } catch {
        signedIn = false;
      }
      if (cancelled) return;

      if (signedIn) {
        navigate("/", { replace: true });
        return;
      }
      navigate(
        link.email ? `/login?email=${encodeURIComponent(link.email)}` : "/login",
        { replace: true }
      );
    };

    CapacitorApp.addListener("appUrlOpen", (event) => {
      handleUrl(event?.url);
    })
      .then((handle) => {
        if (cancelled) handle.remove();
        else listenerHandle = handle;
      })
      .catch(() => {});

    CapacitorApp.getLaunchUrl()
      .then((launchUrl) => {
        if (launchUrl?.url) handleUrl(launchUrl.url);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      listenerHandle?.remove();
    };
  }, [navigate]);

  return null;
}