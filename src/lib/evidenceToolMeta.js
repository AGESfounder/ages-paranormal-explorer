// Tool filter definitions for the Community Map. Each id is the value
// stored in Evidence.source_tool. Colors match each tool's --td-accent
// from the toolkit tile skins in src/index.css, so a map marker reads as
// the same tool the user tapped in the rack.
export const TOOL_FILTERS = [
  { id: 'recorder', label: 'Audio Recorder', color: '#ef4444' },
  { id: 'audio', label: 'Acoustic Anomaly Sweeper', color: '#a3e635' },
  { id: 'sls', label: 'Anomaly Camera', color: '#22d3ee' },
  { id: 'rem', label: 'Vibration Communicator', color: '#4ade80' },
  { id: 'environment', label: 'Environmental Anomaly Monitor', color: '#fb923c' },
  { id: 'sieg', label: 'SIEG', color: '#2dd4bf' },
  { id: 'termbank', label: 'Terms Sweeper', color: '#e0b463' },
  { id: 'alphabet', label: 'Alphabet Sweeper', color: '#a855f7' },
  { id: 'yesno', label: 'Yes/No/IDK Sweeper', color: '#f472b6' },
  { id: 'photo', label: 'Photos', color: '#38bdf8' },
  { id: 'note', label: 'Notes', color: '#facc15' },
  { id: 'manual', label: 'Manual', color: '#94a3b8' },
];

const FILTER_BY_ID = Object.fromEntries(TOOL_FILTERS.map(t => [t.id, t]));

// Resolve which filter a given evidence record belongs to.
// Tool-produced evidence has source_tool set to the tool's type slug.
// Manual evidence from the Evidence page has source_tool set to 'photo',
// 'note', or 'manual'. Legacy records (no source_tool) fall back to
// inferring from the media type field.
export function resolveFilterId(evidence) {
  if (evidence.source_tool) return evidence.source_tool;
  if (evidence.type === 'photo') return 'photo';
  if (evidence.type === 'note') return 'note';
  return 'manual';
}

export function getToolColor(evidence) {
  const id = resolveFilterId(evidence);
  return FILTER_BY_ID[id]?.color || '#38bdf8';
}

export function getToolLabel(filterId) {
  return FILTER_BY_ID[filterId]?.label || filterId;
}