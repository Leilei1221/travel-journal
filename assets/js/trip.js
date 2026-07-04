// 旅程內頁：per-trip 主題色＋四頁籤（故事/行程/照片/筆記）
// 只查公開表；私人表（*_private、expenses）永不撈取
import { supabase, esc, textToHtml, dateRange, mapsUrl } from './front-client.js';

const POST_TYPE_LABEL = { pretrip: '行前情報', daily: '每日遊記', summary: '旅程總結' };

const tripId = new URLSearchParams(location.search).get('id');

async function init() {
  if (!tripId) return showMissing();

  const { data: trip } = await supabase
    .from('trips')
    .select('id, title, destination, start_date, end_date, status, cover_photo_url, theme')
    .eq('id', tripId)
    .eq('is_public', true)
    .maybeSingle();
  if (!trip) return showMissing();

  // 套用主題色（骨架不變、換皮膚）
  for (const [k, v] of Object.entries(trip.theme ?? {})) {
    if (k.startsWith('--')) document.documentElement.style.setProperty(k, v);
  }

  document.title = `${trip.title}｜Lei's Go!`;
  document.getElementById('trip-title').textContent = trip.title;
  document.getElementById('trip-sub').textContent =
    [trip.destination, dateRange(trip.start_date, trip.end_date)].filter(Boolean).join('｜');
  const heroImg = document.getElementById('trip-hero-img');
  if (trip.cover_photo_url) {
    heroImg.src = trip.cover_photo_url; // Phase 3 換 Gemini 生成插圖
    heroImg.alt = `${trip.title} 封面照片`;
  } else {
    heroImg.remove(); // 無封面時以主題色底呈現
  }

  initTabs();
  await Promise.all([loadStory(), loadPlan(), loadPhotos(), loadNotes()]);
}

function showMissing() {
  document.querySelector('main').innerHTML =
    '<p class="empty-note">找不到這趟旅程，或它還沒公開。<br><a href="index.html">回到首頁</a></p>';
}

// 頁籤（支援 #story/#plan/#photos/#notes 深連結）
function initTabs() {
  const tabs = [...document.querySelectorAll('.trip-tab')];
  const activate = name => {
    tabs.forEach(t => t.setAttribute('aria-selected', t.dataset.panel === name));
    document.querySelectorAll('.tab-panel').forEach(p => p.hidden = p.id !== 'panel-' + name);
  };
  tabs.forEach(t => t.addEventListener('click', () => {
    history.replaceState(null, '', '#' + t.dataset.panel);
    activate(t.dataset.panel);
  }));
  const initial = location.hash.slice(1);
  activate(['story', 'plan', 'photos', 'notes'].includes(initial) ? initial : 'story');
  // 頁面已開啟時外部改 hash（如返回上一頁）也要跟著切換
  window.addEventListener('hashchange', () => {
    const name = location.hash.slice(1);
    if (['story', 'plan', 'photos', 'notes'].includes(name)) activate(name);
  });
}

async function loadStory() {
  const { data } = await supabase
    .from('posts')
    .select('post_type, title, content, post_date')
    .eq('trip_id', tripId)
    .eq('status', 'published')
    .in('post_type', ['pretrip', 'daily'])
    .order('post_date', { nullsFirst: true });
  renderPosts(document.getElementById('panel-story'), data, '這趟旅程的故事還在書寫中…');
}

async function loadNotes() {
  const { data } = await supabase
    .from('posts')
    .select('post_type, title, content, post_date')
    .eq('trip_id', tripId)
    .eq('status', 'published')
    .eq('post_type', 'summary')
    .order('post_date', { nullsFirst: true });
  renderPosts(document.getElementById('panel-notes'), data, '旅行筆記還沒寫好，回來再看看吧。');
}

function renderPosts(el, posts, emptyText) {
  el.innerHTML = posts?.length
    ? posts.map(p => `
      <article class="post">
        <h3>${esc(p.title ?? POST_TYPE_LABEL[p.post_type])}</h3>
        <div class="post-date">${esc(POST_TYPE_LABEL[p.post_type])}${p.post_date ? `・${esc(p.post_date.replaceAll('-', '.'))}` : ''}</div>
        <div class="post-body">${textToHtml(p.content ?? '')}</div>
      </article>`).join('')
    : `<p class="empty-note">${emptyText}</p>`;
}

async function loadPlan() {
  const el = document.getElementById('panel-plan');
  const [flights, stays, cards, stayPhotos] = await Promise.all([
    supabase.from('flights')
      .select('segment_order, airline, flight_no, depart_airport, arrive_airport, depart_time, arrive_time, layover_info, transfer_type, ticket_type, notes')
      .eq('trip_id', tripId).order('segment_order'),
    supabase.from('stays')
      .select('id, name, google_place_id, address, check_in, check_out, notes')
      .eq('trip_id', tripId).order('check_in', { nullsFirst: false }).order('created_at'),
    supabase.from('transport_cards')
      .select('card_type, title, content, cost_note')
      .eq('trip_id', tripId).order('sort_order'),
    // 住宿介紹照片（RLS 已確保只回傳「該住宿已公開」的照片）
    supabase.from('photos')
      .select('src_url, caption, stay_id')
      .eq('trip_id', tripId).not('stay_id', 'is', null).order('sort_order'),
  ]);

  const photosByStay = {};
  for (const p of stayPhotos.data ?? []) {
    (photosByStay[p.stay_id] ??= []).push(p);
  }
  const stayGallery = stayId => {
    const list = photosByStay[stayId];
    if (!list?.length) return '';
    return `<div class="stay-photos">${list.map(p => `
      <figure>
        <img src="${esc(p.src_url)}" alt="${esc(p.caption ?? '住宿照片')}" loading="lazy">
        ${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}
      </figure>`).join('')}</div>`;
  };

  const fmtTime = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const flightHtml = flights.data?.length ? `
    <h3>✈ 航班</h3>
    ${flights.data.map(fl => `
      <div class="item-card">
        <strong>${esc(fl.airline ?? '')} ${esc(fl.flight_no ?? '')}</strong>
        ${fl.transfer_type ? `<span class="chip">${esc(fl.transfer_type)}</span>` : ''}
        ${fl.ticket_type ? `<span class="chip">${esc(fl.ticket_type)}</span>` : ''}
        <div class="sub">${esc(fl.depart_airport ?? '')} → ${esc(fl.arrive_airport ?? '')}
          ${fl.depart_time ? `｜${fmtTime(fl.depart_time)} 起飛` : ''}${fl.arrive_time ? `，${fmtTime(fl.arrive_time)} 抵達` : ''}</div>
        ${fl.layover_info ? `<div class="sub">轉機：${esc(fl.layover_info)}</div>` : ''}
        ${fl.notes ? `<div class="sub">${esc(fl.notes)}</div>` : ''}
      </div>`).join('')}` : '';

  const stayHtml = stays.data?.length ? `
    <h3>🏠 住宿</h3>
    ${stays.data.map(s => `
      <div class="item-card">
        <strong>${esc(s.name)}</strong>
        <div class="sub">${esc(s.check_in ?? '')} 入住 – ${esc(s.check_out ?? '')} 退房</div>
        ${s.address ? `<div class="sub">${esc(s.address)}</div>` : ''}
        ${s.notes ? `<div class="sub">${esc(s.notes)}</div>` : ''}
        ${stayGallery(s.id)}
        <a class="maps-link" href="${esc(mapsUrl(s))}" target="_blank" rel="noopener">🗺 在 Google Maps 開啟</a>
      </div>`).join('')}` : '';

  const cardHtml = cards.data?.length ? `
    <h3>🚙 交通</h3>
    ${cards.data.map(c => `
      <div class="item-card callout">
        <span class="chip">${esc(c.card_type)}</span> <strong>${esc(c.title)}</strong>
        ${c.content ? `<div class="sub">${textToHtml(c.content)}</div>` : ''}
        ${c.cost_note ? `<div class="sub">費用參考：${esc(c.cost_note)}</div>` : ''}
      </div>`).join('')}` : '';

  const html = flightHtml + stayHtml + cardHtml;
  el.innerHTML = html
    ? `<div class="itinerary">${html}</div>`
    : '<p class="empty-note">行程還在規劃中…</p>';
}

async function loadPhotos() {
  const el = document.getElementById('panel-photos');
  const { data } = await supabase
    .from('photos')
    .select('src_url, caption, taken_on')
    .eq('trip_id', tripId)
    .order('taken_on', { nullsFirst: false })
    .order('sort_order');
  el.innerHTML = data?.length
    ? `<div class="polaroid-grid">${data.map(p => `
        <figure class="polaroid" style="margin:0">
          <img src="${esc(p.src_url)}" alt="${esc(p.caption ?? '旅行照片')}" loading="lazy">
          <figcaption>
            <div class="place">${esc(p.caption ?? '')}</div>
            <div class="meta"><span></span><span>${esc(p.taken_on?.replaceAll('-', '.') ?? '')}</span></div>
          </figcaption>
        </figure>`).join('')}</div>`
    : '<p class="empty-note">照片還在沖洗中…📷</p>';
}

init();
