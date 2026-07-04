// 航班 CRUD — 公開欄位存 flights，訂位代號等私人欄位存 flight_private（RLS 僅本人）
import { supabase, esc, toast, isoToLocal, localToIso } from './supabase-client.js';

let tripId = null;
let editingId = null;

const TICKET_TYPES = ['一般', '四腿票', '境外票', '廉航', '里程票'];

// 前臺顯示狀態徽章（與住宿同邏輯，RLS 於資料庫層擋下未公開航班）
function visibilityBadge(fl) {
  if (fl.visibility === 'hidden') return '<span class="badge">🔒 永不公開</span>';
  if (fl.visibility === 'public') return '<span class="badge badge-public">前臺公開中</span>';
  const departed = fl.depart_time && new Date(fl.depart_time) < new Date();
  return departed
    ? '<span class="badge badge-public">已公開（已起飛）</span>'
    : '<span class="badge">🔒 起飛後公開</span>';
}

export function initFlights() {
  const form = document.getElementById('flight-form');
  form.addEventListener('submit', saveFlight);
  document.getElementById('flight-form-reset').addEventListener('click', resetForm);
  // 票種選「其他」時顯示手填欄
  form.elements.ticket_type_select.addEventListener('change', e => {
    form.elements.ticket_type_other.hidden = e.target.value !== '其他';
  });
}

export async function loadFlights(trip) {
  tripId = trip.id;
  resetForm();
  const listEl = document.getElementById('flight-list');
  const { data, error } = await supabase
    .from('flights')
    .select('*, flight_private(booking_ref, private_notes)')
    .eq('trip_id', tripId)
    .order('segment_order');
  if (error) { toast('讀取航班失敗：' + error.message, true); return; }

  const fmtTime = iso => iso ? isoToLocal(iso).replace('T', ' ') : '—';
  listEl.innerHTML = data.length
    ? data.map(fl => `
      <div class="card" data-id="${fl.id}">
        <div class="card-body">
          <strong>航段 ${fl.segment_order}：${esc(fl.airline ?? '')} ${esc(fl.flight_no ?? '')}</strong> ${visibilityBadge(fl)}
          ${fl.transfer_type ? `<span class="badge">${esc(fl.transfer_type)}</span>` : ''}
          ${fl.ticket_type ? `<span class="badge">${esc(fl.ticket_type)}</span>` : ''}
          <div>${esc(fl.depart_airport ?? '?')} → ${esc(fl.arrive_airport ?? '?')}</div>
          <div class="muted">起飛 ${fmtTime(fl.depart_time)}｜降落 ${fmtTime(fl.arrive_time)}</div>
          ${fl.layover_info ? `<div class="muted">轉機：${esc(fl.layover_info)}</div>` : ''}
          ${fl.flight_private?.booking_ref ? `<div class="private-field">🔒 訂位代號：${esc(fl.flight_private.booking_ref)}</div>` : ''}
        </div>
        <div class="card-actions">
          ${fl.flight_no ? `<a class="btn-link" target="_blank" rel="noopener"
            href="https://www.google.com/search?q=${encodeURIComponent(`${fl.airline ?? ''} ${fl.flight_no} 航班狀態`.trim())}">✈ 查航班狀態</a>` : ''}
          <button data-action="edit">編輯</button>
          <button data-action="delete" class="danger">刪除</button>
        </div>
      </div>`).join('')
    : '<p class="muted">尚無航班。</p>';

  listEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const fl = data.find(x => x.id === btn.closest('.card').dataset.id);
      if (btn.dataset.action === 'edit') fillForm(fl);
      else deleteFlight(fl);
    });
  });
}

function fillForm(fl) {
  const f = document.getElementById('flight-form');
  editingId = fl.id;
  f.elements.segment_order.value = fl.segment_order;
  f.elements.airline.value = fl.airline ?? '';
  f.elements.flight_no.value = fl.flight_no ?? '';
  f.elements.depart_airport.value = fl.depart_airport ?? '';
  f.elements.arrive_airport.value = fl.arrive_airport ?? '';
  f.elements.depart_time.value = isoToLocal(fl.depart_time);
  f.elements.arrive_time.value = isoToLocal(fl.arrive_time);
  f.elements.layover_info.value = fl.layover_info ?? '';
  f.elements.visibility.value = fl.visibility ?? 'after_departure';
  f.elements.transfer_type.value = fl.transfer_type ?? '';
  // 票種：在預設清單內直接選取；否則視為「其他」帶入手填欄
  const isPreset = !fl.ticket_type || TICKET_TYPES.includes(fl.ticket_type);
  f.elements.ticket_type_select.value = isPreset ? (fl.ticket_type ?? '') : '其他';
  f.elements.ticket_type_other.hidden = isPreset;
  f.elements.ticket_type_other.value = isPreset ? '' : fl.ticket_type;
  f.elements.notes.value = fl.notes ?? '';
  f.elements.booking_ref.value = fl.flight_private?.booking_ref ?? '';
  f.elements.private_notes.value = fl.flight_private?.private_notes ?? '';
}

function resetForm() {
  editingId = null;
  const f = document.getElementById('flight-form');
  f.reset();
  f.elements.ticket_type_other.hidden = true;
}

async function saveFlight(e) {
  e.preventDefault();
  const f = e.target;
  const row = {
    trip_id: tripId,
    segment_order: Number(f.elements.segment_order.value) || 1,
    airline: f.elements.airline.value.trim() || null,
    flight_no: f.elements.flight_no.value.trim() || null,
    depart_airport: f.elements.depart_airport.value.trim() || null,
    arrive_airport: f.elements.arrive_airport.value.trim() || null,
    depart_time: localToIso(f.elements.depart_time.value),
    arrive_time: localToIso(f.elements.arrive_time.value),
    layover_info: f.elements.layover_info.value.trim() || null,
    visibility: f.elements.visibility.value,
    transfer_type: f.elements.transfer_type.value || null,
    ticket_type: f.elements.ticket_type_select.value === '其他'
      ? (f.elements.ticket_type_other.value.trim() || '其他')
      : (f.elements.ticket_type_select.value || null),
    notes: f.elements.notes.value.trim() || null,
  };

  let flightId = editingId;
  if (editingId) {
    const { error } = await supabase.from('flights').update(row).eq('id', editingId);
    if (error) { toast('儲存失敗：' + error.message, true); return; }
  } else {
    const { data, error } = await supabase.from('flights').insert(row).select('id').single();
    if (error) { toast('儲存失敗：' + error.message, true); return; }
    flightId = data.id;
  }

  // 私人欄位另存 flight_private（前臺查詢永不撈取）
  const priv = {
    flight_id: flightId,
    booking_ref: f.elements.booking_ref.value.trim() || null,
    private_notes: f.elements.private_notes.value.trim() || null,
  };
  const { error: privError } = await supabase.from('flight_private').upsert(priv);
  if (privError) { toast('私人欄位儲存失敗：' + privError.message, true); return; }

  toast('航班已儲存');
  loadFlights({ id: tripId });
}

async function deleteFlight(fl) {
  if (!confirm(`確定刪除航段 ${fl.segment_order}（${fl.airline ?? ''} ${fl.flight_no ?? ''}）？`)) return;
  const { error } = await supabase.from('flights').delete().eq('id', fl.id); // flight_private 隨 CASCADE 刪除
  if (error) { toast('刪除失敗：' + error.message, true); return; }
  toast('已刪除');
  loadFlights({ id: tripId });
}
