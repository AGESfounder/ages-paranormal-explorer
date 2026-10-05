// Free Open-Meteo weather — no API key, no energy cost.
// Replaces the InvokeLLM weather fetch in the Weather Monitor tool.
// Open-Meteo is free for non-commercial use with no API key required.

const WEATHER_CODES = {
  0: { label: 'Clear sky', icon: '☀️' },
  1: { label: 'Mainly clear', icon: '🌤️' },
  2: { label: 'Partly cloudy', icon: '⛅' },
  3: { label: 'Overcast', icon: '☁️' },
  45: { label: 'Fog', icon: '🌫️' },
  48: { label: 'Rime fog', icon: '🌫️' },
  51: { label: 'Light drizzle', icon: '🌦️' },
  53: { label: 'Drizzle', icon: '🌦️' },
  55: { label: 'Heavy drizzle', icon: '🌧️' },
  56: { label: 'Freezing drizzle', icon: '🌨️' },
  57: { label: 'Freezing drizzle', icon: '🌨️' },
  61: { label: 'Light rain', icon: '🌦️' },
  63: { label: 'Rain', icon: '🌧️' },
  65: { label: 'Heavy rain', icon: '🌧️' },
  66: { label: 'Freezing rain', icon: '🌨️' },
  67: { label: 'Freezing rain', icon: '🌨️' },
  71: { label: 'Light snow', icon: '🌨️' },
  73: { label: 'Snow', icon: '❄️' },
  75: { label: 'Heavy snow', icon: '❄️' },
  77: { label: 'Snow grains', icon: '🌨️' },
  80: { label: 'Light showers', icon: '🌦️' },
  81: { label: 'Showers', icon: '🌧️' },
  82: { label: 'Violent showers', icon: '⛈️' },
  85: { label: 'Snow showers', icon: '🌨️' },
  86: { label: 'Heavy snow showers', icon: '❄️' },
  95: { label: 'Thunderstorm', icon: '⛈️' },
  96: { label: 'Thunderstorm + hail', icon: '⛈️' },
  99: { label: 'Severe thunderstorm', icon: '⛈️' },
};

export function describeWeatherCode(code) {
  return WEATHER_CODES[code] || { label: 'Unknown', icon: '🌡️' };
}

function windDirName(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// Fetch weather by coordinates. Returns { temperature, humidity, wind, conditions, weatherCode, location }.
export async function fetchWeatherByCoords(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Weather request failed');
  const data = await resp.json();
  const c = data.current;
  if (!c) throw new Error('No current weather data');
  const desc = describeWeatherCode(c.weather_code);
  return {
    temperature: Math.round(c.temperature_2m),
    humidity: Math.round(c.relative_humidity_2m),
    wind: `${Math.round(c.wind_speed_10m)} mph ${windDirName(c.wind_direction_10m)}`,
    conditions: desc.label,
    weatherCode: c.weather_code,
    location: 'Current location',
  };
}

// Fetch weather by city name. Returns same shape, or throws.
export async function fetchWeatherByLocation(name) {
  const geoResp = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`);
  if (!geoResp.ok) throw new Error('Location search failed');
  const geoData = await geoResp.json();
  const result = geoData.results?.[0];
  if (!result) throw new Error('Location not found');
  const weather = await fetchWeatherByCoords(result.latitude, result.longitude);
  return { ...weather, location: result.name + (result.admin1 ? ', ' + result.admin1 : '') };
}