// 住宿 CRUD — 公開欄位存 stays，訂單編號等私人欄位存 stay_private（RLS 僅本人）
// google_place_id / lat / lng 供 Phase 2 Google Places 整合使用，可留白
import { supabase, esc, toast } from './supabase-client.js';

let tripId = null;
let editingId = null;

export function initStays() {
  document.getElementById('stay-form').addEventListener('submit', saveStay);
  document.getElementById('stay-form-reset').addEventListener('click', resetForm);
}

export async function loadStays(trip) {
  tripId = trip.id;
  resetForm();
  const listEl = document.getElementById('stay-list');
  const { data, error } = await supabase
    .from('stays')
    .select('*, stay_private(order_no, private_notes)')
    .eq('trip_id', tripId)
    .order('check_in', { nullsFirst: false }) // 預設依入住日排序，無日期者排最後
    .order('created_at');                     // 同日/無日期時以建立順序穩定排序
  if (error) { toast('讀取住宿失敗：' + error.message, true); return; }

  listEl.innerHTML = data.length
    ? data.map(s => `
      <div class="card" data-id="${s.id}">
        <div class="card-body">
          <strong>${esc(s.name)}</strong>
          <div class="muted">${esc(s.check_in ?? '?')} 入住 ～ ${esc(s.check_out ?? '?')} 退房</div>
          ${s.address ? `<div class="muted">${esc(s.address)}</div>` : ''}
          ${s.stay_private?.order_no ? `<div class="private-field">🔒 訂單編號：${esc(s.stay_private.order_no)}</div>` : ''}
        </div>
        <div class="card-actions">
          <a class="btn-link" href="${esc(mapsUrl(s))}" target="_blank" rel="noopener">🗺️ Google Maps</a>
          <button data-action="edit">編輯</button>
          <button data-action="delete" class="danger">刪除</button>
        </div>
      </div>`).join('')
    : '<p class="muted">尚無住宿。</p>';

  listEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = data.find(x => x.id === btn.closest('.card').dataset.id);
      if (btn.dataset.action === 'edit') fillForm(s);
      else deleteStay(s);
    });
  });
}

// Google Maps 通用連結：手機自動喚起 Maps App、電腦開網頁版
// 有 place_id 用 place_id 精準定位（query 為備援顯示）；否則用名稱＋地址搜尋
function mapsUrl(s) {
  return s.google_place_id
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.name)}&query_place_id=${encodeURIComponent(s.google_place_id)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([s.name, s.address].filter(Boolean).join(' '))}`;
}

function fillForm(s) {
  const f = document.getElementById('stay-form');
  editingId = s.id;
  f.elements.name.value = s.name;
  f.elements.address.value = s.address ?? '';
  f.elements.google_place_id.value = s.google_place_id ?? '';
  f.elements.check_in.value = s.check_in ?? '';
  f.elements.check_out.value = s.check_out ?? '';
  f.elements.notes.value = s.notes ?? '';
  f.elements.order_no.value = s.stay_private?.order_no ?? '';
  f.elements.private_notes.value = s.stay_private?.private_notes ?? '';
}

function resetForm() {
  editingId = null;
  document.getElementById('stay-form').reset();
}

async function saveStay(e) {
  e.preventDefault();
  const f = e.target;
  const row = {
    trip_id: tripId,
    name: f.elements.name.value.trim(),
    address: f.elements.address.value.trim() || null,
    google_place_id: f.elements.google_place_id.value.trim() || null,
    check_in: f.elements.check_in.value || null,
    check_out: f.elements.check_out.value || null,
    notes: f.elements.notes.value.trim() || null,
  };

  let stayId = editingId;
  if (editingId) {
    const { error } = await supabase.from('stays').update(row).eq('id', editingId);
    if (error) { toast('儲存失敗：' + error.message, true); return; }
  } else {
    const { data, error } = await supabase.from('stays').insert(row).select('id').single();
    if (error) { toast('儲存失敗：' + error.message, true); return; }
    stayId = data.id;
  }

  const priv = {
    stay_id: stayId,
    order_no: f.elements.order_no.value.trim() || null,
    private_notes: f.elements.private_notes.value.trim() || null,
  };
  const { error: privError } = await supabase.from('stay_private').upsert(priv);
  if (privError) { toast('私人欄位儲存失敗：' + privError.message, true); return; }

  toast('住宿已儲存');
  loadStays({ id: tripId });
}

async function deleteStay(s) {
  if (!confirm(`確定刪除「${s.name}」？`)) return;
  const { error } = await supabase.from('stays').delete().eq('id', s.id);
  if (error) { toast('刪除失敗：' + error.message, true); return; }
  toast('已刪除');
  loadStays({ id: tripId });
}
