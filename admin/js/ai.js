// AI 草稿助手（Phase 3）— 呼叫 gemini-draft Edge Function
// 金鑰在伺服器端；這裡只送素材、收草稿。產生的內容一律進「草稿」，人工確認才發布。
import { supabase, SUPABASE_URL, SUPABASE_KEY, toast } from './supabase-client.js?v=9';
import { setPendingAiDraft } from './posts.js?v=9';

const FRONT_BASE = 'https://leilei1221.github.io/travel-journal';

let trip = null;

// 統一在按鈕旁的狀態列顯示訊息（AI 失敗必顯示明確錯誤，不再只靠可能捲出畫面的 toast）
export function setAiStatus(el, msg, kind = 'info') {
  el.textContent = msg;
  el.classList.toggle('ai-error', kind === 'error');
  el.classList.toggle('ai-ok', kind === 'ok');
}

export function initAi() {
  document.getElementById('ai-journal-btn').addEventListener('click', () => generateDraft('journal'));
  document.getElementById('ai-backfill-btn').addEventListener('click', () => generateDraft('backfill'));
  document.getElementById('ai-fb-btn').addEventListener('click', generateFb);
  document.getElementById('ai-fb-copy').addEventListener('click', copyFb);
}

export function loadAi(t) {
  trip = t;
  document.getElementById('ai-fb-result').value = '';
}

// 組旅程背景資料（本人登入查詢，含未公開項目——AI 需要完整脈絡）
async function tripContext() {
  const [fl, st, tc, ph] = await Promise.all([
    supabase.from('flights').select('segment_order, airline, flight_no, depart_airport, arrive_airport, layover_info, transfer_type').eq('trip_id', trip.id).order('segment_order'),
    supabase.from('stays').select('name, address, check_in, check_out, notes').eq('trip_id', trip.id).order('check_in', { nullsFirst: false }),
    supabase.from('transport_cards').select('card_type, title, content, cost_note').eq('trip_id', trip.id).order('sort_order'),
    supabase.from('photos').select('taken_on, caption, location_name').eq('trip_id', trip.id).order('taken_on', { nullsFirst: false }),
  ]);
  const lines = [`旅程：${trip.title}｜${trip.destination ?? ''}｜${trip.start_date ?? '?'}～${trip.end_date ?? '?'}`];
  if (fl.data?.length) lines.push('航班：' + fl.data.map(f =>
    `${f.airline ?? ''} ${f.flight_no ?? ''} ${f.depart_airport ?? ''}→${f.arrive_airport ?? ''}${f.layover_info ? `（${f.layover_info}）` : ''}`).join('；'));
  if (st.data?.length) lines.push('住宿：' + st.data.map(s =>
    `${s.name}（${s.check_in ?? ''}～${s.check_out ?? ''}）${s.notes ?? ''}`).join('；'));
  if (tc.data?.length) lines.push('交通：' + tc.data.map(c =>
    `${c.card_type}｜${c.title}${c.content ? `：${c.content}` : ''}${c.cost_note ? `（${c.cost_note}）` : ''}`).join('；'));
  const caps = (ph.data ?? []).filter(p => p.caption || p.location_name);
  if (caps.length) lines.push('照片紀錄：' + caps.map(p =>
    `${p.taken_on ?? ''} ${p.caption ?? ''}${p.location_name ? `＠${p.location_name}` : ''}`).join('；'));
  return lines.join('\n');
}

// 共用：呼叫 gemini-draft Edge Function（文字模式回 {text}，圖片模式回 {image, mimeType}）
export async function callGemini(mode, context, notes) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('請先登入');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/gemini-draft`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_KEY,
    },
    body: JSON.stringify({ mode, context, notes }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

async function generateDraft(mode) {
  const notes = document.getElementById('ai-notes').value.trim();
  const statusEl = document.getElementById('ai-status');
  if (!notes) { toast('請先填入素材', true); return; }
  const btns = ['ai-journal-btn', 'ai-backfill-btn'].map(id => document.getElementById(id));
  btns.forEach(b => b.disabled = true);
  setAiStatus(statusEl, 'AI 書寫中…（約 10–30 秒）');
  try {
    const context = document.getElementById('ai-include-context').checked ? await tripContext() : '';
    const { text } = await callGemini(mode, context, notes);
    // 第一行＝標題，其餘＝內文 → 填入下方文章表單（草稿）
    const [firstLine, ...rest] = text.split('\n');
    const f = document.getElementById('post-form');
    f.elements.title.value = firstLine.trim();
    f.elements.content.value = rest.join('\n').trim();
    f.elements.status.value = 'draft';
    if (mode === 'backfill') f.elements.post_type.value = 'daily';
    setPendingAiDraft(text); // 原文存入 ai_draft 欄位供日後對照
    setAiStatus(statusEl, '✓ 草稿已填入下方文章表單，請確認潤飾後儲存', 'ok');
    toast('草稿已填入下方文章表單');
    f.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    setAiStatus(statusEl, '⚠ AI 產生失敗：' + err.message, 'error');
    toast('AI 產生失敗：' + err.message, true);
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}

async function generateFb() {
  const notes = document.getElementById('ai-fb-notes').value.trim();
  const statusEl = document.getElementById('ai-fb-status');
  const btn = document.getElementById('ai-fb-btn');
  if (!notes) { toast('請先貼上要宣傳的文章內容或重點', true); return; }
  btn.disabled = true;
  setAiStatus(statusEl, '小編撰寫中…');
  try {
    const context = `前臺連結：${FRONT_BASE}/trip.html?id=${trip.id}`;
    document.getElementById('ai-fb-result').value = (await callGemini('fb', context, notes)).text;
    setAiStatus(statusEl, '✓ 已產生，複製後貼到粉專即可', 'ok');
    toast('FB 貼文已產生');
  } catch (err) {
    setAiStatus(statusEl, '⚠ AI 產生失敗：' + err.message, 'error');
    toast('AI 產生失敗：' + err.message, true);
  } finally {
    btn.disabled = false;
  }
}

async function copyFb() {
  const text = document.getElementById('ai-fb-result').value;
  if (!text) { toast('還沒有產生貼文', true); return; }
  await navigator.clipboard.writeText(text);
  toast('已複製到剪貼簿');
}
