import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { motion } from 'framer-motion';
import { Ghost, Loader2, FileText, Image, Video, ClipboardList, Users, Flag } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import { base44 } from '@/api/base44Client';
import ReportContentDialog from '@/components/ReportContentDialog';
import { getBlockedIds } from '@/lib/userBlocks';

const typeIcons = { evp: ClipboardList, photo: Image, video: Video, note: FileText };
const typeLabel = { evp: 'Personal Experience', photo: 'Photograph', video: 'Video', note: 'Note' };

const typeColors = {
  evp: '#a78bfa',
  photo: '#38bdf8',
  video: '#f472b6',
  note: '#4ade80',
};

function createPin(type) {
  const color = typeColors[type] || '#38bdf8';
  return L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:${color};border:2px solid rgba(255,255,255,0.3);transform:rotate(-45deg);box-shadow:0 0 10px ${color}88;"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -30],
  });
}

export default function CommunityMap() {
  const [pins, setPins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [blockedIds, setBlockedIds] = useState([]);
  const [reportingPin, setReportingPin] = useState(null);

  useEffect(() => {
    loadPins();
    getBlockedIds().then(setBlockedIds).catch(() => {});
  }, []);

  const loadPins = async () => {
    setLoading(true);
    // Fetch all evidence that is NOT private and has coordinates
    const all = await base44.entities.Evidence.filter({ is_private: false });
    const withCoords = all.filter(e => e.latitude && e.longitude);
    setPins(withCoords);
    setLoading(false);
  };

  // Hide pins authored by blocked users.
  const visiblePins = pins.filter(p => !blockedIds.includes(p.created_by_id));

  const filtered = filter === 'all' ? visiblePins : visiblePins.filter(p => p.type === filter);

  const center = filtered.length > 0
    ? [
        filtered.reduce((s, p) => s + p.latitude, 0) / filtered.length,
        filtered.reduce((s, p) => s + p.longitude, 0) / filtered.length,
      ]
    : [39.5, -98.35];

  const filterTypes = ['all', 'note', 'photo', 'video', 'evp'];
  const filterLabels = { all: 'All', note: 'Notes', photo: 'Photos', video: 'Videos', evp: 'Experiences' };

  return (
    <PageContainer>
      <SectionHeader
        title="Community Map"
        subtitle="Ghost sightings from all explorers"
      />

      <div className="px-4 pt-3 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
        {filterTypes.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-heading uppercase tracking-wider border transition-all ${
              filter === t
                ? 'bg-primary/20 border-primary/60 text-primary'
                : 'bg-card/30 border-border/40 text-muted-foreground'
            }`}
          >
            {filterLabels[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
            <Ghost className="w-10 h-10 text-primary" />
          </motion.div>
          <p className="text-xs text-muted-foreground font-heading tracking-wider uppercase">Gathering sightings...</p>
        </div>
      ) : (
        <>
          <div className="px-4 pb-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="w-3.5 h-3.5" />
              <span>{filtered.length} public {filter === 'all' ? 'sighting' : filterLabels[filter].toLowerCase()}{filtered.length !== 1 ? 's' : ''} on the map</span>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[50vh] gap-3 px-8 text-center">
              <Ghost className="w-12 h-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground font-heading">No public sightings yet</p>
              <p className="text-xs text-muted-foreground/60">Log evidence with a location to share with the community.</p>
            </div>
          ) : (
            <div className="px-4 pb-28">
              <MapContainer
                center={center}
                zoom={filtered.length === 1 ? 13 : 5}
                className="w-full rounded-xl overflow-hidden border border-border/40"
                style={{ height: '65vh' }}
              >
                <TileLayer
                  attribution='&copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                />
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
                />
                {filtered.map(pin => (
                  <Marker key={pin.id} position={[pin.latitude, pin.longitude]} icon={createPin(pin.type)}>
                    <Popup>
                      <div className="min-w-[180px]">
                        <p className="font-semibold text-sm mb-1">{pin.title}</p>
                        <p className="text-xs text-muted-foreground mb-1">{typeLabel[pin.type]}</p>
                        {pin.location_name && <p className="text-xs">📍 {pin.location_name}</p>}
                        {pin.date && <p className="text-xs text-muted-foreground">{pin.date}{pin.time ? ` • ${pin.time}` : ''}</p>}
                        {pin.description && <p className="text-xs mt-1 leading-relaxed">{pin.description.slice(0, 120)}{pin.description.length > 120 ? '…' : ''}</p>}
                        {pin.activity_level > 0 && (
                          <p className="text-xs mt-1">{'★'.repeat(pin.activity_level)}{'☆'.repeat(5 - pin.activity_level)}</p>
                        )}
                        <button
                          onClick={() => setReportingPin(pin)}
                          className="mt-2 flex items-center gap-1 text-[11px] text-destructive hover:underline"
                        >
                          <Flag className="w-3 h-3" /> Report
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>

              {/* Legend */}
              <div className="mt-3 flex gap-3 flex-wrap">
                {Object.entries(typeColors).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                    <span className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">{typeLabel[type]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <ReportContentDialog
        open={!!reportingPin}
        onOpenChange={(v) => !v && setReportingPin(null)}
        targetType="evidence"
        targetId={reportingPin?.id}
        authorId={reportingPin?.created_by_id}
        authorName={reportingPin?.location_name || 'Evidence author'}
      />
      <NavBar />
    </PageContainer>
  );
}