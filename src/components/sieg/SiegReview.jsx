import React, { useRef, useMemo, useEffect } from 'react';
import { X, Check, Video, Maximize2 } from 'lucide-react';
import EvidenceSaveButtons from '@/components/EvidenceSaveButtons';
import RecordTrimPicker from '@/components/RecordTrimPicker';
import RecordingPreparation from '@/components/RecordingPreparation';
import SiegEventLog from '@/components/sieg/SiegEventLog';
import { SIEG_LANES } from '@/lib/siegDisplay';

function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// What a finished session shows: the recording, the event log with its lane
// counts, and where it goes. A long session is one evidence record, saved through
// the same gate every other tool uses.
//
// The recording is the only thing here that goes full screen — the session screen
// itself stays inline, so the rest of the toolkit stays on screen around it.
//
// A session that ended on its own has already saved itself by the time anyone
// gets back to the phone, so this screen then says so and keeps the recording and
// the log on screen rather than emptying itself.
export default function SiegReview({ blob, session, events, counts, correlatedCount, duration, saving, saved, onSave, onDiscard, trimMode, onTrimChange, preparation }) {
  const mediaRef = useRef(null);
  const src = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);

  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  // A session recorded without a picture is played as audio. The same file in a
  // video player is a single frozen frame, and the recording is the evidence here.
  const isAudio = !!(blob && blob.type.startsWith('audio'));

  const goFullScreen = () => {
    const v = mediaRef.current;
    if (!v) return;
    try {
      if (v.requestFullscreen) v.requestFullscreen();
      else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
      else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
    } catch { /* this device will not open the video full screen */ }
  };

  return (
    <div className="space-y-3">
      <div className="p-2.5 rounded-lg bg-card/30 border border-border/30">
        <p className="text-xs font-medium text-foreground">{session?.name}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {formatDuration(duration)} recorded · {events.length} event{events.length === 1 ? '' : 's'} · {correlatedCount} correlated
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
          {SIEG_LANES.map((lane) => (
            <span key={lane.id} className="text-[9px] font-heading uppercase tracking-wider" style={{ color: lane.color }}>
              {lane.label} {counts?.[lane.id] || 0}
            </span>
          ))}
        </div>
      </div>

      {saved && (
        <div className="p-2.5 rounded-lg border border-green-500/30 bg-green-500/10">
          <p className="text-[10px] text-green-400 leading-relaxed">
            Saved to your Evidence Journal as one record — the recording and this session log are both on it.
          </p>
        </div>
      )}

      {src ? (
        isAudio ? (
          <audio ref={mediaRef} src={src} controls className="w-full" />
        ) : (
          <>
            <video
              ref={mediaRef}
              src={src}
              controls
              playsInline
              className="w-full rounded border border-border/30 bg-black"
              style={{ maxHeight: 220 }}
            />
            <button
              onClick={goFullScreen}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border/40 text-muted-foreground font-heading text-[10px] uppercase tracking-wider hover:border-primary/30 hover:text-primary transition-colors"
            >
              <Maximize2 className="w-3 h-3" /> Full screen
            </button>
          </>
        )
      ) : (
        <div className="p-4 rounded-lg bg-card/30 border border-border/30 text-center">
          <Video className="w-6 h-6 text-muted-foreground/40 mx-auto mb-1.5" />
          <p className="text-[10px] text-muted-foreground">Finishing the recording…</p>
        </div>
      )}

      <div>
        <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">Session log</p>
        <div className="max-h-64 overflow-y-auto toolkit-scroll pr-1">
          <SiegEventLog events={events} emptyText="No events were logged in this session." />
        </div>
      </div>

      {(src || preparation?.preparing || preparation?.error) && !saved && (
        <>
          <RecordTrimPicker value={trimMode} onChange={onTrimChange} />
          <RecordingPreparation {...preparation} />
          <EvidenceSaveButtons onSave={onSave} saving={saving} deviceBlob={blob} originalBlob={preparation?.originalBlob} devicePrefix="sieg_session" preparing={preparation?.preparing} preparationError={preparation?.error} />
        </>
      )}

      <button
        onClick={onDiscard}
        className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg font-heading text-xs uppercase tracking-wider transition-colors ${
          saved
            ? 'bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20'
            : 'border border-border/40 text-muted-foreground hover:border-red-500/30 hover:text-red-400'
        }`}
      >
        {saved ? <><Check className="w-3.5 h-3.5" /> Done</> : <><X className="w-3.5 h-3.5" /> Discard</>}
      </button>
    </div>
  );
}