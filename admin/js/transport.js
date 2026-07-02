// 交通卡片 CRUD — 接送/租機車/火車/渡輪等，前臺以醒目資訊框呈現（PLAN.md §3）
import { supabase, esc, toast } from './supabase-client.js';

let tripId = null;
let editingId = null;

export function initTransport() {
  document.getElementById('transport-form').addEventListener('submit', saveCard);
  document.getElementById('transport-form-reset').addEventListener('click', resetForm);
}

export async function loadTransport(trip) {
  tripId = trip.id;
  resetForm();
  const listEl = document.getElementById('transport-list');
  const { data, error } = await supabase
    .from('transport_cards')
    .select('*')
    .eq('trip_id', tripId)
    .order('sort_order');
  if (error) { toast('讀取交通卡片失敗：' + error.message, true); return; }

  listEl.innerHTML = data.length
    ? data.map(c => `
      <div class="card" data-id="${c.id}">
        <div class="card-body">
          <span class="badge">${esc(c.card_type)}</span> <strong>${esc(c.title)}</strong>
          ${c.content ? `<div>${esc(c.content)}</div>` : ''}
          ${c.cost_note ? `<div class="muted">💰 ${esc(c.cost_note)}</div>` : ''}
        </div>
        <div class="card-actions">
          <button data-action="edit">編輯</button>
          <button data-action="delete" class="danger">刪除</button>
        </div>
      </div>`).join('')
    : '<p class="muted">尚無交通卡片。</p>';

  listEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = data.find(x => x.id === btn.closest('.card').dataset.id);
      if (btn.dataset.action === 'edit') fillForm(c);
      else deleteCard(c);
    });
  });
}

function fillForm(c) {
  const f = document.getElementById('transport-form');
  editingId = c.id;
  f.elements.card_type.value = c.card_type;
  f.elements.title.value = c.title;
  f.elements.content.value = c.content ?? '';
  f.elements.cost_note.value = c.cost_note ?? '';
  f.elements.sort_order.value = c.sort_order;
}

function resetForm() {
  editingId = null;
  document.getElementById('transport-form').reset();
}

async function saveCard(e) {
  e.preventDefault();
  const f = e.target;
  const row = {
    trip_id: tripId,
    card_type: f.elements.card_type.value,
    title: f.elements.title.value.trim(),
    content: f.elements.content.value.trim() || null,
    cost_note: f.elements.cost_note.value.trim() || null,
    sort_order: Number(f.elements.sort_order.value) || 0,
  };
  const q = editingId
    ? supabase.from('transport_cards').update(row).eq('id', editingId)
    : supabase.from('transport_cards').insert(row);
  const { error } = await q;
  if (error) { toast('儲存失敗：' + error.message, true); return; }
  toast('交通卡片已儲存');
  loadTransport({ id: tripId });
}

async function deleteCard(c) {
  if (!confirm(`確定刪除「${c.title}」？`)) return;
  const { error } = await supabase.from('transport_cards').delete().eq('id', c.id);
  if (error) { toast('刪除失敗：' + error.message, true); return; }
  toast('已刪除');
  loadTransport({ id: tripId });
}
