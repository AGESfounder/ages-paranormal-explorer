import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Car, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PARKING_TYPES, PARKING_COST_KINDS, parseParkingCost } from '@/lib/parkingChange';

const FIELD_LABEL = 'text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5';

// Raised whenever a tour's parking location is moved. The tour shows the lot's
// name, type and cost, and re-orders its stops from where the lot is — so the
// move isn't complete until the mover confirms the lot's details: the new
// location, the details and the re-ordered route all land as one change.
export default function ParkingChangeDialog({ open, parking, onConfirm, onCancel, saving }) {
  const [name, setName] = useState('');
  const [parkingType, setParkingType] = useState('street');
  const [costKind, setCostKind] = useState('free');
  const [costDetails, setCostDetails] = useState('');

  // Prefill from the lot the tour currently carries, so marking the same lot
  // again is just a confirm, while a genuinely new lot gets its own details.
  useEffect(() => {
    if (!open) return;
    const cost = parseParkingCost(parking?.parking_cost);
    setName(parking?.name || '');
    setParkingType(parking?.parking_type || 'street');
    setCostKind(cost.kind);
    setCostDetails(cost.details);
  }, [open, parking?.id]);

  const canConfirm = name.trim().length > 0
    && (costKind !== 'other' || costDetails.trim().length > 0)
    && !saving;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={saving ? undefined : onCancel} />
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full sm:w-[420px] max-h-[90vh] overflow-y-auto bg-card border border-amber-500/30 rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 mx-0 sm:mx-4 pb-modal-safe sm:pb-6"
          >
            <button
              onClick={onCancel}
              disabled={saving}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-lg bg-amber-500/10">
                <Car className="w-5 h-5 text-amber-400" />
              </div>
              <h2 className="font-heading text-base font-semibold text-foreground">New Parking Location</h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              Your parking spot has moved. Confirm the lot you parked in and this tour's stops will be
              re-ordered from here.
            </p>

            <div className="space-y-4">
              <div>
                <p className={FIELD_LABEL}>Parking Name</p>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Riverside Free Lot"
                  className="w-full"
                />
              </div>
              <div>
                <p className={FIELD_LABEL}>Parking Type</p>
                <Select value={parkingType} onValueChange={setParkingType}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select parking type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PARKING_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className={FIELD_LABEL}>Parking Cost</p>
                <Select value={costKind} onValueChange={setCostKind}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select parking cost" />
                  </SelectTrigger>
                  <SelectContent>
                    {PARKING_COST_KINDS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {costKind !== 'free' && (
                <div>
                  <p className={FIELD_LABEL}>Cost Details</p>
                  <Input
                    value={costDetails}
                    onChange={(e) => setCostDetails(e.target.value)}
                    placeholder={costKind === 'metered' ? 'e.g., $1.50/hr, free after 6pm' : 'e.g., $5 flat rate'}
                    className="w-full"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={onCancel}
                disabled={saving}
                className="flex-1 py-3 rounded-lg border border-border/40 bg-secondary/30 font-heading text-xs uppercase tracking-wider text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirm({ name, parking_type: parkingType, costKind, costDetails })}
                disabled={!canConfirm}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-heading text-xs uppercase tracking-wider hover:bg-amber-500/30 transition-colors disabled:opacity-40"
              >
                {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : 'Save & Re-Order'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}