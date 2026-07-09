// 記帳 CRUD — expenses 表 RLS 僅本人可讀寫，前臺永不撈取
// 可選擇性關聯到目前旅程的某筆住宿/航班/交通卡片（擇一）
import { supabase, SUPABASE_URL, SUPABASE_KEY, esc, toast } from './supabase-client.js?v=12';
import { setAiStatus } from './ai.js?v=12';

const RECEIPT_MAX_EDGE = 1200;

let tripId = null;
let editingId = null;

export function initExpenses() {
  document.getElementById('expense-form').addEventListener('submit', saveExpense);
  document.getElementById('expense-form-reset').addEventListener('click', resetForm);
  document.getElementById('receipt-input').addEventListener('change', onReceiptSelected);
}

// ── 拍收據辨識：壓縮成 1200px → base64 → gemini-draft(mode:receipt) → 預填表單 ──
async function compressToBase64(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, RECEIPT_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  return dataUrl.split(',')[1]; // 去掉 data:image/jpeg;base64, 前綴
}

async function onReceiptSelected(e) {
  const file = e.target.files[0];
  const statusEl = document.getElementById('receipt-status');
  if (!file) return;
  setAiStatus(statusEl, '壓縮並辨識中…（約 10–20 秒）');
  try {
    const image = await compressToBase64(file);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('請先登入');
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gemini-draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_KEY,
      },
      body: JSON.stringify({ mode: 'receipt', image, mimeType: 'image/jpeg' }),
    });
    const parsed = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parsed.error ?? `HTTP ${res.status}`);
    fillFromReceipt(parsed);
    setAiStatus(statusEl, '✓ 已預填下方表單，請確認金額/品項後再儲存', 'ok');
  } catch (err) {
    setAiStatus(statusEl, '⚠ 辨識失敗：' + err.message, 'error');
  } finally {
    e.target.value = '';
  }
}

function fillFromReceipt(r) {
  const f = document.getElementById('expense-form');
  editingId = null;
  const items = Array.isArray(r.items) ? r.items : [];
  f.elements.title.value = r.note || items[0]?.name || '收據';
  if (r.total != null) f.elements.amount.value = r.total;
  if (r.currency) f.elements.currency.value = String(r.currency).toUpperCase();
  if (r.date) f.elements.spent_on.value = r.date;
  const itemLines = items.map(it => `${it.name ?? ''} ${it.price ?? ''}`.trim()).join('、');
  f.elements.note.value = [r.note, itemLines].filter(Boolean).join('｜');
  f.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export async function loadExpenses(trip) {
  tripId = trip.id;
  resetForm();
  await Promise.all([loadLinkOptions(), loadList()]);
}

// 「關聯到」下拉：載入目前旅程的住宿/航班/交通卡片
async function loadLinkOptions() {
  const sel = document.getElementById('expense-link');
  const [stays, flights, cards] = await Promise.all([
    supabase.from('stays').select('id, name').eq('trip_id', tripId).order('check_in', { nullsFirst: false }),
    supabase.from('flights').select('id, airline, flight_no, segment_order').eq('trip_id', tripId).order('segment_order'),
    supabase.from('transport_cards').select('id, title').eq('trip_id', tripId).order('sort_order'),
  ]);
  const group = (label, rows, kind, text) => rows?.length
    ? `<optgroup label="${label}">${rows.map(r => `<option value="${kind}:${r.id}">${esc(text(r))}</option>`).join('')}</optgroup>`
    : '';
  sel.innerHTML = '<option value="">（不關聯）</option>'
    + group('住宿', stays.data, 'stay', r => r.name)
    + group('航班', flights.data, 'flight', r => `航段${r.segment_order} ${r.airline ?? ''} ${r.flight_no ?? ''}`)
    + group('交通卡片', cards.data, 'card', r => r.title);
}

async function loadList() {
  const listEl = document.getElementById('expense-list');
  const { data, error } = await supabase
    .from('expenses')
    .select('*, stays(name), flights(airline, flight_no, segment_order), transport_cards(title)')
    .eq('trip_id', tripId)
    .order('spent_on', { nullsFirst: false })
    .order('created_at');
  if (error) { toast('讀取記帳失敗：' + error.message, true); return; }

  const linkedLabel = x =>
    x.stays ? `🏨 ${x.stays.name}`
    : x.flights ? `✈️ 航段${x.flights.segment_order} ${x.flights.airline ?? ''} ${x.flights.flight_no ?? ''}`
    : x.transport_cards ? `🚕 ${x.transport_cards.title}`
    : null;

  listEl.innerHTML = data.length
    ? data.map(x => `
      <div class="card" data-id="${x.id}">
        <div class="card-body">
          <span class="badge">${esc(x.category)}</span> <strong>${esc(x.title)}</strong>
          <span>${esc(x.currency)} ${Number(x.amount).toLocaleString()}</span>
          ${x.amount_twd != null ? `<span class="muted">≈ NT$ ${Number(x.amount_twd).toLocaleString()}</span>` : ''}
          <div class="muted">
            ${esc(x.spent_on ?? '')}
            ${x.payment_method ? `｜${esc(x.payment_method)}` : ''}
            ${linkedLabel(x) ? `｜${esc(linkedLabel(x))}` : ''}
            ${x.note ? `｜${esc(x.note)}` : ''}
          </div>
        </div>
        <div class="card-actions">
          <button data-action="edit">編輯</button>
          <button data-action="delete" class="danger">刪除</button>
        </div>
      </div>`).join('')
    : '<p class="muted">尚無記帳。</p>';

  // 小計：各幣別合計＋臺幣約當總計
  const byCurrency = {};
  let twdTotal = 0, twdMissing = 0;
  for (const x of data) {
    byCurrency[x.currency] = (byCurrency[x.currency] ?? 0) + Number(x.amount);
    if (x.amount_twd != null) twdTotal += Number(x.amount_twd);
    else twdMissing++;
  }
  document.getElementById('expense-summary').innerHTML = data.length
    ? `各幣別小計：${Object.entries(byCurrency).map(([c, v]) => `${esc(c)} ${v.toLocaleString()}`).join('｜')}
       <br>臺幣約當總計：NT$ ${twdTotal.toLocaleString()}${twdMissing ? `（另有 ${twdMissing} 筆未填約當）` : ''}`
    : '';

  listEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const x = data.find(r => r.id === btn.closest('.card').dataset.id);
      if (btn.dataset.action === 'edit') fillForm(x);
      else deleteExpense(x);
    });
  });
}

function fillForm(x) {
  const f = document.getElementById('expense-form');
  editingId = x.id;
  f.elements.category.value = x.category;
  f.elements.title.value = x.title;
  f.elements.note.value = x.note ?? '';
  f.elements.amount.value = x.amount;
  f.elements.currency.value = x.currency;
  f.elements.amount_twd.value = x.amount_twd ?? '';
  f.elements.payment_method.value = x.payment_method ?? '';
  f.elements.spent_on.value = x.spent_on ?? '';
  f.elements.link.value =
    x.stay_id ? `stay:${x.stay_id}`
    : x.flight_id ? `flight:${x.flight_id}`
    : x.transport_card_id ? `card:${x.transport_card_id}`
    : '';
}

function resetForm() {
  editingId = null;
  document.getElementById('expense-form').reset();
}

async function saveExpense(e) {
  e.preventDefault();
  const f = e.target;
  const [kind, linkId] = (f.elements.link.value || ':').split(':');
  const row = {
    trip_id: tripId,
    category: f.elements.category.value,
    title: f.elements.title.value.trim(),
    note: f.elements.note.value.trim() || null,
    amount: Number(f.elements.amount.value),
    currency: f.elements.currency.value.trim().toUpperCase() || 'TWD',
    amount_twd: f.elements.amount_twd.value === '' ? null : Number(f.elements.amount_twd.value),
    payment_method: f.elements.payment_method.value || null,
    spent_on: f.elements.spent_on.value || null,
    stay_id: kind === 'stay' ? linkId : null,
    flight_id: kind === 'flight' ? linkId : null,
    transport_card_id: kind === 'card' ? linkId : null,
  };
  const q = editingId
    ? supabase.from('expenses').update(row).eq('id', editingId)
    : supabase.from('expenses').insert(row);
  const { error } = await q;
  if (error) { toast('儲存失敗：' + error.message, true); return; }
  toast('記帳已儲存');
  resetForm();
  loadList();
}

async function deleteExpense(x) {
  if (!confirm(`確定刪除「${x.title}」？`)) return;
  const { error } = await supabase.from('expenses').delete().eq('id', x.id);
  if (error) { toast('刪除失敗：' + error.message, true); return; }
  toast('已刪除');
  loadList();
}
