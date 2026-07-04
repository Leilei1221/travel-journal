// Trip 建立、編輯與選取
import { supabase, esc, toast } from './supabase-client.js';
import { callGemini } from './ai.js';

const STATUS_LABEL = { planning: '規劃中', traveling: '旅途中', done: '已完成' };
let onSelectTrip = () => {};
let editingId = null;
let editingTrip = null;
let pendingBgDataUrl = null; // 生成後待套用的背景（人工確認才上傳）

export function initTrips(handler) {
  onSelectTrip = handler;
  const form = document.getElementById('trip-form');
  form.addEventListener('submit', saveTrip);
  document.getElementById('trip-form-reset').addEventListener('click', () => resetForm());
  document.getElementById('trip-bg-generate').addEventListener('click', generateBg);
  document.getElementById('trip-bg-apply').addEventListener('click', applyBg);
  document.getElementById('trip-bg-clear').addEventListener('click', clearBg);
}

// ── AI 專屬背景插畫（§7：依主題色生成，人工確認才套用）──
function resetBgBox() {
  pendingBgDataUrl = null;
  document.getElementById('trip-bg-box').hidden = !editingId;
  document.getElementById('trip-bg-preview').hidden = true;
  document.getElementById('trip-bg-apply').hidden = true;
  document.getElementById('trip-bg-clear').hidden = !editingTrip?.bg_image_url;
  document.getElementById('trip-bg-status').textContent =
    editingTrip?.bg_image_url ? '目前已有專屬背景' : '';
}

async function generateBg() {
  const f = document.getElementById('trip-form');
  const btn = document.getElementById('trip-bg-generate');
  const status = document.getElementById('trip-bg-status');
  btn.disabled = true;
  status.textContent = 'AI 繪製中…（約 20–40 秒）';
  try {
    const { image, mimeType } = await callGemini('background', {
      destination: f.elements.destination.value || f.elements.title.value,
      main: f.elements.theme_main.value,
      accent: f.elements.theme_accent.value,
      paper: f.elements.theme_paper.value,
    }, '');
    pendingBgDataUrl = `data:${mimeType};base64,${image}`;
    const preview = document.getElementById('trip-bg-preview');
    preview.src = pendingBgDataUrl;
    preview.hidden = false;
    document.getElementById('trip-bg-apply').hidden = false;
    status.textContent = '預覽如上——滿意按「套用」，不滿意可再生成';
  } catch (err) {
    status.textContent = '';
    toast('背景生成失敗：' + err.message, true);
  } finally {
    btn.disabled = false;
  }
}

async function applyBg() {
  if (!pendingBgDataUrl || !editingId) return;
  const status = document.getElementById('trip-bg-status');
  status.textContent = '壓縮並上傳中…';
  try {
    // dataURL → canvas → webp（目標 ≤ 400KB）
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = pendingBgDataUrl; });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    let quality = 0.85;
    let blob = await new Promise(r => canvas.toBlob(r, 'image/webp', quality));
    while (blob.size > 400 * 1024 && quality > 0.4) {
      quality -= 0.1;
      blob = await new Promise(r => canvas.toBlob(r, 'image/webp', quality));
    }
    const path = `backgrounds/${editingId}.webp`;
    const { error: upError } = await supabase.storage.from('photos')
      .upload(path, blob, { contentType: 'image/webp', upsert: true });
    if (upError) throw upError;
    const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(path);
    const url = `${publicUrl}?t=${Date.now()}`; // 蓋圖後立即換新，不吃舊快取
    const { error } = await supabase.from('trips').update({ bg_image_url: url }).eq('id', editingId);
    if (error) throw error;
    editingTrip.bg_image_url = url;
    resetBgBox();
    toast('專屬背景已套用，前臺內頁生效');
  } catch (err) {
    status.textContent = '';
    toast('套用失敗：' + err.message, true);
  }
}

async function clearBg() {
  if (!editingId) return;
  const { error } = await supabase.from('trips').update({ bg_image_url: null }).eq('id', editingId);
  if (error) { toast('清除失敗：' + error.message, true); return; }
  await supabase.storage.from('photos').remove([`backgrounds/${editingId}.webp`]);
  editingTrip.bg_image_url = null;
  resetBgBox();
  toast('已改回預設背景');
}

export async function loadTrips(selectedId = null) {
  const listEl = document.getElementById('trip-list');
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .order('start_date', { ascending: false, nullsFirst: false });
  if (error) { toast('讀取旅程失敗：' + error.message, true); return; }

  listEl.innerHTML = data.length
    ? data.map(t => `
      <div class="card trip-card ${t.id === selectedId ? 'selected' : ''}" data-id="${t.id}">
        <div class="card-body">
          <strong>${esc(t.title)}</strong>
          <span class="badge badge-${esc(t.status)}">${STATUS_LABEL[t.status] ?? esc(t.status)}</span>
          ${t.is_public ? '<span class="badge badge-public">公開</span>' : ''}
          <div class="muted">${esc(t.destination ?? '')}　${esc(t.start_date ?? '?')} ～ ${esc(t.end_date ?? '?')}</div>
        </div>
        <div class="card-actions">
          <a class="btn-link" href="../book.html?id=${t.id}" target="_blank" rel="noopener">📖 小書</a>
          <button data-action="select">選取</button>
          <button data-action="edit">編輯</button>
        </div>
      </div>`).join('')
    : '<p class="muted">還沒有旅程，先在下方建立一個吧。</p>';

  listEl.querySelectorAll('.trip-card button').forEach(btn => {
    btn.addEventListener('click', () => {
      const trip = data.find(t => t.id === btn.closest('.trip-card').dataset.id);
      if (btn.dataset.action === 'select') onSelectTrip(trip);
      else fillForm(trip);
    });
  });
}

function fillForm(trip) {
  const f = document.getElementById('trip-form');
  editingId = trip.id;
  editingTrip = trip;
  f.elements.title.value = trip.title;
  f.elements.destination.value = trip.destination ?? '';
  f.elements.start_date.value = trip.start_date ?? '';
  f.elements.end_date.value = trip.end_date ?? '';
  f.elements.status.value = trip.status;
  f.elements.is_public.checked = trip.is_public;
  f.elements.cover_photo_url.value = trip.cover_photo_url ?? '';
  f.elements.theme_main.value = trip.theme?.['--main'] ?? '#7a9e9f';
  f.elements.theme_accent.value = trip.theme?.['--accent'] ?? '#e07a5f';
  f.elements.theme_paper.value = trip.theme?.['--paper'] ?? '#faf6ee';
  document.getElementById('trip-form-title').textContent = '編輯旅程：' + trip.title;
  resetBgBox();
  f.scrollIntoView({ behavior: 'smooth' });
}

function resetForm() {
  editingId = null;
  editingTrip = null;
  document.getElementById('trip-form').reset();
  document.getElementById('trip-form-title').textContent = '新增旅程';
  resetBgBox();
}

async function saveTrip(e) {
  e.preventDefault();
  const f = e.target;
  const row = {
    title: f.elements.title.value.trim(),
    destination: f.elements.destination.value.trim() || null,
    start_date: f.elements.start_date.value || null,
    end_date: f.elements.end_date.value || null,
    status: f.elements.status.value,
    is_public: f.elements.is_public.checked,
    cover_photo_url: f.elements.cover_photo_url.value.trim() || null,
    theme: {
      '--main': f.elements.theme_main.value,
      '--accent': f.elements.theme_accent.value,
      '--paper': f.elements.theme_paper.value, // §7 底色約束：維持淺色米白系
    },
  };
  const q = editingId
    ? supabase.from('trips').update(row).eq('id', editingId)
    : supabase.from('trips').insert(row);
  const { error } = await q;
  if (error) { toast('儲存失敗：' + error.message, true); return; }
  toast(editingId ? '旅程已更新' : '旅程已建立');
  resetForm();
  loadTrips();
}
