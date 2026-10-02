// DEVICE NARRATION TEST — one tour uses the device's built-in TTS for its
// narration instead of the server-side GenerateSpeech integration, so we can
// hear what device voices sound like before committing to the switch.
//
// TO REVERT: set DEVICE_NARRATION_TEST_TOUR_ID to null (or delete this file and
// the imports in TourDetail.jsx / StopDetail.jsx). Every other tour is
// completely unaffected and keeps server narration.

export const DEVICE_NARRATION_TEST_TOUR_ID = '6ab16df1830f5a3230353db4'; // Eisenhower Farm

export function isDeviceNarrationTour(tourId) {
  return !!DEVICE_NARRATION_TEST_TOUR_ID && !!tourId && tourId === DEVICE_NARRATION_TEST_TOUR_ID;
}