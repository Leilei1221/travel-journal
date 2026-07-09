// 旅平險投保決策儀表板 — ti_ 表 RLS 僅本人，前臺永不撈取
// 第 2 批：查詢表單＋簽證區塊＋簽證分類總覽
// 第 3 批：保障比較表（比保障不比保費，意外險費率為政府統一標準；ti_rate_bands 暫不使用）
// 風險/健康/文化留待後續批次
// 鐵則：資料缺什麼就不顯示什麼，程式端絕不臆測或補預設值；
//       簽證卡只放 apply_url、比較表只放 enroll_url 這一個官方連結
import { supabase, esc, toast } from './supabase-client.js?v=14';

const VERIFIED = new Set(['已建檔', 'verified']);
const CATEGORY_ORDER = ['免簽', '電子簽', '落地簽', '須事先辦簽'];
const HOUR_MS = 3600 * 1000;

let countries = [];
let visaRows = [];
let plans = [];
let riskAdvices = [];

export function initInsurance() {
  document.getElementById('insurance-form').addEventListener('submit', runQuery);
}

export async function loadInsurance() {
  const [cRes, vRes, pRes, aRes] = await Promise.all([
    supabase.from('ti_countries').select('id, name_zh, region, risk_tags').order('region').order('name_zh'),
    supabase.from('ti_country_visa').select('*'),
    supabase.from('ti_plans').select('*, ti_insurers(name)'),
    supabase.from('ti_risk_advice').select('*').order('created_at'),
  ]);
  const error = cRes.error ?? vRes.error ?? pRes.error ?? aRes.error;
  if (error) { toast('讀取旅平險資料失敗：' + error.message, true); return; }
  countries = cRes.data;
  visaRows = vRes.data;
  riskAdvices = aRes.data;
  plans = pRes.data.sort((a, b) =>
    (a.ti_insurers?.name ?? '').localeCompare(b.ti_insurers?.name ?? '', 'zh-Hant')
    || (a.plan_name ?? '').localeCompare(b.plan_name ?? '', 'zh-Hant'));
  renderChips();
  renderOverview(selectedIds());
  renderCompare();
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
    `旅程 ${days} 天` + (age != null ? `・出發時約 ${age} 歲` : '');

  renderCards(ids, depart, days);
  renderOverview(new Set(ids));
  renderRiskAdvice(ids, depart);
}

// ── 風險建議：risk_tags＋出發月份 → 比對 ti_risk_advice ─────
// 無對應規則整區隱藏（不硬湊、不編造）；語氣一律「建議留意」
function renderRiskAdvice(ids, depart) {
  const section = document.getElementById('ins-risk-section');
  const box = document.getElementById('ins-risk');

  // risk_type → 觸發來源（國家名，去重）
  const triggers = new Map();
  const addTrigger = (type, source) => {
    if (!triggers.has(type)) triggers.set(type, new Set());
    triggers.get(type).add(source);
  };
  for (const id of ids) {
    const c = countries.find(x => x.id === id);
    if (!c?.risk_tags) continue;
    String(c.risk_tags).split(/[,，、]/).map(s => s.trim()).filter(Boolean)
      .forEach(t => addTrigger(t, c.name_zh));
  }
  // 颱風季不綁國家：台灣出發日月份 5–11 月即觸發
  const month = Number(depart.slice(5, 7));
  if (month >= 5 && month <= 11) addTrigger('颱風季', `${month} 月出發`);

  const cards = riskAdvices.filter(a => triggers.has(a.risk_type));
  if (!cards.length) { section.hidden = true; box.innerHTML = ''; return; }

  // 連動保障比較表：法定傳染病（risk_type 傳染病）列出有此保障的公司
  const infectiousInsurers = [...new Set(
    plans.filter(p => p.legal_infectious).map(p => p.ti_insurers?.name).filter(Boolean))];

  box.innerHTML = cards.map(a => {
    const src = [...triggers.get(a.risk_type)].join('、');
    const link = a.risk_type === '傳染病' && infectiousInsurers.length
      ? `<div class="ins-risk-link">✓ 下方比較表 ${infectiousInsurers.length} 家含法定傳染病保障：${esc(infectiousInsurers.join('、'))}</div>`
      : '';
    return `
      <div class="ins-risk-card">
        <div class="ins-risk-head">
          <span class="ins-risk-title">建議留意：${esc(a.advice_title)}</span>
          <span class="ins-risk-src">📍 ${esc(src)}</span>
        </div>
        ${a.advice_plain ? `<p class="ins-risk-plain">${esc(a.advice_plain)}</p>` : ''}
        ${link}
      </div>`;
  }).join('');
  section.hidden = false;
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

// ── 保障比較表：各家一欄，布林 ✓/✗，法定傳染病列醒目標示 ──
function renderCompare() {
  const box = document.getElementById('ins-compare');
  if (!plans.length) {
    box.innerHTML = '<p class="muted">尚無保險方案資料，請先建檔。</p>';
    return;
  }
  const money = v => v != null ? `${Number(v).toLocaleString()} 萬` : '—';
  const bool = v => v ? '<span class="ins-ok">✓</span>' : '<span class="ins-no">✗</span>';
  const day = v => {
    if (!v) return '—';
    const d = new Date(v);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  };
  const enroll = v => v
    ? `<a href="${esc(v)}" target="_blank" rel="noopener">官網投保</a>` : '—';

  const rows = [
    ['意外身故/失能', p => money(p.accident_coverage)],
    ['海外突發疾病醫療', p => money(p.medical_coverage)],
    ['海外突發疾病', p => bool(p.overseas_illness)],
    ['法定傳染病 ★', p => bool(p.legal_infectious), 'ins-row-key'],
    ['班機延誤', p => bool(p.flight_delay)],
    ['行李損失', p => bool(p.baggage)],
    ['旅程取消', p => bool(p.trip_cancel)],
    ['緊急救援額度', p => money(p.emergency_rescue_amount)],
    ['線上投保', p => enroll(p.enroll_url)],
    ['資料整理日', p => `<span class="muted">${day(p.data_updated_at)}</span>`],
  ];

  box.innerHTML = `
    <table class="ins-table">
      <thead>
        <tr>
          <th></th>
          ${plans.map(p => `<th>${esc(p.ti_insurers?.name ?? '（未知公司）')}<br><span class="muted">${esc(p.plan_name ?? '')}</span></th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(([label, cell, cls]) => `
          <tr${cls ? ` class="${cls}"` : ''}>
            <th scope="row">${label}</th>
            ${plans.map(p => `<td>${cell(p)}</td>`).join('')}
          </tr>`).join('')}
      </tbody>
    </table>`;
}
