import L from 'leaflet';

export function makeParkingIcon() {
  return new L.DivIcon({
    className: 'parking-marker',
    html: `<div style="
      width: 28px; height: 28px;
      background: hsl(45, 90%, 50%);
      border-radius: 6px;
      box-shadow: 0 0 12px hsl(45, 90%, 50%, 0.6), 0 0 24px hsl(45, 90%, 50%, 0.3);
      border: 2px solid hsl(45, 90%, 50%);
      display: flex; align-items: center; justify-content: center;
      color: white; font-size: 14px; font-weight: bold; font-family: 'Cinzel', serif;
    ">P</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

// A lot nobody has confirmed: the marker must not read as a verified lot. It
// sits at the centre of the walking loop until a person places it (dragging it
// opens the parking dialog, which collects the details and clears the flag).
export function makeUnconfirmedParkingIcon() {
  return new L.DivIcon({
    className: 'parking-marker unconfirmed',
    html: `<div style="position:relative;width:28px;height:28px;">
      <div style="width:28px;height:28px;background:hsl(45,90%,50%);border-radius:6px;box-shadow:0 0 12px hsl(45,90%,50%,0.5);border:2px dashed hsl(45,90%,50%);display:flex;align-items:center;justify-content:center;color:white;font-size:14px;font-weight:bold;font-family:'Cinzel',serif;">P</div>
      <div style="position:absolute;top:-6px;right:-8px;min-width:22px;height:14px;padding:0 3px;background:hsl(330,80%,55%);border-radius:7px;border:1.5px solid hsl(222,47%,8%);display:flex;align-items:center;justify-content:center;color:white;font-size:7px;font-weight:bold;font-family:'Inter',sans-serif;line-height:1;letter-spacing:0.3px;">PLACE</div>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

export function makeShuttleIcon() {
  return new L.DivIcon({
    className: 'shuttle-marker',
    html: `<div style="
      width: 28px; height: 28px;
      background: hsl(142, 70%, 45%);
      border-radius: 6px;
      box-shadow: 0 0 12px hsl(142, 70%, 45%, 0.6), 0 0 24px hsl(142, 70%, 45%, 0.3);
      border: 2px solid hsl(142, 70%, 45%);
      display: flex; align-items: center; justify-content: center;
      color: white; font-size: 14px; font-weight: bold; font-family: 'Cinzel', serif;
    ">S</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

export function makeStopIcon(stopNumber, estimated = false) {
  if (estimated) {
    return new L.DivIcon({
      className: 'stop-marker estimated',
      html: `<div style="position:relative;width:28px;height:28px;">
        <div style="width:28px;height:28px;background:hsl(35,90%,50%);border-radius:50%;box-shadow:0 0 12px hsl(35,90%,50%,0.6),0 0 24px hsl(35,90%,50%,0.3);border:2px dashed hsl(35,90%,50%);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;font-family:'Cinzel',serif;">${stopNumber}</div>
        <div style="position:absolute;top:-6px;right:-6px;min-width:18px;height:14px;padding:0 3px;background:hsl(35,90%,50%);border-radius:7px;border:1.5px solid hsl(222,47%,8%);display:flex;align-items:center;justify-content:center;color:white;font-size:8px;font-weight:bold;font-family:'Inter',sans-serif;line-height:1;letter-spacing:0.5px;">EST</div>
      </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16],
    });
  }
  return new L.DivIcon({
    className: 'stop-marker',
    html: `<div style="
      width: 28px; height: 28px;
      background: hsl(199,89%,48%);
      border-radius: 50%;
      box-shadow: 0 0 12px hsl(199,89%,48%,0.6), 0 0 24px hsl(199,89%,48%,0.3);
      border: 2px solid hsl(199,89%,48%);
      display: flex; align-items: center; justify-content: center;
      color: white; font-size: 12px; font-weight: bold; font-family: 'Cinzel', serif;
    ">${stopNumber}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

// Stacked marker for same_structure stops sharing identical coordinates
// (rooms in one building, decks on a ship). Shows the first stop's number
// with a purple count badge indicating how many stops are at this location.
export function makeStackedIcon(stopNumber, count) {
  return new L.DivIcon({
    className: 'stop-marker stacked',
    html: `<div style="position:relative;width:28px;height:28px;">
      <div style="width:28px;height:28px;background:hsl(199,89%,48%);border-radius:50%;box-shadow:0 0 12px hsl(199,89%,48%,0.6),0 0 24px hsl(199,89%,48%,0.3);border:2px solid hsl(199,89%,48%);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;font-family:'Cinzel',serif;">${stopNumber}</div>
      <div style="position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;padding:0 3px;background:hsl(270,40%,50%);border-radius:8px;border:1.5px solid hsl(222,47%,8%);display:flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:bold;font-family:'Inter',sans-serif;line-height:1;">${count}</div>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

export function makeNeedsPlacementIcon(stopNumber) {
  return new L.DivIcon({
    className: 'stop-marker needs-placement',
    html: `<div style="position:relative;width:28px;height:28px;">
      <div style="width:28px;height:28px;background:hsl(330,80%,55%);border-radius:50%;box-shadow:0 0 12px hsl(330,80%,55%,0.6),0 0 24px hsl(330,80%,55%,0.3);border:2px dashed hsl(330,80%,55%);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;font-family:'Cinzel',serif;">${stopNumber}</div>
      <div style="position:absolute;top:-6px;right:-6px;min-width:22px;height:14px;padding:0 3px;background:hsl(330,80%,55%);border-radius:7px;border:1.5px solid hsl(222,47%,8%);display:flex;align-items:center;justify-content:center;color:white;font-size:7px;font-weight:bold;font-family:'Inter',sans-serif;line-height:1;letter-spacing:0.3px;">PLACE</div>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

// Arrowhead that sits at the end of a leader line. The triangle points up by
// default, so it is rotated to face the dot it marks.
export function makeArrowIcon(rotationDeg) {
  return new L.DivIcon({
    className: 'stop-marker leader-arrow',
    html: `<div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:8px solid hsl(199,89%,62%);transform:rotate(${rotationDeg}deg);filter:drop-shadow(0 0 3px hsl(199,89%,48%,0.9));"></div>`,
    iconSize: [8, 8],
    iconAnchor: [4, 4],
  });
}