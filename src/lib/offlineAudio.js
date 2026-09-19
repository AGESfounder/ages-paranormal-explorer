// Pre-generate TTS narration audio for offline playback. Generates audio for
// the tour introduction, conclusion, and each stop's narration text, then
// stores the audio blobs in the Cache API so they play offline.

import { base44 } from '@/api/base44Client';
import { condenseTextsBatch, cacheCondensation, truncateText } from '@/lib/narrationLength';
import { spendManifestationEnergy } from '@/hooks/useEnergyGate';

const AUDIO_CACHE = 'ages-audio-v1';

// Build a valid URL for Cache API keys. The Cache API requires real URLs
// (it constructs a Request from the key); non-URL strings like
// "ages-offline-audio:abc:intro" are rejected silently, so audio is never
// stored and playback falls back to "no narration cached".
const audioKey = (tourId, key) => `/__ages_audio__/${tourId}/${key}`;

// Estimate narration credits for a text (matches useEnergyGate logic).
export function estimateNarrationCredits(text) {
  return Math.min(100, Math.max(1, Math.ceil((text || '').length / 50)));
}

// Calculate total narration credits for a full tour download.
// Includes intro, conclusion, and each stop's narration text.
export function estimateTourNarrationCredits(tour, stops, narrationLength = 'manifestation') {
  const fraction = narrationLength === 'whisper' ? 1 / 3 : narrationLength === 'echo' ? 2 / 3 : 1;
  let totalChars = 0;
  let segmentCount = 0;
  if (tour?.description) { totalChars += tour.description.length * fraction; segmentCount++; }
  if (tour?.introduction) { totalChars += tour.introduction.length * fraction; segmentCount++; }
  if (tour?.conclusion) { totalChars += tour.conclusion.length * fraction; segmentCount++; }
  for (const s of stops || []) {
    if (s.stop_type === 'parking' || s.stop_type === 'shuttle') continue;
    if (s.narration_text) { totalChars += s.narration_text.length * fraction; segmentCount++; }
    if (s.historical_info) { totalChars += s.historical_info.length * fraction; segmentCount++; }
    if (s.paranormal_info) { totalChars += s.paranormal_info.length * fraction; segmentCount++; }
  }
  return Math.min(100 * segmentCount, Math.max(1, Math.ceil(totalChars / 50)));
}

// Generate and cache TTS audio for all narratable tour content.
// Calls onProgress(completed, total, currentLabel) as each piece generates.
// Returns { audioMap, errors } where audioMap is { [key]: url }.
export async function generateTourAudio(tour, stops, onProgress, narrationLength = 'manifestation') {
  if (!('caches' in window)) {
    return { audioMap: {}, errors: 0, reason: 'Cache API unavailable' };
  }

  const cache = await caches.open(AUDIO_CACHE);
  const audioMap = {};
  let errors = 0;

  // Build the list of items to generate
  const items = [];
  if (tour?.description) {
    items.push({ key: `description`, text: tour.description, label: 'Tour Overview' });
  }
  if (tour?.introduction) {
    items.push({ key: `intro`, text: tour.introduction, label: 'Introduction' });
  }
  if (tour?.conclusion) {
    items.push({ key: `conclusion`, text: tour.conclusion, label: 'Conclusion' });
  }
  for (const s of stops || []) {
    if (s.stop_type !== 'parking' && s.stop_type !== 'shuttle') {
      if (s.narration_text) {
        items.push({ key: `stop:${s.id}`, text: s.narration_text, label: s.name || `Stop ${s.stop_number}` });
      }
      if (s.historical_info) {
        items.push({ key: `stop:${s.id}:history`, text: s.historical_info, label: `${s.name || `Stop ${s.stop_number}`} History` });
      }
      if (s.paranormal_info) {
        items.push({ key: `stop:${s.id}:paranormal`, text: s.paranormal_info, label: `${s.name || `Stop ${s.stop_number}`} Paranormal` });
      }
    }
  }

  // Condense texts for whisper/echo modes. The condensed text is used for
  // audio generation AND cached in localStorage so the display layer
  // (useCondensedTexts) finds it offline without a live LLM call.
  //
  // IMPORTANT: Condense in SMALL batches (tour-level texts together, then
  // each stop's 3 texts together) — NOT one giant batch with everything.
  // The live tour condenses 3 texts per stop via useCondensedTexts, and
  // a giant batch (20-30+ texts) overwhelms the LLM, causing it to fail
  // or return incomplete JSON. That failure falls back to truncateText
  // (chopped-off sentences), which is NOT cached — so the saved tour
  // shows truncated text while the live tour shows polished LLM summaries.
  // Small batches match the live tour's quality and get cached properly.
  if (narrationLength !== 'manifestation') {
    // Group items into small batches: tour-level texts together, then
    // each stop's texts together (narration_text, history, paranormal).
    const tourLevelItems = items.filter(
      (i) => i.key === 'description' || i.key === 'intro' || i.key === 'conclusion'
    );
    const stopGroups = new Map();
    for (const item of items) {
      if (item.key.startsWith('stop:')) {
        const stopId = item.key.split(':')[1];
        if (!stopGroups.has(stopId)) stopGroups.set(stopId, []);
        stopGroups.get(stopId).push(item);
      }
    }
    const batches = [];
    if (tourLevelItems.length > 0) batches.push(tourLevelItems);
    for (const [, stopItems] of stopGroups) batches.push(stopItems);

    let batchEnergySpent = 0;
    for (const batch of batches) {
      const textMap = {};
      for (const item of batch) {
        textMap[item.key] = item.text;
      }
      try {
        const condensed = await condenseTextsBatch(textMap, narrationLength);
        for (const item of batch) {
          if (condensed[item.key]) {
            cacheCondensation(item.text, narrationLength, condensed[item.key]);
            item.text = condensed[item.key];
          } else {
            item.text = truncateText(item.text, narrationLength);
          }
        }
        batchEnergySpent++;
      } catch (e) {
        console.error('Batch condensation failed, using truncated fallback:', e);
        for (const item of batch) {
          item.text = truncateText(item.text, narrationLength);
        }
      }
    }
    if (batchEnergySpent > 0) {
      try { await spendManifestationEnergy(); } catch {}
    }
  }

  let completed = 0;
  let generatedChars = 0;
  let generatedSegments = 0;
  for (const item of items) {
    try {
      // Check if already cached (re-download of same tour)
      const cacheKey = audioKey(tour.id, item.key);
      const existing = await cache.match(cacheKey);
      if (existing) {
        const blobUrl = URL.createObjectURL(await existing.blob());
        audioMap[item.key] = { url: blobUrl, cacheKey, text: item.text };
        completed++;
        if (onProgress) onProgress(completed, items.length, item.label);
        continue;
      }

      // New segment — track for credit calculation
      generatedChars += item.text.length;
      generatedSegments++;

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

  const generatedCredits = Math.min(100 * generatedSegments, Math.max(0, Math.ceil(generatedChars / 50)));
  return { audioMap, errors, generatedCredits };
}

// Retrieve a cached audio blob URL for offline playback.
// Returns a blob URL or null if not cached.
export async function getOfflineAudio(tourId, key) {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const cacheKey = audioKey(tourId, key);
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
    const prefix = `/__ages_audio__/${tourId}/`;
    await Promise.all(
      keys
        .filter((req) => req.url.includes(prefix))
        .map((req) => cache.delete(req))
    );
  } catch {}
}