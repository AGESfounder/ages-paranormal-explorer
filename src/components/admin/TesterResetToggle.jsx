import React, { useState, useEffect } from 'react';
import { Loader2, FlaskConical } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';

// Admin-only toggle for the scheduled tester-access reset. Reads/writes the
// single TesterResetSetting row. The reset-tester-access backend function
// (called every 2 hours by the workflow) gates itself on this toggle.
export default function TesterResetToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const rows = await base44.entities.TesterResetSetting.filter({});
      const list = Array.isArray(rows) ? rows : (rows?.items || []);
      setEnabled(list.some((r) => r && r.enabled === true));
    } catch (e) {
      // Entity not deployed yet — treat as off.
      setEnabled(false);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (nextVal) => {
    setSaving(true);
    try {
      const rows = await base44.entities.TesterResetSetting.filter({});
      const list = Array.isArray(rows) ? rows : (rows?.items || []);
      const existing = list[0];
      if (existing) {
        await base44.entities.TesterResetSetting.update(existing.id, { enabled: nextVal });
      } else {
        await base44.entities.TesterResetSetting.create({ enabled: nextVal });
      }
      setEnabled(nextVal);
      toast({
        title: nextVal ? 'Tester reset enabled' : 'Tester reset disabled',
        description: nextVal
          ? 'Sandbox test accounts reset to Observer every 2 hours on even hours.'
          : 'Scheduled reset is off. Test accounts keep their current access.',
      });
    } catch (e) {
      toast({
        title: 'Could not update setting',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading tester reset...
      </div>
    );
  }

  return (
    <div className="mb-4 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="p-1.5 rounded-md bg-amber-500/15 border border-amber-500/30 shrink-0">
            <FlaskConical className="w-4 h-4 text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-heading uppercase tracking-wider text-foreground">
              Tester Access Reset
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
              When ON, sandbox (Apple/Google test) purchases are cleared and sandbox-only test
              accounts reset to Observer every 2 hours on even hours, so purchases can be re-tested.
              Real (production) purchases are never touched.
            </p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={toggle} disabled={saving} />
      </div>
    </div>
  );
}