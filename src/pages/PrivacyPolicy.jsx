import React from 'react';
import { Shield, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageContainer from '../components/PageContainer';
import SectionHeader from '../components/SectionHeader';

// Same contact address used on the Support page.
const PRIVACY_EMAIL = 'engageAGES@gmail.com';

const SECTIONS = [
  {
    h: 'Who We Are',
    p: 'AGES Paranormal Explorer (the "App") is operated by AGES — Accessible Ghost Exploration Solutions. This single Privacy Policy covers the App on iOS, Android, and the web; there are no separate platform policies. It explains what we collect, how we use it, and the choices you have.',
  },
  {
    h: 'Information We Collect',
    p: 'The App collects the following data to provide its features:\n\n• Account data: email address, display name, and authentication credentials or tokens when you create an account or sign in, including Sign in with Google or Sign in with Apple. Authentication and account storage are provided by the Base44 platform.\n• Profile and settings: your display name, in-app preferences, and your blocked-users list, stored with your account.\n• Location data: approximate or precise GPS coordinates, only when you grant permission, used to find nearby tours, generate tours for an area, and pin evidence on the Community Map.\n• Content you create: photos, videos, audio recordings, notes, comments ("Explorer Reports"), investigations, favorites, and saved tours you choose to upload or post.\n• Device sensor data: microphone, camera, accelerometer, gyroscope, and magnetometer readings, only while an investigation tool is active and with your permission. Sensor readings are processed on your device; a recording leaves your device only when you choose to save it as evidence.\n• Purchase and subscription data: your plan, subscription status, expiration dates, in-app energy balances, and transaction records for purchases you make (see Purchases & Payments).\n• Advertising data: ad interactions and, where you allow it, your device advertising identifier, processed by Google AdMob (see Advertising).\n• Analytics and session data: page-view events recorded by the Base44 platform in the production app (see Analytics & Session Data).',
  },
  {
    h: 'How We Use Your Information',
    p: 'We use your data to:\n\n• Create and manage your account and sign you in.\n• Generate and display haunted tours near you, including AI-generated narration.\n• Store and display the evidence, comments, and reports you log.\n• Enable community features such as the public Community Map, comments, and the leaderboard.\n• Process purchases, grant subscription access and in-app energy, and fulfill merchandise orders (including shipping).\n• Moderate content and enforce our Terms of Service (reports and blocking).\n• Understand how the App is used and improve it.',
  },
  {
    h: 'AI-Generated Content',
    p: 'Tour generation and narration use artificial-intelligence services provided through the Base44 platform (large language models and text-to-speech). Prompts sent to these services can include location names or addresses you enter and your content preferences. Generated tour text and narration audio are stored with your account. Please do not enter sensitive personal information into free-text fields.',
  },
  {
    h: 'User-Generated Content',
    p: 'You may post comments ("Explorer Reports"), evidence entries, and public map pins. You retain ownership of your content but grant us a license to display it within the App. You are responsible for ensuring your content does not violate our Terms of Service or applicable law. We may remove content that is reported and found to violate our policies.',
  },
  {
    h: 'Advertising (Google AdMob)',
    p: 'On the iOS and Android apps, AGES Paranormal Explorer shows ads through Google AdMob and the Google Mobile Ads SDK.\n\n• Free (Observer) users may see full-screen interstitial ads when opening paranormal stop content after the first stop. Paid plans do not see interstitial ads.\n• Users may optionally watch a rewarded video ad to earn in-app energy. When a rewarded ad is completed, Google sends a signed server-side verification (SSV) callback to our backend so we can audit the reward event. That callback can include your user identifier, the ad unit, the ad network, the reward amount, and a signed timestamp, which we store in an audit record.\n• AdMob and its partners may process your advertising identifier and device/app signals under Google\'s own policies. Where required (for example in the EEA, UK, and Switzerland), we request consent through Google\'s User Messaging Platform (UMP) before loading ads, and ads are not loaded without the required consent.\n• On iOS, the system may ask for App Tracking Transparency (ATT) permission before personalized advertising. If you decline tracking, or tracking is otherwise unavailable, the App requests non-personalized ads instead. Declining tracking does not remove ads; it limits personalization.\n• Ads are configured for a general audience and the App is not directed at children.\n• You can change tracking and related permissions in your device settings at any time.\n• Web preview builds simulate ad flows and do not load the AdMob SDK.',
  },
  {
    h: 'Analytics & Session Data',
    p: 'The production app includes the Base44 platform\'s built-in analytics tracker, which records page-view events (which screens are opened) to help operate and improve the App. When you are signed in, these events are associated with your authenticated app session. We do not use a separate third-party analytics or advertising-analytics service, and we do not build advertising profiles from this data.',
  },
  {
    h: 'Purchases & Payments',
    p: 'The App sells subscriptions (Explorer, Investigator), one-time access (Trailblazer), in-app energy bundles (Aura Bundles), and physical merchandise. Payment card numbers are never seen or stored by us — payments are processed by the store or provider you use.\n\n• Web checkout (Wix): purchases made on the web app — and, in the Android app, subscriptions and Aura Bundles — are processed by Wix. We store a purchase record containing your account email, your user ID, the product, the amount, and the Wix checkout-session and subscription-contract IDs, and we update your plan, subscription status, and expiration date when Wix confirms payment, cancellation, or expiry.\n• iOS (Apple App Store, via RevenueCat): Explorer and Investigator subscriptions, Aura Bundle consumables, and the one-time Trailblazer product are purchased through StoreKit using RevenueCat. Apple processes the payment. RevenueCat sends purchase, renewal, and refund events to our backend, where we store transaction and subscription records (product ID, store transaction IDs, price, currency, purchase and expiration dates, and whether the purchase was sandbox or production) and update your subscription status and plan.\n• Android (Google Play, via RevenueCat): the one-time Trailblazer product is purchased through Google Play Billing using RevenueCat. Google processes the payment. We store transaction records and your Google Play access expiration date, and refund events revoke that access.\n• Merchandise orders: for physical items we collect the shipping name, address, and email needed to fulfill and deliver your order.\n\nSubscription status and purchase history remain associated with your account until you delete it, subject to the retention limits below.',
  },
  {
    h: 'Third-Party Providers & Data Sharing',
    p: 'We do not sell your personal data. We share data only with the service providers that operate the App, each under its own privacy policy and only as needed to provide its service:\n\n• Base44 — hosting, authentication, database, file storage, AI (language model and text-to-speech) processing, and server functions.\n• Google AdMob / Google Mobile Ads SDK and User Messaging Platform — advertising and ad-consent management on iOS and Android.\n• RevenueCat — in-app purchase and subscription infrastructure on iOS and Android.\n• Apple App Store / StoreKit — payment processing for iOS purchases.\n• Google Play Billing — payment processing for Android purchases.\n• Wix — web checkout and payment processing.\n• Esri (ArcGIS Online) — map basemap tiles.\n• OpenStreetMap Nominatim — reverse geocoding; map coordinates are sent to this service to name locations (for example parking spots).\n\nPublic content you choose to share (public evidence pins and comments) is visible to other users; private evidence entries are visible only to you. We may also disclose information when required by law or to protect rights and safety.',
  },
  {
    h: 'Data Storage & Security',
    p: 'Your data is stored on the Base44 platform with per-record access controls, and all traffic between the App and our backend uses HTTPS. Your sign-in token is stored on your device. Tours, audio, and map data you download for offline use stay on your device until you remove them. No method of transmission or storage is completely secure, but we use reasonable administrative and technical measures to protect your information.',
  },
  {
    h: 'Data Retention',
    p: 'We keep your account data for as long as your account is active. Purchase, subscription, and transaction records, and rewarded-ad audit records, are retained for as long as required for accounting, tax, fraud-prevention, and legal obligations, even after account deletion. Providers\' backups are purged on their own schedules.',
  },
  {
    h: 'Account Deletion',
    p: 'You can permanently delete your account at any time:\n\n1. Open the App and sign in.\n2. Go to Settings.\n3. Scroll to the Danger Zone at the bottom.\n4. Tap "Delete Account" and confirm.\n\nDeletion removes your user profile and account record together with the data you authored: evidence entries, comments, reports, favorites, investigations, and merchandise orders. Deletion is irreversible.\n\nWhat we retain: purchase, subscription, and transaction records (including Wix and RevenueCat records) and rewarded-ad audit records that we are required to keep for financial, tax, fraud-prevention, or legal reasons; these records are not used for any other purpose. Aggregated or de-identified data may also be retained.\n\nDeleting your account does not cancel an active subscription. To avoid further charges, cancel first through the store where you purchased: App Store subscriptions in your Apple ID settings, Google Play purchases in your Google account, or web subscriptions through the checkout provider.\n\nIf you cannot access the App, email us at the address in the Contact section with the subject line "Delete My Account" from the email address on your account, and we will process the deletion for you.',
  },
  {
    h: 'Your Privacy Choices',
    p: 'You can control location access, microphone, camera, and (on iOS) tracking permissions from your device settings at any time. Where an ad-consent form was shown, your choices are remembered by the platform consent tools until you reset app data or change device settings. You can mark evidence entries as private so they do not appear on the public Community Map, block other users, and delete your account as described above.',
  },
  {
    h: 'Children\'s Privacy',
    p: 'The App is not directed to children under 13, ads are configured for a general audience, and we do not knowingly collect personal data from children. If you believe a child has provided personal data, contact us so we can delete it.',
  },
  {
    h: 'International Users',
    p: 'The App\'s service providers process data in the United States and other countries where they operate. By using the App, you understand that your information may be transferred to and processed in these locations.',
  },
  {
    h: 'Changes to This Policy',
    p: 'We may update this Privacy Policy from time to time. Material changes will be reflected in the App and at this URL, with the "Last updated" date above. Continued use after changes constitutes acceptance.',
  },
];

export default function PrivacyPolicy() {
  return (
    <PageContainer>
      <SectionHeader title="Privacy Policy" subtitle="AGES Paranormal Explorer" showBack />
      <div className="px-4 pb-28 pt-3 space-y-5">
        <div className="flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-card/40">
          <Shield className="w-6 h-6 text-primary shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Last updated: September 20, 2026. This policy explains what AGES Paranormal Explorer — by AGES, Accessible Ghost Exploration Solutions — collects and how it is used. It applies to the iOS app, the Android app, and the web app.
          </p>
        </div>
        {SECTIONS.map((s) => (
          <section key={s.h} className="space-y-2">
            <h2 className="font-heading text-sm uppercase tracking-wider text-primary">{s.h}</h2>
            <p className="text-log text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{s.p}</p>
          </section>
        ))}
        <section className="space-y-2">
          <h2 className="font-heading text-sm uppercase tracking-wider text-primary">Contact</h2>
          <p className="text-log text-sm text-foreground/80 leading-relaxed">
            For privacy questions or requests — including account deletion requests — contact AGES (Accessible Ghost Exploration Solutions) at:
          </p>
          <a
            href={`mailto:${PRIVACY_EMAIL}?subject=Privacy%20Request`}
            className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-card/30 hover:border-primary/40 hover:bg-primary/5 transition-all"
          >
            <Mail className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm text-foreground">{PRIVACY_EMAIL}</span>
          </a>
          <p className="text-log text-sm text-foreground/80 leading-relaxed">
            You can also reach us through the App&apos;s{' '}
            <Link to="/support" className="text-primary font-medium hover:underline">Support page</Link>.
          </p>
        </section>
      </div>
    </PageContainer>
  );
}