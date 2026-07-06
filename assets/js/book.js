// A5 旅遊小書（PLAN.md §8）— 封面/行程/遊記/照片牆/封底，自動分頁
// 資料權限：匿名只能匯出公開旅程；本人於同瀏覽器登入後臺後，可匯出未公開旅程
import { supabase, esc, textToHtml, dateRange } from './front-client.js?v=9';

const tripId = new URLSearchParams(location.search).get('id');
const bookEl = document.getElementById('book');
const statusEl = document.getElementById('book-status');

document.getElementById('print-btn').addEventListener('click', () => window.print());

// ── 分頁基礎：建立一張 A5 sheet，回傳安全區容器 ──────
let pageCount = 0;
function newSheet(cls = '', numbered = true) {
  const sheet = document.createElement('section');
  sheet.className = 'sheet' + (cls ? ' ' + cls : '');
  const safe = document.createElement('div');
  safe.className = 'safe';
  sheet.appendChild(safe);
  if (numbered) {
    pageCount++;
    sheet.insertAdjacentHTML('beforeend', `<div class="page-no">· ${pageCount} ·</div>`);
  }
  bookEl.appendChild(sheet);
  return safe;
}

// 把區塊逐一放入頁面，放不下就自動開新頁（單一區塊超過整頁時裁切）
function fillBlocks(titleHtml, blocks) {
  let safe = newSheet();
  if (titleHtml) safe.insertAdjacentHTML('beforeend', titleHtml);
  for (const html of blocks) {
    safe.insertAdjacentHTML('beforeend', html);
    if (safe.scrollHeight > safe.clientHeight && safe.children.length > 1) {
      const overflowed = safe.lastElementChild;
      overflowed.remove();
      safe = newSheet();
      safe.appendChild(overflowed);
    }
  }
}

async function init() {
  if (!tripId) { statusEl.textContent = '缺少旅程 ID'; return; }

  const { data: trip } = await supabase
    .from('trips')
    .select('*')
    .eq('id', tripId)
    .maybeSingle(); // RLS：匿名見公開、本人見全部
  if (!trip) {
    statusEl.textContent = '找不到旅程——若這趟尚未公開，請先在同一瀏覽器登入後臺再開啟本頁';
    return;
  }

  // 套用主題（與前臺共用視覺語言）
  for (const [k, v] of Object.entries(trip.theme ?? {})) {
    if (k.startsWith('--')) document.documentElement.style.setProperty(k, v);
  }
  document.title = `${trip.title}｜旅遊小書`;

  const [flights, stays, cards, posts, photos] = await Promise.all([
    supabase.from('flights').select('*').eq('trip_id', tripId).order('segment_order'),
    supabase.from('stays').select('*').eq('trip_id', tripId).order('check_in', { nullsFirst: false }).order('created_at'),
    supabase.from('transport_cards').select('*').eq('trip_id', tripId).order('sort_order'),
    supabase.from('posts').select('*').eq('trip_id', tripId).eq('status', 'published').order('post_date', { nullsFirst: true }),
    supabase.from('photos').select('*').eq('trip_id', tripId).order('taken_on', { nullsFirst: false }).order('sort_order'),
  ]);

  const allPhotos = photos.data ?? [];
  // 有段落錨點（post_id＋post_paragraph）→ 圖文穿插進遊記；
  // 其餘（未配圖、或配圖但沒指定段落）→ 回退文末拼貼區
  const isAnchored = p => p.post_id && p.post_paragraph != null;
  const anchored = allPhotos.filter(isAnchored);
  const freePhotos = allPhotos.filter(p => !isAnchored(p));

  const coverSrc = trip.cover_photo_url ?? allPhotos[0]?.src_url ?? null;
  renderCover(trip, allPhotos);
  renderItinerary(flights.data, stays.data, cards.data);
  if (posts.data?.length) {
    renderChapterDivider(coverSrc, '旅程故事', trip.destination ?? '');
    renderPosts(posts.data, anchored);
  }
  if (freePhotos.length) {
    // 扉頁用一張與封面不同的照片（若有），讓章節有變化
    const dividerPhoto = freePhotos.find(p => p.src_url !== coverSrc)?.src_url ?? freePhotos[0].src_url;
    renderChapterDivider(dividerPhoto, '旅途照片', `${freePhotos.length} 個瞬間`);
    renderPhotos(freePhotos);
  }
  renderBackCover(trip);

  statusEl.textContent = `《${trip.title}》共 ${bookEl.querySelectorAll('.sheet').length} 頁`;
}

// ── 封面 ─────────────────────────────────────────────
function renderCover(trip, photos) {
  const coverSrc = trip.cover_photo_url ?? photos?.[0]?.src_url ?? null;
  const safe = newSheet('cover' + (coverSrc ? '' : ' no-photo'), false);
  const sheet = safe.parentElement;
  if (coverSrc) {
    sheet.insertAdjacentHTML('afterbegin', `
      <img class="cover-photo" src="${esc(coverSrc)}" alt="${esc(trip.title)} 封面">
      <div class="cover-veil"></div>`);
  }
  sheet.insertAdjacentHTML('beforeend', `
    <div class="brand-mark">Lei's Go! 🐾</div>
    <div class="cover-text">
      <h1>${esc(trip.title)}</h1>
      <p>${esc([trip.destination, dateRange(trip.start_date, trip.end_date)].filter(Boolean).join('｜'))}</p>
    </div>`);
}

// ── 行程頁 ───────────────────────────────────────────
function renderItinerary(flights, stays, cards) {
  const fmtTime = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const blocks = [];
  if (flights?.length) {
    blocks.push('<h3>✈ 航班</h3>');
    for (const fl of flights) blocks.push(`
      <div class="book-card">
        <strong>${esc(fl.airline ?? '')} ${esc(fl.flight_no ?? '')}</strong>
        ${fl.transfer_type ? `<span class="chip">${esc(fl.transfer_type)}</span>` : ''}
        ${fl.ticket_type ? `<span class="chip">${esc(fl.ticket_type)}</span>` : ''}
        <div class="sub">${esc(fl.depart_airport ?? '')} → ${esc(fl.arrive_airport ?? '')}
          ${fl.depart_time ? `｜${fmtTime(fl.depart_time)} 起飛` : ''}${fl.arrive_time ? `，${fmtTime(fl.arrive_time)} 抵達` : ''}</div>
        ${fl.layover_info ? `<div class="sub">轉機：${esc(fl.layover_info)}</div>` : ''}
      </div>`);
  }
  if (stays?.length) {
    blocks.push('<h3>🏠 住宿</h3>');
    for (const s of stays) blocks.push(`
      <div class="book-card">
        <strong>${esc(s.name)}</strong>
        <div class="sub">${esc(s.check_in ?? '')} 入住 – ${esc(s.check_out ?? '')} 退房</div>
        ${s.address ? `<div class="sub">${esc(s.address)}</div>` : ''}
        ${s.notes ? `<div class="sub">${esc(s.notes)}</div>` : ''}
      </div>`);
  }
  if (cards?.length) {
    blocks.push('<h3>🚙 交通</h3>');
    for (const c of cards) blocks.push(`
      <div class="book-card callout">
        <span class="chip">${esc(c.card_type)}</span> <strong>${esc(c.title)}</strong>
        ${c.content ? `<div class="sub">${esc(c.content)}</div>` : ''}
        ${c.cost_note ? `<div class="sub">💰 ${esc(c.cost_note)}</div>` : ''}
      </div>`);
  }
  if (blocks.length) fillBlocks('<h2 class="sheet-title">行程安排</h2>', blocks);
}

// 每個段落錨點最多 1–2 張精選；同地點重複不全放
function pickInline(list) {
  const sorted = [...list].sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0));
  const picked = [];
  const seenLoc = new Set();
  for (const p of sorted) {                 // 先湊不同地點
    if (picked.length >= 2) break;
    const loc = p.location_name || '';
    if (loc && seenLoc.has(loc)) continue;
    picked.push(p); seenLoc.add(loc);
  }
  for (const p of sorted) {                 // 不足 2 張再補
    if (picked.length >= 2) break;
    if (!picked.includes(p)) picked.push(p);
  }
  return picked;
}

// 圖文穿插用的內嵌拍立得區塊（1–2 張，手帳裝飾、微傾斜，在文字流中）
function inlinePhotosBlock(list) {
  const picked = pickInline(list);
  if (!picked.length) return '';
  return `<div class="inline-photos count-${picked.length}">${picked.map((p, i) => `
    <figure class="snap ${['tape-tl', 'tape-tr tape-accent', 'stamp'][i % 3]}">
      <img src="${esc(p.src_url)}" alt="${esc(p.caption ?? '照片')}">
      ${p.caption || p.location_name ? `<figcaption>${esc(p.caption ?? '')}${p.location_name ? `<span class="loc"> 📍${esc(p.location_name)}</span>` : ''}</figcaption>` : ''}
    </figure>`).join('')}</div>`;
}

// ── 遊記頁（圖文穿插：照片依段落錨點放進文字流；段落級自動分頁）──
function renderPosts(posts, anchoredPhotos = []) {
  if (!posts?.length) return;
  // 依 post_id → 段落索引 → 照片清單 分組
  const byPost = new Map();
  for (const ph of anchoredPhotos) {
    if (!byPost.has(ph.post_id)) byPost.set(ph.post_id, new Map());
    const m = byPost.get(ph.post_id);
    const idx = ph.post_paragraph; // 已保證非 null；>= 段數＝文末
    if (!m.has(idx)) m.set(idx, []);
    m.get(idx).push(ph);
  }

  for (const p of posts) {
    const paras = (textToHtml(p.content ?? '').match(/<p>.*?<\/p>/gs)) ?? [];
    const anchors = byPost.get(p.id) ?? new Map();
    const blocks = [
      `<h2 class="post-title">${esc(p.title ?? '')}</h2>`,
      `<p class="post-date">${p.post_date ? esc(p.post_date.replaceAll('-', '.')) : ''}</p>`,
    ];
    paras.forEach((para, i) => {
      blocks.push(para);
      if (anchors.has(i)) blocks.push(inlinePhotosBlock(anchors.get(i)));
    });
    // 文末照片：錨點索引 ≥ 段數（含 Infinity/文末）者集中放在文章結尾
    const endList = [...anchors.entries()].filter(([idx]) => idx >= paras.length).flatMap(([, v]) => v);
    if (endList.length) blocks.push(inlinePhotosBlock(endList));
    fillBlocks('', blocks.filter(Boolean));
  }
}

// ── 章節扉頁（大照片＋標題＋留白） ───────────────────
function renderChapterDivider(imgSrc, title, subtitle) {
  const safe = newSheet('chapter', false);
  const sheet = safe.parentElement;
  sheet.insertAdjacentHTML('beforeend', `
    <span class="chapter-tape" aria-hidden="true"></span>
    ${imgSrc ? `<div class="chapter-photo-frame"><img src="${esc(imgSrc)}" alt="${esc(title)}"></div>` : ''}
    <div class="chapter-text">
      <h2>${esc(title)}</h2>
      ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
    </div>`);
}

// 拼貼版位模板（左/上/寬/高 為安全區百分比；rot 度；deco 裝飾類別）
// 每張照片位置固定於單頁內，確保列印不跨頁裁切；大小交錯、錯落、微傾斜
// 版位：左/上/寬 為安全區百分比；ar 圖片長寬比（大小交錯）；rot 度；deco 裝飾
const COLLAGE_TEMPLATES = [
  [ { l: 3,  t: 3,  w: 50, ar: '4/3', r: -3,  deco: 'tape-tl' },
    { l: 57, t: 6,  w: 36, ar: '3/4', r: 2.5, deco: 'stamp' },
    { l: 4,  t: 51, w: 43, ar: '1/1', r: 2,   deco: 'tape-tr tape-accent' },
    { l: 51, t: 57, w: 42, ar: '4/3', r: -2,  deco: 'tape-tl' } ],
  [ { l: 5,  t: 2,  w: 56, ar: '4/3', r: 2,   deco: 'tape-tr' },
    { l: 60, t: 8,  w: 34, ar: '3/4', r: -3,  deco: 'stamp' },
    { l: 13, t: 53, w: 52, ar: '3/2', r: -1.5,deco: 'tape-tl tape-accent' } ],
  [ { l: 4,  t: 3,  w: 42, ar: '3/4', r: 2,   deco: 'tape-tr' },
    { l: 50, t: 5,  w: 44, ar: '4/3', r: -2.5,deco: 'tape-tl tape-accent' },
    { l: 4,  t: 56, w: 45, ar: '4/3', r: -2,  deco: 'stamp' },
    { l: 51, t: 51, w: 42, ar: '1/1', r: 3,   deco: 'tape-tr' } ],
];

function snapHtml(p, slot) {
  const caption = [p.caption, p.location_name ? `📍 ${p.location_name}` : '']
    .filter(Boolean).join('　');
  return `
    <figure class="snap ${slot.deco}" style="left:${slot.l}%; top:${slot.t}%; width:${slot.w}%; transform: rotate(${slot.r}deg);">
      <img src="${esc(p.src_url)}" alt="${esc(p.caption ?? '旅行照片')}" style="aspect-ratio:${slot.ar};">
      ${caption || p.taken_on ? `<figcaption>${esc(caption)}${p.taken_on ? `<span class="loc"> ${esc(p.taken_on.replaceAll('-', '.'))}</span>` : ''}</figcaption>` : ''}
    </figure>`;
}

// ── 照片拼貼頁（大小交錯、位置錯落、手帳裝飾；照片維持原樣） ──
function renderPhotos(photos) {
  if (!photos?.length) return;
  let ti = 0;
  let i = 0;
  while (i < photos.length) {
    const tpl = COLLAGE_TEMPLATES[ti % COLLAGE_TEMPLATES.length];
    const chunk = photos.slice(i, i + tpl.length);
    const safe = newSheet();
    safe.insertAdjacentHTML('beforeend',
      `<div class="collage">${chunk.map((p, k) => snapHtml(p, tpl[k])).join('')}</div>`);
    i += tpl.length;
    ti++;
  }
}

// ── 封底 ─────────────────────────────────────────────
function renderBackCover(trip) {
  const safe = newSheet('backcover', false);
  safe.innerHTML = `
    <div class="ending">旅行，是與世界的對話，<br>也是與自己的和解。</div>
    <div class="brand">Lei's Go! 🐾 旅行日記<br>${esc(dateRange(trip.start_date, trip.end_date))}</div>`;
}

init();
