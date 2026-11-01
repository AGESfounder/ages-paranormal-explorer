import React from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Smartphone } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";

// Shown after a successful password reset, in place of the Base44 web sign-in
// page. The primary action hands the browser off to the installed native app's
// sign-in screen through the `agesexplorer` scheme declared in
// ios/App/App/Info.plist and android/app/src/main/AndroidManifest.xml.
// Only the email address travels in that link — never the password or the
// reset token.
export default function PasswordResetSuccess({ email }) {
  const appLink = email
    ? `agesexplorer://login?email=${encodeURIComponent(email)}`
    : "agesexplorer://login";

  return (
    <AuthLayout icon={CheckCircle2} title="Password updated">
      <div className="space-y-5">
        <p className="text-sm text-foreground text-center text-pretty">
          Your password has been successfully updated.
        </p>
        <Button asChild className="w-full h-12 font-medium">
          <a href={appLink}>
            <Smartphone aria-hidden="true" />
            Open AGES Explorer
          </a>
        </Button>
        <p className="text-center text-sm">
          <Link
            to="/login"
            className="text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            Continue on the web
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}