import React from 'react';
import { ScrollText } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import SectionHeader from '../components/SectionHeader';

const SECTIONS = [
  {
    h: 'Acceptance of Terms',
    p: 'By creating an account or using SGT by AGES (the "App", by AGES — Accessible Ghost Exploration Solutions), you agree to these Terms of Service. If you do not agree, do not use the App.',
  },
  {
    h: 'User-Generated Content & Conduct',
    p: 'You agree not to post content that is unlawful, threatening, harassing, hateful, defamatory, sexually explicit, or that infringes others\' rights. You grant AGES a license to display content you submit within the App. AGES reserves the right to remove any content that violates these Terms and to terminate accounts of repeat violators.',
  },
  {
    h: 'Reporting & Blocking',
    p: 'You can report objectionable content and block other users from within the App. Reported content is reviewed by our team. Blocking a user hides their content from you.',
  },
  {
    h: 'Safety & Lawful Use',
    p: 'The App guides you to real-world locations. You are solely responsible for your safety and for obeying all laws, including trespassing and property-access laws. Always obtain permission before entering private property and investigate only where it is lawful to do so.',
  },
  {
    h: 'No Warranties',
    p: 'The App is provided "as is" without warranties of any kind. Paranormal investigation tools and AI-generated tour content are for entertainment and exploration purposes; AGES makes no claim about the accuracy or scientific validity of results.',
  },
  {
    h: 'Purchases',
    p: 'AGES does not process product sales within the App. The Store button links to our external online shop (hosted on eBay), where all product purchases are completed outside the App. Payments, shipping, returns, and disputes for merchandise are handled by that external marketplace under its own terms; AGES is not a party to those transactions. Digital subscriptions or in-app purchases, if offered, are billed through the platform (Apple App Store / Google Play) and governed by their terms.',
  },
  {
    h: 'Account Termination',
    p: 'You may delete your account at any time from Settings. AGES may suspend or terminate accounts that violate these Terms.',
  },
  {
    h: 'Limitation of Liability',
    p: 'To the maximum extent permitted by law, AGES is not liable for any damages arising from your use of the App, including any loss, injury, or property damage occurring while investigating locations.',
  },
  {
    h: 'Changes to Terms',
    p: 'We may update these Terms from time to time. Continued use after changes constitutes acceptance.',
  },
  {
    h: 'Contact',
    p: 'For questions about these Terms, contact the AGES team through the App\'s support channels.',
  },
];

export default function TermsOfService() {
  return (
    <PageContainer>
      <SectionHeader title="Terms of Service" subtitle="SGT by AGES" showBack />
      <div className="px-4 pb-28 pt-3 space-y-5">
        <div className="flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-card/40">
          <ScrollText className="w-6 h-6 text-primary shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Last updated: July 2026. These terms govern your use of SGT by AGES.
          </p>
        </div>
        {SECTIONS.map((s) => (
          <section key={s.h} className="space-y-2">
            <h2 className="font-heading text-sm uppercase tracking-wider text-primary">{s.h}</h2>
            <p className="text-log text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{s.p}</p>
          </section>
        ))}
      </div>
    </PageContainer>
  );
}