// All trims operate on the complete source through prepareRecording. Never
// concatenate an opening container fragment with a tail: its timestamps and
// sample references would still point into the deleted middle of the file.
export const TRIM_OPTIONS = [
  { id: 'brief', label: 'Brief', seconds: 30, desc: 'last 30 seconds' },
  { id: 'standard', label: 'Standard', seconds: 90, desc: 'last 90 seconds' },
  { id: 'full', label: 'Full', seconds: null, desc: 'entire session' },
];