// 文章管理 — 前臺「旅程故事」（行前情報＋每日遊記）與「旅行筆記」（旅程總結）的內容來源
// 僅「已發布」文章對外可見；AI 草稿生成為 Phase 3（ai_draft 欄位已預留）
import { supabase, esc, toast } from './supabase-client.js?v=12';

const TYPE_LABEL = { pretrip: '行前情報', daily: '每日遊記', summary: '旅程總結' };
const TYPE_HINT = { pretrip: '→ 前臺「旅程故事」', daily: '→ 前臺「旅程故事」', summary: '→ 前臺「旅行筆記」' };

let tripId = null;
let editingId = null;
let editingPublishedAt = null;
let pendingAiDraft = null; // AI 產生的原文，儲存時寫入 ai_draft 供日後對照

export function setPendingAiDraft(text) {
  pendingAiDraft = text;
}

export function initPosts() {
  document.getElementById('post-form').addEventListener('submit', savePost);
  document.getElementById('post-form-reset').addEventListener('click', resetForm);
}

export async function loadPosts(trip) {
  tripId = trip.id;
  resetForm();
  const listEl = document.getElementById('post-list');
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('trip_id', tripId)
    .order('post_date', { nullsFirst: true })
    .order('created_at');
  if (error) { toast('讀取文章失敗：' + error.message, true); return; }

  // 內文預設只顯示前幾段，其餘收進「閱讀全文」
  const PREVIEW_PARAS = 2;
  const paraHtml = list => list.map(s => `<p>${esc(s).replace(/\n/g, '<br>')}</p>`).join('');
  listEl.innerHTML = data.length
    ? data.map(p => {
      const paras = String(p.content ?? '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
      const rest = paras.slice(PREVIEW_PARAS);
      return `
      <div class="card post-card" data-id="${p.id}">
        <div class="card-body">
          <span class="badge">${TYPE_LABEL[p.post_type] ?? esc(p.post_type)}</span>
          ${p.status === 'published'
            ? '<span class="badge badge-public">已發布</span>'
            : '<span class="badge">草稿</span>'}
          <strong>${esc(p.title ?? '（未命名）')}</strong>
          <div class="muted">${esc(p.post_date ?? '未填日期')}</div>
          <div class="post-preview">${paraHtml(paras.slice(0, PREVIEW_PARAS))}</div>
          ${rest.length ? `
            <div class="post-preview post-rest" hidden>${paraHtml(rest)}</div>
            <button type="button" data-action="toggle" class="post-toggle"
              data-more="閱讀全文（還有 ${rest.length} 段）">閱讀全文（還有 ${rest.length} 段）</button>` : ''}
        </div>
        <div class="card-actions">
          <button data-action="edit">編輯</button>
          <button data-action="delete" class="danger">刪除</button>
        </div>
      </div>`;
    }).join('')
    : '<p class="muted">尚無文章。寫一篇行前情報試試？</p>';

  listEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.card');
      if (btn.dataset.action === 'toggle') {
        const rest = card.querySelector('.post-rest');
        const show = rest.hidden;
        rest.hidden = !show;
        btn.textContent = show ? '收合' : btn.dataset.more;
        return;
      }
      const p = data.find(x => x.id === card.dataset.id);
      if (btn.dataset.action === 'edit') fillForm(p);
      else if (btn.dataset.action === 'delete') deletePost(p);
    });
  });
}

function fillForm(p) {
  const f = document.getElementById('post-form');
  editingId = p.id;
  editingPublishedAt = p.published_at;
  f.elements.post_type.value = p.post_type;
  f.elements.status.value = p.status;
  f.elements.title.value = p.title ?? '';
  f.elements.post_date.value = p.post_date ?? '';
  f.elements.content.value = p.content ?? '';
  document.getElementById('post-form-title').textContent = '編輯文章：' + (p.title ?? '（未命名）');
  f.scrollIntoView({ behavior: 'smooth' });
}

function resetForm() {
  editingId = null;
  editingPublishedAt = null;
  pendingAiDraft = null;
  document.getElementById('post-form').reset();
  document.getElementById('post-form-title').textContent = '新增文章';
}

async function savePost(e) {
  e.preventDefault();
  const f = e.target;
  const status = f.elements.status.value;
  const row = {
    trip_id: tripId,
    post_type: f.elements.post_type.value,
    status,
    title: f.elements.title.value.trim() || null,
    post_date: f.elements.post_date.value || null,
    content: f.elements.content.value.trim() || null,
    // 首次發布時記錄發布時間；下架回草稿則清除
    published_at: status === 'published' ? (editingPublishedAt ?? new Date().toISOString()) : null,
    ...(pendingAiDraft ? { ai_draft: pendingAiDraft } : {}),
  };
  const q = editingId
    ? supabase.from('posts').update(row).eq('id', editingId)
    : supabase.from('posts').insert(row);
  const { error } = await q;
  if (error) { toast('儲存失敗：' + error.message, true); return; }
  toast(status === 'published' ? '文章已發布' : '草稿已儲存');
  resetForm();
  loadPosts({ id: tripId });
}

async function deletePost(p) {
  if (!confirm(`確定刪除「${p.title ?? '（未命名）'}」？`)) return;
  const { error } = await supabase.from('posts').delete().eq('id', p.id);
  if (error) { toast('刪除失敗：' + error.message, true); return; }
  toast('已刪除');
  loadPosts({ id: tripId });
}

export { TYPE_HINT };
