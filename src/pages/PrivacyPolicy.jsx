import React from 'react';
import { Shield } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import SectionHeader from '../components/SectionHeader';

const SECTIONS = [
  {
    h: 'Information We Collect',
    p: 'SGT by AGES (the "App", by AGES — Accessible Ghost Exploration Solutions) collects the following data to provide its features:\n\n• Account data: email address, display name, and authentication token when you create an account.\n• Location data: approximate or precise GPS coordinates, only when you grant permission, used to find nearby tours and pin evidence on the community map.\n• Media and content: photos, videos, audio recordings, notes, and comments you choose to upload or post.\n• Device sensor data: microphone, camera, accelerometer, gyroscope, and magnetometer readings, only while an investigation tool is active and with your permission.\n• Usage data: anonymized analytics about app interactions to improve features.',
  },
  {
    h: 'How We Use Your Information',
    p: 'We use your data to:\n\n• Create and manage your account.\n• Generate and display haunted tours near you.\n• Store and display the evidence and reports you log.\n• Enable community features such as the public Community Map, comments, and the leaderboard.\n• Process orders for physical merchandise in the store.\n• Improve the App through aggregated, anonymized analytics.',
  },
  {
    h: 'User-Generated Content',
    p: 'You may post comments ("Explorer Reports"), evidence entries, and public map pins. You retain ownership of your content but grant us a license to display it within the App. You are responsible for ensuring your content does not violate our Terms of Service or applicable law. We may remove content that is reported and found to violate our policies.',
  },
  {
    h: 'Sharing of Information',
    p: 'Public content you choose to share (public evidence pins, comments) is visible to other users. Your private evidence entries are visible only to you. We do not sell your personal data. We share data only with service providers that help operate the App (hosting, payments, maps, analytics) under appropriate confidentiality obligations, or when required by law.',
  },
  {
    h: 'Third-Party Services',
    p: 'The App uses third-party services for mapping (CARTO/Leaflet), payments (Base44 Payments), and authentication. These providers may process data under their own privacy policies. We do not share more information than necessary to enable these features.',
  },
  {
    h: 'Data Retention & Account Deletion',
    p: 'We retain your data for as long as your account is active. You can permanently delete your account and associated data at any time from Settings → Danger Zone → Delete Account. Account deletion is irreversible.',
  },
  {
    h: 'Your Privacy Choices',
    p: 'You can control location access, microphone, and camera permissions from your device settings at any time. You can mark evidence entries as private so they do not appear on the public Community Map.',
  },
  {
    h: 'Children\'s Privacy',
    p: 'The App is not directed to children under 13 and we do not knowingly collect personal data from them. If you believe a child has provided personal data, contact us so we can delete it.',
  },
  {
    h: 'Changes to This Policy',
    p: 'We may update this Privacy Policy from time to time. Material changes will be reflected in the App. Continued use after changes constitutes acceptance.',
  },
  {
    h: 'Contact',
    p: 'For privacy questions or requests, contact the AGES team through the App\'s support channels.',
  },
];

export default function PrivacyPolicy() {
  return (
    <PageContainer>
      <SectionHeader title="Privacy Policy" subtitle="SGT by AGES" showBack />
      <div className="px-4 pb-28 pt-3 space-y-5">
        <div className="flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-card/40">
          <Shield className="w-6 h-6 text-primary shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Last updated: July 2026. This policy explains what SGT by AGES collects and how it is used.
          </p>
        </div>
        {SECTIONS.map((s) => (
          <section key={s.h} className="space-y-2">
            <h2 className="font-heading text-sm uppercase tracking-wider text-primary">{s.h}</h2>
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{s.p}</p>
          </section>
        ))}
      </div>
    </PageContainer>
  );
}