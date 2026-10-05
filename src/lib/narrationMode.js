// Narration mode storage — Device (free, client-side TTS) vs Enhanced
// (server-side GenerateSpeech, costs narration energy).
// Mode is persisted in localStorage and shared across all pages/tours.

import { isPaidAccess, getSpendableEnergy } from '@/lib/access';

const MODE_KEY = 'ages_narration_mode';

export function getNarrationMode() {
  try {
    return localStorage.getItem(MODE_KEY) || 'device';
  } catch {
    return 'device';
  }
}

export function setNarrationMode(mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {}
}

// Enhanced narration requires paid access AND narration energy.
// Observer/Seeker/Technician have no narration energy → Device only.
// Explorer/Investigator/Trailblazer have monthly narration energy → both modes.
export function canUseEnhanced(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!isPaidAccess(user)) return false;
  const { narration } = getSpendableEnergy(user);
  return narration > 0;
}