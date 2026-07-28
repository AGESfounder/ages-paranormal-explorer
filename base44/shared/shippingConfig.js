// Ship-from (your business) address used to quote live carrier rates via EasyPost.
// Edit these values to match where orders ship from.
export const ORIGIN_ADDRESS = {
  street1: '123 Main St',
  city: 'Your City',
  state: 'NY',
  zip: '10001',
};

// Fallback parcel dimensions/weight used when a product does not specify its own.
export const DEFAULT_PARCEL = {
  weight: 16,   // ounces
  length: 10,   // inches
  width: 8,    // inches
  height: 6,   // inches
};