import { useState, useEffect } from 'react';
import { truncateText, getCachedCondensation, cacheCondensation, condenseTextsBatch } from '@/lib/narrationLength';
import { checkManifestationGate, spendManifestationEnergy } from '@/hooks/useEnergyGate';

/**
 * Batch-condense multiple texts via LLM into cohesive, self-contained summaries.
 * - 'manifestation' mode returns full texts immediately (no cost).
 * - 'whisper'/'echo' checks localStorage cache first; uncached texts are sent
 *   to the LLM in a single call (1 manifestation energy per batch).
 * - Truncated text is shown immediately as a fallback while the LLM works,
 *   then swapped in when the polished version arrives.
 * - Free / out-of-energy users keep the simple truncated fallback (no charge).
 *
 * @param {Object} textMap - { key: fullText }
 * @param {string} mode - 'whisper' | 'echo' | 'manifestation'
 * @returns {Object} { key: displayText }
 */
export function useCondensedTexts(textMap, mode) {
  const [results, setResults] = useState(() => {
    const initial = {};
    for (const [key, text] of Object.entries(textMap || {})) {
      if (!text) { initial[key] = ''; continue; }
      if (mode === 'manifestation') { initial[key] = text; continue; }
      initial[key] = getCachedCondensation(text, mode) || truncateText(text, mode);
    }
    return initial;
  });

  const serialized = JSON.stringify(textMap || {});

  useEffect(() => {
    const map = JSON.parse(serialized);

    if (mode === 'manifestation') {
      setResults(Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v || ''])));
      return;
    }

    // Start with cached values or truncated fallbacks
    const initial = {};
    const uncached = {};
    for (const [key, text] of Object.entries(map)) {
      if (!text) { initial[key] = ''; continue; }
      const cached = getCachedCondensation(text, mode);
      if (cached) { initial[key] = cached; continue; }
      initial[key] = truncateText(text, mode);
      uncached[key] = text;
    }
    setResults(initial);

    if (Object.keys(uncached).length === 0) return;

    let cancelled = false;
    (async () => {
      const gate = await checkManifestationGate();
      if (!gate.allowed) return; // Keep truncated fallback for free / out-of-energy

      try {
        const condensed = await condenseTextsBatch(uncached, mode);
        if (cancelled) return;
        for (const [key, text] of Object.entries(uncached)) {
          if (condensed[key]) cacheCondensation(text, mode, condensed[key]);
        }
        setResults(prev => {
          const updated = { ...prev };
          for (const [key] of Object.entries(uncached)) {
            if (condensed[key]) updated[key] = condensed[key];
          }
          return updated;
        });
        await spendManifestationEnergy();
      } catch (e) {
        console.error('Batch condensation failed:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [serialized, mode]);

  return results;
}