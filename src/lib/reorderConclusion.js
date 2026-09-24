import { base44 } from '@/api/base44Client';
import { stripStopConclusion } from '@/lib/stopContent';

// Rebalance conclusion phrases after stop reordering. Under the new rule,
// NO stop may contain conclusion language — the tour's Conclusion field is
// the only place for closing statements. So when the final stop changes,
// we only need to strip any conclusion phrases from the OLD final stop
// (which may have been generated before this rule existed). The new final
// stop does NOT get conclusion language added.
//
// Returns { oldFinal } update object, or null if nothing changed.
export async function rebalanceConclusionPhrases(oldStops, newStops) {
  const oldTourStops = (oldStops || []).filter(s => s.stop_type !== 'parking');
  const newTourStops = (newStops || []).filter(s => s.stop_type !== 'parking');
  if (oldTourStops.length === 0 || newTourStops.length === 0) return null;

  const oldFinal = oldTourStops[oldTourStops.length - 1];
  const newFinal = newTourStops[newTourStops.length - 1];

  // Same stop is still last — no rebalance needed
  if (oldFinal.id === newFinal.id) return null;

  const updates = {};

  // Strip conclusion phrases from the old final stop — no stop keeps
  // conclusion language under the new rule.
  const oldFinalClean = stripStopConclusion(oldFinal, false);
  if (Object.keys(oldFinalClean).length > 0) {
    try {
      await base44.entities.TourStop.update(oldFinal.id, oldFinalClean);
      updates.oldFinal = { id: oldFinal.id, ...oldFinalClean };
    } catch (e) {
      console.error('Failed to strip conclusion from old final stop:', e);
    }
  }

  return Object.keys(updates).length > 0 ? updates : null;
}