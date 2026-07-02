// 照片上傳 — 前端壓縮（長邊 1600px、目標 ≤ 350KB，PLAN.md §6）後傳 Supabase Storage
// photos.src_url 存公開網址：日後搬遷 R2 只改網址、不改程式
import { supabase, esc, toast } from './supabase-client.js';

const MAX_EDGE = 1600;
const TARGET_BYTES = 350 * 1024;

let tripId = null;

export function initPhotos() {
  document.getElementById('photo-form').addEventListener('submit', uploadPhotos);
}

export async function loadPhotos(trip) {
  tripId = trip.id;
  const listEl = document.getElementById('photo-list');
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .eq('trip_id', tripId)
    .order('taken_on', { nullsFirst: false })
    .order('sort_order');
  if (error) { toast('讀取照片失敗：' + error.message, true); return; }

  listEl.innerHTML = data.length
    ? data.map(p => `
      <figure class="photo-item" data-id="${p.id}">
        <img src="${esc(p.src_url)}" alt="${esc(p.caption ?? '')}" loading="lazy">
        <figcaption>
          <span>${esc(p.taken_on ?? '')} ${esc(p.caption ?? '')}</span>
          <button data-action="delete" class="danger">刪除</button>
        </figcaption>
      </figure>`).join('')
    : '<p class="muted">尚無照片。</p>';

  listEl.querySelectorAll('button[data-action=delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = data.find(x => x.id === btn.closest('.photo-item').dataset.id);
      deletePhoto(p);
    });
  });
}

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
  loadPhotos({ id: tripId });
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
  loadPhotos({ id: tripId });
}
