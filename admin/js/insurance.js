// 旅平險投保決策儀表板 — ti_ 表 RLS 僅本人，前臺永不撈取
// 本批：查詢表單＋簽證區塊＋簽證分類總覽；保費試算/風險/健康/文化留待後續批次
// 鐵則：簽證資料缺什麼就不顯示什麼，程式端絕不臆測或補預設值；
//       已建檔卡片只放 apply_url 這一個申請連結，未建檔一律導向外交部領事事務局
import { supabase, esc, toast } from './supabase-client.js?v=12';

const VERIFIED = new Set(['已建檔', 'verified']);
const CATEGORY_ORDER = ['免簽', '電子簽', '落地簽', '須事先辦簽'];
const HOUR_MS = 3600 * 1000;

let countries = [];
let visaRows = [];

export function initInsurance() {
  document.getElementById('insurance-form').addEventListener('submit', runQuery);
}

export async function loadInsurance() {
  const [cRes, vRes] = await Promise.all([
    supabase.from('ti_countries').select('id, name_zh, region').order('region').order('name_zh'),
    supabase.from('ti_country_visa').select('*'),
  ]);
  const error = cRes.error ?? vRes.error;
  if (error) { toast('讀取旅平險資料失敗：' + error.message, true); return; }
  countries = cRes.data;
  visaRows = vRes.data;
  renderChips();
  renderOverview(selectedIds());
}

function selectedIds() {
  return new Set([...document.querySelectorAll('#ins-countries input:checked')].map(i => i.value));
}

// 國家多選 chip（重載時保留已勾選）
function renderChips() {
  const box = document.getElementById('ins-countries');
  const prev = selectedIds();
  box.innerHTML = countries.length
    ? countries.map(c =>
        `<label class="ins-chip"><input type="checkbox" value="${c.id}"${prev.has(c.id) ? ' checked' : ''}>${esc(c.name_zh)}</label>`
      ).join('')
    : '<span class="muted">ti_countries 尚無國家資料，請先建檔。</span>';
}

function runQuery(e) {
  e.preventDefault();
  const f = e.target;
  const ids = [...selectedIds()];
  if (!ids.length) { toast('請至少勾選一個目的地國家', true); return; }

  const depart = f.elements.depart_date.value;
  const ret = f.elements.return_date.value;
  const days = Math.round((new Date(ret) - new Date(depart)) / 86400000) + 1;
  if (days < 1) { toast('回程日期不可早於出發日期', true); return; }

  const birthYear = f.elements.birth_year.value;
  const age = birthYear ? Number(depart.slice(0, 4)) - Number(birthYear) : null;
  document.getElementById('ins-trip-summary').textContent =
    `旅程 ${days} 天` + (age != null ? `・出發時約 ${age} 歲（保費試算於後續批次使用）` : '');

  renderCards(ids, depart, days);
  renderOverview(new Set(ids));
}

// ── 結果卡片：每個選到的國家一張 ─────────────────────────
function renderCards(ids, depart, days) {
  const wrap = document.getElementById('ins-results');
  wrap.innerHTML = ids.map(id => {
    const c = countries.find(x => x.id === id);
    if (!c) return '';
    const rows = visaRows.filter(v => v.country_id === id);
    const verified = rows.filter(v => VERIFIED.has((v.data_status ?? '').trim()));
    return verified.length ? verifiedCard(c, verified, depart, days) : unfiledCard(c, rows[0]);
  }).join('');
}

function verifiedCard(c, rows, depart, days) {
  return `
    <div class="card ins-card">
      <div class="card-body">
        <h3 class="ins-country">${esc(c.name_zh)}</h3>
        ${rows.map(v => visaBlock(v, depart, days)).join('<hr class="ins-divider">')}
      </div>
    </div>`;
}

// 已建檔簽證區塊；申請時機兩種算法（PLAN：window 有值→出發日往前推；無值→直接用 warning_note 建議）
function visaBlock(v, depart, days) {
  const overstay = v.visa_free_days != null && days > v.visa_free_days
    ? ` <span class="ins-overstay">⚠ 旅程 ${days} 天，超過可停留天數！</span>` : '';
  const head = [
    v.visa_type ? `<span class="badge">${esc(v.visa_type)}</span>` : '',
    v.visa_free_days != null ? `<span>可停留 ${v.visa_free_days} 天${overstay}</span>` : '',
  ].filter(Boolean).join(' ');

  const fee = v.official_fee ? `
    <div class="ins-fee-row"><span class="muted">官方費用</span><span class="ins-fee">${esc(v.official_fee)}</span></div>
    ${v.fee_warning ? `<div class="ins-fee-warning">⚠ ${esc(v.fee_warning)}</div>` : ''}` : '';

  const link = v.apply_url
    ? `<a class="btn-link" href="${esc(v.apply_url)}" target="_blank" rel="noopener">🔗 前往唯一官方申請網址</a>` : '';

  const docs = v.required_docs ? `<div class="muted ins-line">必備文件：${esc(v.required_docs)}</div>` : '';
  // window 為空時 warning_note 會顯示在下方申請時機，避免重複只在 window 有值時另列特別提醒
  const note = v.apply_window_hours != null && v.warning_note
    ? `<div class="muted ins-line">特別提醒：${esc(v.warning_note)}</div>` : '';

  let timing = '';
  if (v.apply_window_hours != null) {
    const earliest = new Date(new Date(depart + 'T00:00').getTime() - v.apply_window_hours * HOUR_MS);
    timing = `<div class="ins-timing">🗓 申請時機：<strong>最早 ${earliest.getMonth() + 1}/${earliest.getDate()} 可申請，最晚登機前完成</strong>（出發前 ${v.apply_window_hours} 小時內）</div>`;
  } else if (v.warning_note) {
    timing = `<div class="ins-timing">🗓 申請時機：<strong>${esc(v.warning_note)}</strong></div>`;
  }

  return `<div class="ins-visa">
    ${head ? `<div class="ins-visa-head">${head}</div>` : ''}
    ${fee}${link}${docs}${note}${timing}
  </div>`;
}

// 查無此國或待建檔：固定文案＋外交部連結，絕不留白也絕不編造
function unfiledCard(c, row) {
  const mofa = row?.mofa_query_url
    ? `<a class="btn-link" href="${esc(row.mofa_query_url)}" target="_blank" rel="noopener">🔗 前往外交部領事事務局查詢</a>` : '';
  return `
    <div class="card ins-card ins-unfiled">
      <div class="card-body">
        <h3 class="ins-country">${esc(c.name_zh)} <span class="badge">待建檔</span></h3>
        <p class="ins-line">此國簽證資料尚未建檔，請至外交部領事事務局查詢。</p>
        ${mofa}
      </div>
    </div>`;
}

// ── 簽證分類總覽：全部已建檔國家依 visa_category 分組，選到的加粗 ──
function renderOverview(selected) {
  const box = document.getElementById('ins-overview');
  const groups = {};
  for (const v of visaRows) {
    if (!VERIFIED.has((v.data_status ?? '').trim())) continue;
    const c = countries.find(x => x.id === v.country_id);
    if (!c) continue;
    const cat = (v.visa_category ?? '').trim() || '未分類';
    (groups[cat] ??= new Map()).set(c.id, c.name_zh);
  }
  const cats = [
    ...CATEGORY_ORDER.filter(cat => groups[cat]),
    ...Object.keys(groups).filter(cat => !CATEGORY_ORDER.includes(cat)),
  ];
  box.innerHTML = cats.length
    ? cats.map(cat => `
        <div class="ins-cat">
          <span class="ins-cat-name">${esc(cat)}</span>
          <span>${[...groups[cat]].map(([id, name]) =>
            selected.has(id) ? `<strong>${esc(name)}</strong>` : esc(name)).join('、')}</span>
        </div>`).join('')
    : '<p class="muted">尚無已建檔的簽證資料。</p>';
}
