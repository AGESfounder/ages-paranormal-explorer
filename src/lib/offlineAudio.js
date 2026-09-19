// Pre-generate TTS narration audio for offline playback. Generates audio for
// the tour introduction, conclusion, and each stop's narration text, then
// stores the audio blobs in the Cache API so they play offline.

import { base44 } from '@/api/base44Client';

const AUDIO_CACHE = 'ages-audio-v1';

// Estimate narration credits for a text (matches useEnergyGate logic).
export function estimateNarrationCredits(text) {
  return Math.min(100, Math.max(1, Math.ceil((text || '').length / 50)));
}

// Calculate total narration credits for a full tour download.
// Includes intro, conclusion, and each stop's narration text.
export function estimateTourNarrationCredits(tour, stops) {
  let totalChars = 0;
  if (tour?.introduction) totalChars += tour.introduction.length;
  if (tour?.conclusion) totalChars += tour.conclusion.length;
  for (const s of stops || []) {
    if (s.narration_text) totalChars += s.narration_text.length;
  }
  return Math.min(100 * ((tour?.introduction ? 1 : 0) + (tour?.conclusion ? 1 : 0) + (stops?.length || 0)),
    Math.max(1, Math.ceil(totalChars / 50)));
}

// Generate and cache TTS audio for all narratable tour content.
// Calls onProgress(completed, total, currentLabel) as each piece generates.
// Returns { audioMap, errors } where audioMap is { [key]: url }.
export async function generateTourAudio(tour, stops, onProgress) {
  if (!('caches' in window)) {
    return { audioMap: {}, errors: 0, reason: 'Cache API unavailable' };
  }

  const cache = await caches.open(AUDIO_CACHE);
  const audioMap = {};
  let errors = 0;

  // Build the list of items to generate
  const items = [];
  if (tour?.introduction) {
    items.push({ key: `intro`, text: tour.introduction, label: 'Introduction' });
  }
  if (tour?.conclusion) {
    items.push({ key: `conclusion`, text: tour.conclusion, label: 'Conclusion' });
  }
  for (const s of stops || []) {
    if (s.narration_text && s.stop_type !== 'parking' && s.stop_type !== 'shuttle') {
      items.push({ key: `stop:${s.id}`, text: s.narration_text, label: s.name || `Stop ${s.stop_number}` });
    }
  }

  let completed = 0;
  for (const item of items) {
    try {
      // Check if already cached (re-download of same tour)
      const cacheKey = `ages-offline-audio:${tour.id}:${item.key}`;
      const existing = await cache.match(cacheKey);
      if (existing) {
        const blobUrl = URL.createObjectURL(await existing.blob());
        audioMap[item.key] = { url: blobUrl, cacheKey, text: item.text };
        completed++;
        if (onProgress) onProgress(completed, items.length, item.label);
        continue;
      }

      // Generate TTS
      const result = await base44.integrations.Core.GenerateSpeech({
        text: item.text,
        voice: 'storm',
      });

      // Fetch the audio blob and cache it
      const resp = await fetch(result.url);
      const blob = await resp.blob();
      const storeResp = new Response(blob, {
        headers: { 'Content-Type': blob.type || 'audio/mpeg' },
      });
      await cache.put(cacheKey, storeResp);

      // Store a blob URL for immediate use (will be recreated on offline load)
      const blobUrl = URL.createObjectURL(blob);
      audioMap[item.key] = { url: blobUrl, cacheKey, text: item.text };
    } catch (err) {
      console.error(`Failed to generate audio for ${item.key}:`, err);
      errors++;
    }
    completed++;
    if (onProgress) onProgress(completed, items.length, item.label);
  }

  return { audioMap, errors };
}

// Retrieve a cached audio blob URL for offline playback.
// Returns a blob URL or null if not cached.
export async function getOfflineAudio(tourId, key) {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const cacheKey = `ages-offline-audio:${tourId}:${key}`;
    const resp = await cache.match(cacheKey);
    if (!resp) return null;
    const blob = await resp.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

// Retrieve a cached audio blob URL for a specific stop.
export async function getOfflineStopAudio(tourId, stopId) {
  return getOfflineAudio(tourId, `stop:${stopId}`);
}

// Remove all cached audio for a tour.
export async function clearTourAudio(tourId) {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const keys = await cache.keys();
    const prefix = `ages-offline-audio:${tourId}:`;
    await Promise.all(
      keys
        .filter((req) => req.url.includes(prefix))
        .map((req) => cache.delete(req))
    );
  } catch {}
}