// 照片上傳與管理 — 前端壓縮（長邊 1600px、目標 ≤ 350KB，PLAN.md §6）後傳 Supabase Storage
// photos.src_url 存公開網址：日後搬遷 R2 只改網址、不改程式
// 照片可選擇性關聯到住宿（住宿介紹照片；前臺跟隨該住宿的公開時機）
import { supabase, esc, toast } from './supabase-client.js';

const MAX_EDGE = 1600;
const TARGET_BYTES = 350 * 1024;

let tripId = null;
let editingId = null;

export function initPhotos() {
  document.getElementById('photo-form').addEventListener('submit', uploadPhotos);
  document.getElementById('photo-edit-form').addEventListener('submit', saveEdit);
  document.getElementById('photo-edit-cancel').addEventListener('click', cancelEdit);
  wireCheckin(document.getElementById('photo-form'));
  wireCheckin(document.getElementById('photo-edit-form'));
}

// ── GPS 打卡（旅途中隨手記美食/景點位置） ─────────────
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

export async function loadPhotos(trip) {
  tripId = trip.id;
  cancelEdit();
  await Promise.all([loadStayOptions(), loadList()]);
}

// 「關聯住宿」下拉（上傳表單與編輯表單共用選項）
async function loadStayOptions() {
  const { data } = await supabase
    .from('stays').select('id, name').eq('trip_id', tripId)
    .order('check_in', { nullsFirst: false });
  const options = '<option value="">（一般照片，不關聯）</option>'
    + (data ?? []).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  document.querySelectorAll('select[name="photo_stay"]').forEach(sel => sel.innerHTML = options);
}

async function loadList() {
  const listEl = document.getElementById('photo-list');
  const { data, error } = await supabase
    .from('photos')
    .select('*, stays(name)')
    .eq('trip_id', tripId)
    .order('taken_on', { nullsFirst: false })
    .order('sort_order');
  if (error) { toast('讀取照片失敗：' + error.message, true); return; }

  listEl.innerHTML = data.length
    ? data.map(p => `
      <figure class="photo-item" data-id="${p.id}">
        <img src="${esc(p.src_url)}" alt="${esc(p.caption ?? '')}" loading="lazy">
        <figcaption>
          <span>
            ${p.stays ? `<span class="badge">🏨 ${esc(p.stays.name)}</span> ` : ''}
            ${p.location_name || p.lat != null ? `<span class="badge">📍 ${esc(p.location_name ?? 'GPS')}</span> ` : ''}
            ${esc(p.taken_on ?? '')} ${esc(p.caption ?? '')}
          </span>
          <span class="photo-actions">
            <button data-action="edit">編輯</button>
            <button data-action="delete" class="danger">刪除</button>
          </span>
        </figcaption>
      </figure>`).join('')
    : '<p class="muted">尚無照片。</p>';

  listEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = data.find(x => x.id === btn.closest('.photo-item').dataset.id);
      if (btn.dataset.action === 'edit') startEdit(p);
      else deletePhoto(p);
    });
  });
}

// ── 上傳 ─────────────────────────────────────────────
async function compress(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  let quality = 0.85;
  let blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
  while (blob.size > TARGET_BYTES && quality > 0.45) {
    quality -= 0.08;
    blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
  }
  return blob;
}

async function uploadPhotos(e) {
  e.preventDefault();
  const f = e.target;
  const files = [...f.elements.files.files];
  if (!files.length) { toast('請先選擇照片', true); return; }
  const takenOn = f.elements.taken_on.value || null;
  const caption = f.elements.caption.value.trim() || null;
  const stayId = f.elements.photo_stay.value || null;
  const locationName = f.elements.location_name.value.trim() || null;
  const lat = f.elements.lat.value === '' ? null : Number(f.elements.lat.value);
  const lng = f.elements.lng.value === '' ? null : Number(f.elements.lng.value);
  const progressEl = document.getElementById('photo-progress');
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true;

  let done = 0;
  for (const file of files) {
    progressEl.textContent = `壓縮並上傳中… ${done + 1}/${files.length}`;
    try {
      const blob = await compress(file);
      const path = `${tripId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error: upError } = await supabase.storage.from('photos')
        .upload(path, blob, { contentType: 'image/jpeg' });
      if (upError) throw upError;

      const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(path);
      const { error: dbError } = await supabase.from('photos').insert({
        trip_id: tripId,
        taken_on: takenOn,
        src_url: publicUrl,
        storage_path: path,
        caption,
        stay_id: stayId,
        location_name: locationName,
        lat,
        lng,
        sort_order: done,
      });
      if (dbError) throw dbError;
      done++;
    } catch (err) {
      toast(`「${file.name}」上傳失敗：${err.message}`, true);
    }
  }

  progressEl.textContent = '';
  btn.disabled = false;
  toast(`完成：${done}/${files.length} 張已上傳`);
  f.reset();
  loadList();
}

// ── 編輯照片資訊（說明/日期/住宿關聯） ─────────────────
function startEdit(p) {
  editingId = p.id;
  const box = document.getElementById('photo-edit-box');
  const f = document.getElementById('photo-edit-form');
  box.hidden = false;
  document.getElementById('photo-edit-preview').src = p.src_url;
  f.elements.caption.value = p.caption ?? '';
  f.elements.taken_on.value = p.taken_on ?? '';
  f.elements.photo_stay.value = p.stay_id ?? '';
  f.elements.location_name.value = p.location_name ?? '';
  setCheckin(f, p.lat, p.lng);
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEdit() {
  editingId = null;
  document.getElementById('photo-edit-box').hidden = true;
  document.getElementById('photo-edit-form').reset();
}

async function saveEdit(e) {
  e.preventDefault();
  if (!editingId) return;
  const f = e.target;
  const { error } = await supabase.from('photos').update({
    caption: f.elements.caption.value.trim() || null,
    taken_on: f.elements.taken_on.value || null,
    stay_id: f.elements.photo_stay.value || null,
    location_name: f.elements.location_name.value.trim() || null,
    lat: f.elements.lat.value === '' ? null : Number(f.elements.lat.value),
    lng: f.elements.lng.value === '' ? null : Number(f.elements.lng.value),
  }).eq('id', editingId);
  if (error) { toast('儲存失敗：' + error.message, true); return; }
  toast('照片資訊已更新');
  cancelEdit();
  loadList();
}

async function deletePhoto(p) {
  if (!confirm('確定刪除這張照片？')) return;
  if (p.storage_path) {
    const { error } = await supabase.storage.from('photos').remove([p.storage_path]);
    if (error) { toast('刪除檔案失敗：' + error.message, true); return; }
  }
  const { error } = await supabase.from('photos').delete().eq('id', p.id);
  if (error) { toast('刪除紀錄失敗：' + error.message, true); return; }
  toast('已刪除');
  loadList();
}
