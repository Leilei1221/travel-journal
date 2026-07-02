// Trip 建立、編輯與選取
import { supabase, esc, toast } from './supabase-client.js';

const STATUS_LABEL = { planning: '規劃中', traveling: '旅途中', done: '已完成' };
let onSelectTrip = () => {};
let editingId = null;

export function initTrips(handler) {
  onSelectTrip = handler;
  const form = document.getElementById('trip-form');
  form.addEventListener('submit', saveTrip);
  document.getElementById('trip-form-reset').addEventListener('click', () => resetForm());
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
  f.scrollIntoView({ behavior: 'smooth' });
}

function resetForm() {
  editingId = null;
  document.getElementById('trip-form').reset();
  document.getElementById('trip-form-title').textContent = '新增旅程';
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
