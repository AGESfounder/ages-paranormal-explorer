import React from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Small inline map shown when a user taps the coordinates on an evidence card.
// Expands in-place (option 1) rather than opening a separate page or modal.
export default function EvidenceMiniMap({ latitude, longitude, locationName }) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

  return (
    <div className="h-48 rounded-xl overflow-hidden border border-border/40 mt-2">
      <MapContainer
        center={[lat, lng]}
        zoom={15}
        scrollWheelZoom={false}
        zoomControl={false}
        attributionControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
        />
        <CircleMarker
          center={[lat, lng]}
          radius={10}
          pathOptions={{
            color: 'hsl(199,89%,48%)',
            fillColor: 'hsl(199,89%,48%)',
            fillOpacity: 0.35,
            weight: 2,
          }}
        >
          <Popup>
            <div className="text-xs font-heading">
              <strong>Evidence Location</strong>
              {locationName && <><br /><span className="text-muted-foreground">{locationName}</span></>}
              <br />
              <span className="text-muted-foreground">{lat.toFixed(5)}, {lng.toFixed(5)}</span>
            </div>
          </Popup>
        </CircleMarker>
      </MapContainer>
    </div>
  );
}