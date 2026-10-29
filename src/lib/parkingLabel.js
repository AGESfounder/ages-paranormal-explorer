// An unplaced lot (needs_placement) has no confirmed spot — the record still
// carries whatever name and address the model guessed, and that address is
// often somewhere else entirely in town. Printing it would advertise a lot that
// was never found, so an unplaced lot shows as a plain parking area with no
// name and no address until a person places it on the map.
export function parkingDisplay(stop) {
  const unplaced = stop?.needs_placement === true;
  return {
    unplaced,
    name: unplaced ? 'Parking Area' : (stop?.name || 'Parking Area'),
    address: unplaced ? '' : (stop?.address || ''),
  };
}