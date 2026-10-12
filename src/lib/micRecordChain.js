// The microphone branch of every tool session recording.
//
// Two things have to be true at once in these recordings: the investigator's own
// voice and the room come through clearly, and the tools' own sound does not
// drown them. The phone's speaker sits about a centimetre from its microphone,
// so whatever the tools say is enormously louder at the mic than a voice or a
// TV across the room.
//
// So the microphone is captured as the phone's plain feed — no echo
// cancellation, no noise suppression, because both remove exactly what these
// recordings are for (the dictated items leave through the speaker, and room
// tone is evidence) — and is then lifted through a gain and a limiter. The
// limiter is what does the real work: it caps the speaker's peaks, which is what
// lets the voice and the room sit at a usable level beside them.
//
// MIC_RECORD_GAIN is the single number to tune: raise it if the investigator's
// voice is still faint, lower it if the tools' own audio sounds crushed.
export const MIC_RECORD_GAIN = 4.0;

// Build the mic chain and return its output node: mic -> gain -> limiter.
// The caller connects that node to whatever it records — the mixed destination
// (tools' own audio + mic) or a mic-only destination.
export function buildMicChain(ctx, micStream) {
  const micSrc = ctx.createMediaStreamSource(micStream);
  const micGain = ctx.createGain();
  micGain.gain.value = MIC_RECORD_GAIN;
  micSrc.connect(micGain);
  let out = micGain;
  if (typeof ctx.createDynamicsCompressor === 'function') {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    micGain.connect(limiter);
    out = limiter;
  }
  return out;
}