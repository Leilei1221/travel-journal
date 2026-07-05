// 行程規劃（務實版）— 每日時間線景點/活動；相鄰兩點提供 Google Maps 大眾運輸路線連結
import { supabase, esc, toast } from './supabase-client.js?v=7';

let tripId = null;
let editingId = null;

export function initItinerary() {
  document.getElementById('itinerary-form').addEventListener('submit', saveItem);
  document.getElementById('itinerary-form-reset').addEventListener('click', resetForm);
  wireCheckin(document.getElementById('itinerary-form'));
}

// ── GPS 打卡（沿用照片頁籤的做法） ─────────────────────────
function setCheckin(form, lat, lng) {
  form.elements.lat.value = lat ?? '';
  form.elements.lng.value = lng ?? '';
  const has = lat != null && lat !== '';
  form.querySelector('.checkin-status').textContent = has
    ? `已定位（${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}）`
    : '未定位';
  form.querySelector('.checkin-clear').hidden = !has;
}

function wireCheckin(form) {
  form.querySelector('.checkin-btn').addEventListener('click', () => {
    const status = form.querySelector('.checkin-status');
    if (!navigator.geolocation) { status.textContent = '此裝置不支援定位'; return; }
    status.textContent = '定位中…';
    navigator.geolocation.getCurrentPosition(
      pos => setCheckin(form, pos.coords.latitude, pos.coords.longitude),
      err => { status.textContent = '定位失敗：' + (err.code === 1 ? '未授權定位權限' : err.message); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
  form.querySelector('.checkin-clear').addEventListener('click', () => setCheckin(form, null, null));
}

function itemMapsQuery(item) {
  return item.google_place_id
    ? `&query_place_id=${encodeURIComponent(item.google_place_id)}&query=${encodeURIComponent(item.place_name)}`
    : item.lat != null && item.lng != null
    ? `&query=${item.lat},${item.lng}`
    : `&query=${encodeURIComponent(item.place_name)}`;
}

function routeUrl(from, to) {
  const point = p => p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : encodeURIComponent(p.place_name);
  return `https://www.google.com/maps/dir/?api=1&origin=${point(from)}&destination=${point(to)}&travelmode=transit`;
}

export async function loadItinerary(trip) {
  tripId = trip.id;
  resetForm();
  const listEl = document.getElementById('itinerary-list');
  const { data, error } = await supabase
    .from('itinerary_items')
    .select('*')
    .eq('trip_id', tripId)
    .order('item_date', { nullsFirst: false })
    .order('sort_order');
  if (error) { toast('讀取行程失敗：' + error.message, true); return; }

  if (!data.length) { listEl.innerHTML = '<p class="muted">尚無行程項目。</p>'; return; }

  // 依日期分組，組內相鄰兩點才給路線連結
  const groups = new Map();
  for (const it of data) {
    const key = it.item_date || '未定日期';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }

  listEl.innerHTML = [...groups.entries()].map(([date, items]) => `
    <div class="itinerary-day-group">
      <h3 class="itinerary-day-label">${esc(date)}</h3>
      ${items.map((it, i) => `
        <div class="card" data-id="${it.id}">
          <div class="card-body">
            ${it.time_label ? `<span class="badge">${esc(it.time_label)}</span>` : ''}
            <strong>${esc(it.place_name)}</strong>
            ${it.notes ? `<div class="muted">${esc(it.notes)}</div>` : ''}
            ${i < items.length - 1 ? `<a class="btn-link" href="${routeUrl(it, items[i + 1])}" target="_blank" rel="noopener">🚇 前往下一站路線</a>` : ''}
          </div>
          <div class="card-actions">
            <a class="btn-link" href="https://www.google.com/maps/search/?api=1${itemMapsQuery(it)}" target="_blank" rel="noopener">📍 地圖</a>
            <button data-action="edit">編輯</button>
            <button data-action="delete" class="danger">刪除</button>
          </div>
        </div>`).join('')}
    </div>`).join('');

  listEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.closest('.card').dataset.id;
      const it = data.find(x => x.id === id);
      if (btn.dataset.action === 'edit') fillForm(it);
      else deleteItem(it);
    });
  });
}

function fillForm(it) {
  const f = document.getElementById('itinerary-form');
  editingId = it.id;
  f.elements.item_date.value = it.item_date ?? '';
  f.elements.time_label.value = it.time_label ?? '';
  f.elements.place_name.value = it.place_name;
  f.elements.notes.value = it.notes ?? '';
  f.elements.google_place_id.value = it.google_place_id ?? '';
  f.elements.sort_order.value = it.sort_order;
  setCheckin(f, it.lat, it.lng);
}

function resetForm() {
  editingId = null;
  const f = document.getElementById('itinerary-form');
  f.reset();
  setCheckin(f, null, null);
}

async function saveItem(e) {
  e.preventDefault();
  const f = e.target;
  const row = {
    trip_id: tripId,
    item_date: f.elements.item_date.value || null,
    time_label: f.elements.time_label.value.trim() || null,
    place_name: f.elements.place_name.value.trim(),
    notes: f.elements.notes.value.trim() || null,
    google_place_id: f.elements.google_place_id.value.trim() || null,
    lat: f.elements.lat.value === '' ? null : Number(f.elements.lat.value),
    lng: f.elements.lng.value === '' ? null : Number(f.elements.lng.value),
    sort_order: Number(f.elements.sort_order.value) || 0,
  };
  const q = editingId
    ? supabase.from('itinerary_items').update(row).eq('id', editingId)
    : supabase.from('itinerary_items').insert(row);
  const { error } = await q;
  if (error) { toast('儲存失敗：' + error.message, true); return; }
  toast('行程項目已儲存');
  resetForm();
  loadItinerary({ id: tripId });
}

async function deleteItem(it) {
  if (!confirm(`確定刪除「${it.place_name}」？`)) return;
  const { error } = await supabase.from('itinerary_items').delete().eq('id', it.id);
  if (error) { toast('刪除失敗：' + error.message, true); return; }
  toast('已刪除');
  loadItinerary({ id: tripId });
}
