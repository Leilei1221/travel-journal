// A5 旅遊小書（PLAN.md §8）— 封面/行程/遊記/照片牆/封底，自動分頁
// 資料權限：匿名只能匯出公開旅程；本人於同瀏覽器登入後臺後，可匯出未公開旅程
import { supabase, esc, textToHtml, dateRange } from './front-client.js';

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

  renderCover(trip, photos.data);
  renderItinerary(flights.data, stays.data, cards.data);
  renderPosts(posts.data);
  renderPhotos(photos.data);
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

// ── 遊記頁（已發布文章，段落級自動分頁） ─────────────
function renderPosts(posts) {
  if (!posts?.length) return;
  for (const p of posts) {
    const blocks = [
      `<h2 class="post-title">${esc(p.title ?? '')}</h2>`,
      `<p class="post-date">${p.post_date ? esc(p.post_date.replaceAll('-', '.')) : ''}</p>`,
      ...textToHtml(p.content ?? '').match(/<p>.*?<\/p>/gs) ?? [],
    ];
    fillBlocks('', blocks);
  }
}

// ── 照片頁（拍立得 2×2，每頁 4 張） ──────────────────
function renderPhotos(photos) {
  if (!photos?.length) return;
  for (let i = 0; i < photos.length; i += 4) {
    const chunk = photos.slice(i, i + 4);
    const safe = newSheet();
    safe.insertAdjacentHTML('beforeend', `
      ${i === 0 ? '<h2 class="sheet-title">旅途照片</h2>' : ''}
      <div class="photo-sheet-grid">
        ${chunk.map(p => `
          <figure class="print-polaroid">
            <img src="${esc(p.src_url)}" alt="${esc(p.caption ?? '旅行照片')}">
            <figcaption>
              ${esc(p.caption ?? '')}
              ${p.location_name ? `<div class="loc">📍 ${esc(p.location_name)}</div>` : ''}
              ${p.taken_on ? `<div class="loc">${esc(p.taken_on.replaceAll('-', '.'))}</div>` : ''}
            </figcaption>
          </figure>`).join('')}
      </div>`);
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
