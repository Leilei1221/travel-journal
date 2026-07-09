// 行程規劃（每日時間軸）— 依旅程起訖日拆天；航班/住宿即時讀原表落位、不複製；
// 使用者只加景點，自動歸屬所選那一天；相鄰景點提供大眾運輸路線連結
import { supabase, esc, toast, isoToLocal } from './supabase-client.js?v=13';
import { buildDailyTimeline, dayLabel, routeUrl, itemMapsUrl } from '../../assets/js/day-timeline.js?v=13';

let trip = null;
let editingId = null;

export function initItinerary() {
  document.getElementById('itinerary-form').addEventListener('submit', saveItem);
  document.getElementById('itinerary-form-reset').addEventListener('click', resetForm);
  wireCheckin(document.getElementById('itinerary-form'));
}

// ── GPS 打卡 ───────────────────────────────────────────
function setCheckin(form, lat, lng) {
  form.elements.lat.value = lat ?? '';
  form.elements.lng.value = lng ?? '';
  const has = lat != null && lat !== '';
  form.querySelector('.checkin-status').textContent = has
    ? `已定位（${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}）` : '未定位';
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
      { enableHighAccuracy: true, timeout: 10000 });
  });
  form.querySelector('.checkin-clear').addEventListener('click', () => setCheckin(form, null, null));
}

const fmtFlightTime = iso => iso ? isoToLocal(iso).slice(5).replace('T', ' ') : '';

export async function loadItinerary(t) {
  trip = t;
  resetForm();
  const listEl = document.getElementById('itinerary-list');
  const daySel = document.getElementById('itinerary-form').elements.day_date;

  if (!trip.start_date || !trip.end_date) {
    listEl.innerHTML = '<p class="muted">請先在「旅程」頁籤填好這趟的開始與結束日期，才能用每日行程模式。</p>';
    daySel.innerHTML = '<option value="">（缺旅程日期）</option>';
    return;
  }

  const [flights, stays, items] = await Promise.all([
    supabase.from('flights').select('airline, flight_no, depart_airport, arrive_airport, depart_time, arrive_time').eq('trip_id', trip.id),
    supabase.from('stays').select('name, check_in, check_out').eq('trip_id', trip.id),
    supabase.from('itinerary_items').select('*').eq('trip_id', trip.id),
  ]);
  const days = buildDailyTimeline(trip, flights.data, stays.data, items.data);

  // 新增表單的「第 N 天」下拉
  daySel.innerHTML = days.map(d => {
    const { md, week } = dayLabel(d.date);
    return `<option value="${d.date}">第 ${d.index} 天（${md} ${week}）</option>`;
  }).join('');

  listEl.innerHTML = days.map(d => {
    const { md, week } = dayLabel(d.date);
    const autoRows = [
      ...d.flights.map(f => `<div class="auto-row">✈ <strong>${esc(f.airline ?? '')} ${esc(f.flight_no ?? '')}</strong>
        <span class="muted">${esc(f.depart_airport ?? '')}→${esc(f.arrive_airport ?? '')}${f.depart_time ? `｜${esc(fmtFlightTime(f.depart_time))} 起飛` : ''}</span>
        <span class="auto-badge">自動</span></div>`),
      ...d.stays.map(s => `<div class="auto-row">🏠 <strong>${esc(s.name)}</strong>
        <span class="muted">入住 ${esc(s.check_in)} ～ 退房 ${esc(s.check_out ?? '?')}</span>
        <span class="auto-badge">自動</span></div>`),
    ].join('');

    const itemRows = d.items.map((it, i) => `
      <div class="card" data-id="${it.id}">
        <div class="card-body">
          ${it.time_label ? `<span class="badge">${esc(it.time_label)}</span>` : ''}
          <strong>${esc(it.place_name)}</strong>
          ${it.notes ? `<div class="muted">${esc(it.notes)}</div>` : ''}
          ${i < d.items.length - 1 ? `<a class="btn-link" href="${routeUrl(it, d.items[i + 1])}" target="_blank" rel="noopener">🚇 前往下一站路線</a>` : ''}
        </div>
        <div class="card-actions">
          <a class="btn-link" href="${itemMapsUrl(it)}" target="_blank" rel="noopener">📍 地圖</a>
          <button data-action="edit">編輯</button>
          <button data-action="delete" class="danger">刪除</button>
        </div>
      </div>`).join('');

    return `<section class="day-block">
      <h3 class="day-head">第 ${d.index} 天 <span class="muted">${md} ${week}</span></h3>
      ${autoRows}
      ${itemRows || (autoRows ? '' : '<p class="muted day-empty">這天還沒有景點，用下方表單選「第 ' + d.index + ' 天」加入。</p>')}
    </section>`;
  }).join('');

  listEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const it = items.data.find(x => x.id === btn.closest('.card').dataset.id);
      if (btn.dataset.action === 'edit') fillForm(it);
      else deleteItem(it);
    });
  });
}

function fillForm(it) {
  const f = document.getElementById('itinerary-form');
  editingId = it.id;
  if ([...f.elements.day_date.options].some(o => o.value === it.item_date)) f.elements.day_date.value = it.item_date;
  f.elements.time_label.value = it.time_label ?? '';
  f.elements.place_name.value = it.place_name;
  f.elements.notes.value = it.notes ?? '';
  f.elements.google_place_id.value = it.google_place_id ?? '';
  f.elements.sort_order.value = it.sort_order;
  setCheckin(f, it.lat, it.lng);
  f.scrollIntoView({ behavior: 'smooth' });
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
  if (!f.elements.day_date.value) { toast('請先選擇第幾天', true); return; }
  const row = {
    trip_id: trip.id,
    item_date: f.elements.day_date.value, // 由「第 N 天」下拉自動帶入日期
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
  loadItinerary(trip);
}

async function deleteItem(it) {
  if (!confirm(`確定刪除「${it.place_name}」？`)) return;
  const { error } = await supabase.from('itinerary_items').delete().eq('id', it.id);
  if (error) { toast('刪除失敗：' + error.message, true); return; }
  toast('已刪除');
  loadItinerary(trip);
}
