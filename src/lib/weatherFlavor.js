// Investigative guidance based on weather conditions.
// Does NOT claim paranormal effects are scientifically established.
// Frames guidance as field practice and investigator experience.

export function getWeatherFlavor(weatherCode, temp, humidity, windStr) {
  const flavors = [];
  const windMph = parseInt(String(windStr)) || 0;

  if (weatherCode === 0 || weatherCode === 1) {
    flavors.push('Clear skies — many investigators favor these nights for visibility and outdoor sessions.');
  } else if (weatherCode === 2 || weatherCode === 3) {
    flavors.push('Cloud cover — some investigators report more activity under overcast skies, though this is anecdotal.');
  } else if (weatherCode === 45 || weatherCode === 48) {
    flavors.push('Fog — a classic investigation backdrop. Note that fog can affect audio quality and photo interpretation.');
  } else if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) {
    flavors.push('Rain — protect equipment and be aware that moisture can trigger false readings on motion sensors.');
  } else if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) {
    flavors.push('Snow — cold conditions can affect battery life; carry spares and allow equipment to acclimate.');
  } else if ([95, 96, 99].includes(weatherCode)) {
    flavors.push('Thunderstorms — for safety, avoid outdoor investigation and metal equipment during active storms.');
  }

  if (temp <= 32) {
    flavors.push('Below freezing — dress warmly and watch for condensation on camera lenses.');
  } else if (temp >= 80) {
    flavors.push('Warm night — note that heat can influence EMF and thermal readings, so establish baselines carefully.');
  }

  if (humidity >= 80) {
    flavors.push('High humidity — moisture in the air can affect sensitive equipment; document conditions for each reading.');
  } else if (humidity <= 30) {
    flavors.push('Dry air — static buildup may affect EMF meters; ground yourself and note the conditions.');
  }

  if (windMph >= 15) {
    flavors.push('Strong wind — secure tripods and be aware that wind vibrations can trigger motion sensors.');
  } else if (windMph <= 2) {
    flavors.push('Calm air — ideal for audio sessions with minimal environmental noise.');
  }

  return flavors.length > 0 ? flavors.join(' ') : 'No special guidance for current conditions.';
}