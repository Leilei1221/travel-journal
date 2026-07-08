// 後臺頂部天氣卡 — Open-Meteo 免金鑰 API（geocoding + forecast）
// 優先用瀏覽器定位；被拒或不支援時顯示城市輸入框改用 geocoding API 查座標
const WEATHER_CODES = {
  0: '☀️ 晴朗', 1: '🌤️ 大致晴朗', 2: '⛅ 局部多雲', 3: '☁️ 陰天',
  45: '🌫️ 有霧', 48: '🌫️ 霧淞',
  51: '🌦️ 毛毛雨', 53: '🌦️ 毛毛雨', 55: '🌧️ 毛毛雨',
  56: '🌦️ 凍雨', 57: '🌧️ 凍雨',
  61: '🌧️ 小雨', 63: '🌧️ 中雨', 65: '🌧️ 大雨',
  66: '🌧️ 凍雨', 67: '🌧️ 凍雨',
  71: '🌨️ 小雪', 73: '🌨️ 中雪', 75: '❄️ 大雪', 77: '❄️ 雪粒',
  80: '🌦️ 陣雨', 81: '🌧️ 陣雨', 82: '⛈️ 強陣雨',
  85: '🌨️ 陣雪', 86: '❄️ 強陣雪',
  95: '⛈️ 雷雨', 96: '⛈️ 雷雨挾冰雹', 99: '⛈️ 強雷雨挾冰雹',
};

function describeCode(code) {
  return WEATHER_CODES[code] ?? `天氣代碼 ${code}`;
}

export function initWeather() {
  const card = document.getElementById('weather-card');
  if (!card) return;
  card.querySelector('#weather-city-form').addEventListener('submit', onCitySubmit);
  card.querySelector('#weather-retry-geo').addEventListener('click', tryGeolocate);
  tryGeolocate();
}

function setStatus(msg) {
  const el = document.getElementById('weather-status');
  if (el) el.textContent = msg;
}

function tryGeolocate() {
  document.getElementById('weather-city-form').hidden = true;
  document.getElementById('weather-result').hidden = true;
  if (!navigator.geolocation) {
    setStatus('此裝置不支援定位，請手動輸入城市');
    document.getElementById('weather-city-form').hidden = false;
    return;
  }
  setStatus('定位中…');
  navigator.geolocation.getCurrentPosition(
    pos => fetchWeather(pos.coords.latitude, pos.coords.longitude),
    () => {
      setStatus('未取得定位權限，請手動輸入城市查詢');
      document.getElementById('weather-city-form').hidden = false;
    },
    { timeout: 10000 }
  );
}

async function onCitySubmit(e) {
  e.preventDefault();
  const city = new FormData(e.target).get('city')?.toString().trim();
  if (!city) return;
  setStatus('查詢城市中…');
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`);
    const data = await res.json();
    const hit = data.results?.[0];
    if (!hit) { setStatus(`找不到「${city}」，請換個名稱試試`); return; }
    await fetchWeather(hit.latitude, hit.longitude, hit.name);
  } catch (err) {
    setStatus('查詢失敗：' + err.message);
  }
}

// GPS 座標 → 地名（BigDataCloud 免金鑰 client 端反向地理編碼；失敗不擋天氣顯示）
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=zh-Hant`);
    if (!res.ok) return null;
    const d = await res.json();
    const city = d.city || d.locality || d.principalSubdivision;
    if (!city) return null;
    return d.countryName && d.countryName !== city ? `${city}，${d.countryName}` : city;
  } catch {
    return null;
  }
}

async function fetchWeather(lat, lng, placeName) {
  setStatus('讀取天氣中…');
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=3`;
    // 天氣與地名並行查詢；手動輸入城市已有名稱就不再反查
    const [res, resolvedName] = await Promise.all([
      fetch(url),
      placeName ? Promise.resolve(placeName) : reverseGeocode(lat, lng),
    ]);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderWeather(data, resolvedName ?? `${Number(lat).toFixed(2)}, ${Number(lng).toFixed(2)}`);
    setStatus('');
  } catch (err) {
    setStatus('讀取天氣失敗：' + err.message);
  }
}

const escText = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

function renderWeather(data, placeName) {
  const resultEl = document.getElementById('weather-result');
  const cur = data.current;
  const daily = data.daily;
  const days = daily.time.map((date, i) => `
    <div class="weather-day">
      <span class="weather-day-label">${i === 0 ? '今天' : new Date(date).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}</span>
      <span>${describeCode(daily.weather_code[i])}</span>
      <span class="weather-range">${Math.round(daily.temperature_2m_min[i])}° / ${Math.round(daily.temperature_2m_max[i])}°</span>
    </div>`).join('');

  resultEl.innerHTML = `
    <div class="weather-now">
      <span class="weather-now-temp">${Math.round(cur.temperature_2m)}°C</span>
      <span>${describeCode(cur.weather_code)}</span>
      ${placeName ? `<span class="muted weather-place">📍 ${escText(placeName)}</span>` : ''}
    </div>
    <div class="weather-days">${days}</div>`;
  resultEl.hidden = false;
}
