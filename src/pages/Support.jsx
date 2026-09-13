import React from 'react';
import { LifeBuoy, Mail, Bug, UserX, Trash2, Shield, ScrollText, Ghost } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageContainer from '../components/PageContainer';
import SectionHeader from '../components/SectionHeader';

// TODO: Replace with your real support email address.
const SUPPORT_EMAIL = 'engageAGES@gmail.com';

const SECTIONS = [
  {
    icon: Ghost,
    h: 'About AGES Paranormal Explorer',
    p: 'AGES Paranormal Explorer (Accessible Ghost Exploration Solutions) is a self-guided paranormal exploration app for ghost hunters and enthusiasts. It features AI-narrated haunted tours across all 50 U.S. states and international locations, a community evidence map, an investigation journal, and a toolkit of paranormal investigation utilities — all designed to help you explore the unexplained safely and at your own pace.',
  },
  {
    icon: Mail,
    h: 'Support Email',
    p: `For any questions, feedback, or account help, contact us at:\n\n${SUPPORT_EMAIL}\n\nWe aim to respond within 2 business days.`,
  },
  {
    icon: Bug,
    h: 'Reporting Bugs',
    p: 'To report a bug or technical issue, email us with the following details so we can reproduce and fix it quickly:\n\n• A short description of what happened\n• What you were doing when it occurred\n• The type of device and operating system you are using\n• A screenshot or screen recording, if possible\n\nSend it to the support email above with the subject line "Bug Report".',
  },
  {
    icon: UserX,
    h: 'Account Help',
    p: 'If you are having trouble logging in, can\'t access a subscription you purchased, or need help with your account, email us at the support address above with the subject line "Account Help". Please include the email address associated with your account so we can locate it.',
  },
  {
    icon: Trash2,
    h: 'Deleting Your Account',
    p: 'You can permanently delete your account and all associated data at any time, right from within the app:\n\n1. Open the app and sign in.\n2. Go to Settings.\n3. Scroll to the Danger Zone at the bottom.\n4. Tap "Delete Account" and confirm.\n\nAccount deletion is irreversible and removes your profile, evidence entries, favorites, investigations, and comments. If you are unable to access the app, email us at the support address above with the subject line "Delete My Account" and we will process it for you.',
  },
];

export default function Support() {
  return (
    <PageContainer>
      <SectionHeader title="Support" subtitle="AGES Paranormal Explorer" showBack />
      <div className="px-4 pb-28 pt-3 space-y-5">
        <div className="flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-card/40">
          <LifeBuoy className="w-6 h-6 text-primary shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            We're here to help. Find answers, report issues, and manage your account below.
          </p>
        </div>

        {SECTIONS.map((s) => (
          <section key={s.h} className="space-y-2">
            <div className="flex items-center gap-2">
              <s.icon className="w-4 h-4 text-primary shrink-0" />
              <h2 className="font-heading text-sm uppercase tracking-wider text-primary">{s.h}</h2>
            </div>
            <p className="text-log text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{s.p}</p>
          </section>
        ))}

        <section className="space-y-2">
          <h2 className="font-heading text-sm uppercase tracking-wider text-primary">Legal & Policies</h2>
          <div className="flex flex-col gap-2">
            <Link
              to="/privacy"
              className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-card/30 hover:border-primary/40 hover:bg-primary/5 transition-all"
            >
              <Shield className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm text-foreground">Privacy Policy</span>
            </Link>
            <Link
              to="/terms"
              className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-card/30 hover:border-primary/40 hover:bg-primary/5 transition-all"
            >
              <ScrollText className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm text-foreground">Terms of Service</span>
            </Link>
          </div>
        </section>
      </div>
    </PageContainer>
  );
}