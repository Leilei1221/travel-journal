// 每日時間軸組裝（後臺與前臺共用）
// 航班/住宿/景點皆即時讀原表，依日期落到各天，不複製存檔（單一真相來源）

// timestamptz → 瀏覽器本地時區的 YYYY-MM-DD（與全站顯示時間的時區一致）
export function localDateStr(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const pad = x => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 由 YYYY-MM-DD 取得 M/D 與星期
export function dayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return { md: `${d.getMonth() + 1}/${d.getDate()}`, week: `週${week}` };
}

function timeMin(label) {
  const m = /(\d{1,2}):(\d{2})/.exec(label ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : 24 * 60 + 1; // 無時間排當天最後
}

// 回傳每天的組裝結果：[{ index, date, flights, stays, items }]，或 null（旅程缺起訖日）
export function buildDailyTimeline(trip, flights = [], stays = [], items = []) {
  if (!trip.start_date || !trip.end_date) return null;
  const days = [];
  let d = trip.start_date;
  let idx = 1;
  while (d <= trip.end_date && idx <= 90) {
    days.push({ index: idx, date: d, flights: [], stays: [], items: [] });
    d = addDays(d, 1);
    idx++;
  }
  const byDate = new Map(days.map(day => [day.date, day]));
  const put = (dateStr, kind, obj) => { const day = byDate.get(dateStr); if (day) day[kind].push(obj); };
  for (const f of flights) put(localDateStr(f.depart_time), 'flights', f);
  for (const s of stays) put(s.check_in, 'stays', s);
  for (const it of items) put(it.item_date, 'items', it);
  for (const day of days) {
    day.flights.sort((a, b) => new Date(a.depart_time) - new Date(b.depart_time));
    day.items.sort((a, b) => (timeMin(a.time_label) - timeMin(b.time_label)) || (a.sort_order - b.sort_order));
  }
  return days;
}

// 景點的大眾運輸「前往下一站」路線連結
export function routeUrl(from, to) {
  const point = p => p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : encodeURIComponent(p.place_name);
  return `https://www.google.com/maps/dir/?api=1&origin=${point(from)}&destination=${point(to)}&travelmode=transit`;
}

// 景點單點地圖連結
export function itemMapsUrl(item) {
  const base = 'https://www.google.com/maps/search/?api=1';
  if (item.google_place_id) return `${base}&query=${encodeURIComponent(item.place_name)}&query_place_id=${encodeURIComponent(item.google_place_id)}`;
  if (item.lat != null && item.lng != null) return `${base}&query=${item.lat},${item.lng}`;
  return `${base}&query=${encodeURIComponent(item.place_name)}`;
}
