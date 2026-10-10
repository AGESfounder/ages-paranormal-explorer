import React, { useEffect, useState } from 'react';
import { Printer, Download, ArrowLeft } from 'lucide-react';
import { Navigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { buildDisplayData } from '@/lib/planAnalysisData';
import { downloadPlanAnalysisA } from '@/lib/downloadPlanAnalysisA';
import { downloadHybridPDF } from '@/lib/hybridModel';
import PlanAnalysisView from '@/components/PlanAnalysisView';

// Build both data sets once at module level — the toggle just swaps which one
// the view receives. buildModel(OPTION_A) reproduces A's original numbers.
const dataA = buildDisplayData('A');
const dataB = buildDisplayData('B');

export default function PlanAnalysis() {
  const [authState, setAuthState] = useState({ loading: true, isAdmin: false });
  const [activeOption, setActiveOption] = useState('A');

  useEffect(() => {
    base44.auth.me()
      .then((u) => setAuthState({ loading: false, isAdmin: u?.role === 'admin' }))
      .catch(() => setAuthState({ loading: false, isAdmin: false }));
  }, []);

  if (authState.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }
  if (!authState.isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const data = activeOption === 'A' ? dataA : dataB;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const handleDownload = () => {
    if (activeOption === 'A') downloadPlanAnalysisA();
    else downloadHybridPDF();
  };

  const toggleBtn = (option, label, colorClass) => (
    <button
      onClick={() => setActiveOption(option)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-heading text-sm uppercase tracking-wider transition-colors min-h-[44px] ${
        activeOption === option
          ? `${colorClass} text-white`
          : 'border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-card/60'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-10 print:p-0">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 no-print">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">AGES Subscription Plan &amp; Profit Analysis</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cost Analysis {activeOption}{activeOption === 'B' ? ' (Option E — Hybrid)' : ''} · Generated {today}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Link
              to="/dashboard"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-heading text-sm uppercase tracking-wider hover:bg-card/60 transition-colors min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
            <div className="flex gap-2">
              {toggleBtn('A', 'Analysis A', 'bg-primary')}
              {toggleBtn('B', 'Analysis B', 'bg-accent')}
            </div>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-heading text-sm uppercase tracking-wider hover:bg-card/60 transition-colors min-h-[44px]"
            >
              <Download className="w-4 h-4" /> Download PDF
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-heading text-sm uppercase tracking-wider hover:bg-card/60 transition-colors min-h-[44px]"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        </div>

        <PlanAnalysisView data={data} />
      </div>
    </div>
  );
}