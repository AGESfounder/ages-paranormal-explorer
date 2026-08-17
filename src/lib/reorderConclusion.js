import { base44 } from '@/api/base44Client';
import { stripStopConclusion } from '@/lib/stopContent';

// Rebalance conclusion phrases after stop reordering (or any action that
// changes which stop is last). Two things happen when the final stop changes:
//
// 1. The OLD final stop (now non-final) may still contain conclusion phrases
//    like "as we conclude our tour" — strip them from all three text fields.
//
// 2. The NEW final stop (previously non-final) had its conclusion phrases
//    stripped at generation time. Regenerate its narration_text via LLM to
//    add a natural conclusion ending, so the tour still wraps up properly.
//
// Returns { oldFinal, newFinal } update objects, or null if nothing changed.
export async function rebalanceConclusionPhrases(oldStops, newStops) {
  const oldTourStops = (oldStops || []).filter(s => s.stop_type !== 'parking');
  const newTourStops = (newStops || []).filter(s => s.stop_type !== 'parking');
  if (oldTourStops.length === 0 || newTourStops.length === 0) return null;

  const oldFinal = oldTourStops[oldTourStops.length - 1];
  const newFinal = newTourStops[newTourStops.length - 1];

  // Same stop is still last — no rebalance needed
  if (oldFinal.id === newFinal.id) return null;

  const updates = {};

  // 1. Strip conclusion phrases from the old final stop (now non-final)
  const oldFinalClean = stripStopConclusion(oldFinal, false);
  if (Object.keys(oldFinalClean).length > 0) {
    try {
      await base44.entities.TourStop.update(oldFinal.id, oldFinalClean);
      updates.oldFinal = { id: oldFinal.id, ...oldFinalClean };
    } catch (e) {
      console.error('Failed to strip conclusion from old final stop:', e);
    }
  }

  // 2. Regenerate the new final stop's narration to include a conclusion ending
  try {
    const existingNarration = newFinal.narration_text || newFinal.paranormal_info || '';
    const prompt = `You are editing the narration of the FINAL stop on a paranormal ghost hunting tour. The stop is called "${newFinal.name}".

EXISTING NARRATION:
${existingNarration}

Rewrite this narration to include a brief conclusion-style ending (1-2 sentences) that wraps up the tour — referencing the tour concluding, wrapping up, or coming to a close. Keep all the existing content and naturally append the conclusion ending. Do not remove any existing sentences.

Output ONLY the updated narration text. No JSON, no markdown fences, no commentary.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      model: 'gemini_3_flash',
    });

    const newNarration = typeof result === 'string' ? result.trim() : '';
    if (newNarration && newNarration !== existingNarration) {
      await base44.entities.TourStop.update(newFinal.id, { narration_text: newNarration });
      updates.newFinal = { id: newFinal.id, narration_text: newNarration };
    }
  } catch (e) {
    console.error('Failed to add conclusion to new final stop:', e);
  }

  return Object.keys(updates).length > 0 ? updates : null;
}