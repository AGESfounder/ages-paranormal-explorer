// Static tables shared by Cost Analysis B — copied unchanged from Cost Analysis A
// (src/pages/PlanAnalysis.jsx). Only the stop-enrichment audit row depends on the
// Option E enrichment change.

export const TOOLKIT_TIERS = [
  { tier: 'Observer (Free)', visible: 12, accessible: 4, locked: 8 },
  { tier: 'Seeker ($3.99)', visible: 12, accessible: 4, locked: 8 },
  { tier: 'Technician ($5.99)', visible: 12, accessible: 10, locked: 2 },
  { tier: 'Explorer ($7.99)', visible: 12, accessible: 10, locked: 2 },
  { tier: 'Investigator ($11.99)', visible: 12, accessible: 12, locked: 0 },
  { tier: 'Trailblazer ($239.99)', visible: 12, accessible: 12, locked: 0 },
];

const BASE_CREDIT_AUDIT = [
  { action: 'Custom Tour Creation', page: 'Home -> Custom Tour', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3–9', gated: 'Yes' },
  { action: 'Haunted Locations -> Create Tour', page: 'Home -> Haunted Explorations', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3–9', gated: 'Yes' },
  { action: 'Nearby -> Create Tour (distance)', page: 'Nearby', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3', gated: 'Yes' },
  { action: 'Nearby -> Create Tour (zip)', page: 'Nearby', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3', gated: 'Yes' },
  { action: 'Abroad Tour Creation', page: 'Abroad Tours -> Create', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3', gated: 'Yes' },
  { action: 'Auto Stop Generation (no stops)', page: 'Tour Detail (auto)', type: 'Manifest.', integration: 'InvokeLLM (automatic)', credits: '2–4', gated: 'Yes' },
  { action: 'Add Stops to Tour', page: 'Tour Card -> Add Stops', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3', gated: 'Yes' },
  { action: 'Stop Enrichment (thin content, 2-pass for single-site)', page: 'Stop Detail (auto, 1st view)', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web) + rewrite pass (single-site only)', credits: '3–6 (6 = single-site 2-pass)', gated: 'Yes' },
  { action: 'People Extraction (rich content)', page: 'Stop Detail (auto, 1st view)', type: 'Manifest.', integration: 'InvokeLLM (automatic)', credits: '2', gated: 'Yes' },
  { action: 'Haunted Locations Discovery', page: 'Home -> Nearby/Zip search', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3', gated: 'Yes' },
  { action: 'Term Sweeper -> Build Terms (stop)', page: 'Toolkit -> Term Sweeper', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash)', credits: '3', gated: 'Yes' },
  { action: 'Term Sweeper -> Build Terms (geo)', page: 'Toolkit -> Term Sweeper', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3', gated: 'Yes' },
  { action: 'Weather -> Get Location Weather', page: 'Toolkit -> Weather Monitor', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3', gated: 'Yes' },
  { action: 'Weather -> Search by City', page: 'Toolkit -> Weather Monitor', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3', gated: 'Yes' },
  { action: 'Narrate Tour Description', page: 'Tour Detail', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '4–20', gated: 'Yes' },
  { action: 'Narrate Tour Introduction', page: 'Tour Detail', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '10–40', gated: 'Yes' },
  { action: 'Narrate Tour Conclusion', page: 'Tour Detail', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '8–32', gated: 'Yes' },
  { action: 'Narrate Stop Ghost Story', page: 'Stop Detail', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '4–12', gated: 'Yes' },
  { action: 'Narrate Stop Paranormal Info', page: 'Stop Detail', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '20–80', gated: 'Yes' },
  { action: 'Narrate Stop Historical Info', page: 'Stop Detail', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '20–80', gated: 'Yes' },
  { action: 'Narrate Investigation Suggestions', page: 'Stop Detail', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '4–10', gated: 'Yes' },
  { action: 'Narrate Person Story', page: 'Stop Detail -> Tap name', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '6–20', gated: 'Yes' },
  { action: 'Narrate Location Summary', page: 'Home -> Haunted Explorations', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '4–20', gated: 'Yes' },
  { action: 'Narrate Equipment Guide', page: 'Toolkit -> Equipment Guide', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '20–80', gated: 'Yes' },
  { action: 'Sweeper Trigger Voice (Alphabet)', page: 'Toolkit -> Alphabet Sweeper', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '1 each', gated: 'Yes' },
  { action: 'Sweeper Trigger Voice (Term)', page: 'Toolkit -> Term Sweeper', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '1 each', gated: 'Yes' },
  { action: 'Sweeper Trigger Voice (Yes/No)', page: 'Toolkit -> Yes/No Sweeper', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '1 each', gated: 'Yes' },
];

export function creditAudit(stopsPerEnergy) {
  if (stopsPerEnergy <= 1) return BASE_CREDIT_AUDIT;
  return BASE_CREDIT_AUDIT.map((r) => (r.action.startsWith('Stop Enrichment')
    ? { ...r, action: `Stop Enrichment (batched: ${stopsPerEnergy} stops per call; 2-pass for single-site)`, credits: `3–6 per call (covers ${stopsPerEnergy} stops)` }
    : r));
}