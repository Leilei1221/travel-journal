// 旅程內頁：per-trip 主題色＋四頁籤（故事/行程/照片/筆記）
// 只查公開表；私人表（*_private、expenses）永不撈取
import { supabase, esc, textToHtml, dateRange, mapsUrl } from './front-client.js?v=7';

const POST_TYPE_LABEL = { pretrip: '行前情報', daily: '每日遊記', summary: '旅程總結' };

const tripId = new URLSearchParams(location.search).get('id');

async function init() {
  if (!tripId) return showMissing();

  const { data: trip } = await supabase
    .from('trips')
    .select('id, title, destination, start_date, end_date, status, cover_photo_url, theme, bg_image_url')
    .eq('id', tripId)
    .eq('is_public', true)
    .maybeSingle();
  if (!trip) return showMissing();

  // 套用主題色（骨架不變、換皮膚）
  for (const [k, v] of Object.entries(trip.theme ?? {})) {
    if (k.startsWith('--')) document.documentElement.style.setProperty(k, v);
  }
  // 專屬背景插畫（Phase 3 生成；未設定則用預設 bg-doodle）
  if (trip.bg_image_url) {
    document.documentElement.style.setProperty('--bg-image', `url("${trip.bg_image_url}")`);
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
    .select('id, post_type, title, content, post_date')
    .eq('trip_id', tripId)
    .eq('status', 'published')
    .in('post_type', ['pretrip', 'daily'])
    .order('post_date', { nullsFirst: true });
  await renderPosts(document.getElementById('panel-story'), data, '這趟旅程的故事還在書寫中…');
}

async function loadNotes() {
  const { data } = await supabase
    .from('posts')
    .select('id, post_type, title, content, post_date')
    .eq('trip_id', tripId)
    .eq('status', 'published')
    .eq('post_type', 'summary')
    .order('post_date', { nullsFirst: true });
  await renderPosts(document.getElementById('panel-notes'), data, '旅行筆記還沒寫好，回來再看看吧。');
}

// 取這些文章的配圖，依 post_id 分組
async function postPhotoMap(postIds) {
  if (!postIds.length) return {};
  const { data } = await supabase
    .from('photos').select('src_url, caption, post_id')
    .eq('trip_id', tripId).in('post_id', postIds).order('sort_order');
  const map = {};
  for (const p of data ?? []) (map[p.post_id] ??= []).push(p);
  return map;
}

function postPhotosHtml(list) {
  if (!list?.length) return '';
  return `<div class="post-photos">${list.map(p => `
    <figure>
      <img src="${esc(p.src_url)}" alt="${esc(p.caption ?? '文章配圖')}" loading="lazy">
      ${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}
    </figure>`).join('')}</div>`;
}

async function renderPosts(el, posts, emptyText) {
  if (!posts?.length) { el.innerHTML = `<p class="empty-note">${emptyText}</p>`; return; }
  const photoMap = await postPhotoMap(posts.map(p => p.id));
  el.innerHTML = posts.map(p => `
      <article class="post">
        <h3>${esc(p.title ?? POST_TYPE_LABEL[p.post_type])}</h3>
        <div class="post-date">${esc(POST_TYPE_LABEL[p.post_type])}${p.post_date ? `・${esc(p.post_date.replaceAll('-', '.'))}` : ''}</div>
        <div class="post-body">${textToHtml(p.content ?? '')}</div>
        ${postPhotosHtml(photoMap[p.id])}
      </article>`).join('');
}

// 行程項目的 Google Maps 連結：有 place_id 用 place_id，否則座標，否則地點名稱搜尋
function itineraryMapsUrl(item) {
  if (item.google_place_id) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.place_name)}&query_place_id=${encodeURIComponent(item.google_place_id)}`;
  }
  if (item.lat != null && item.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.place_name)}`;
}

// 相鄰兩站的 Google Maps 路線連結（預設大眾運輸；與後臺 itinerary.js 一致）
function itineraryRouteUrl(from, to) {
  const point = p => p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : encodeURIComponent(p.place_name);
  return `https://www.google.com/maps/dir/?api=1&origin=${point(from)}&destination=${point(to)}&travelmode=transit`;
}

async function loadPlan() {
  const el = document.getElementById('panel-plan');
  const [flights, stays, cards, stayPhotos, itinerary] = await Promise.all([
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
    supabase.from('itinerary_items')
      .select('item_date, time_label, place_name, notes, lat, lng, google_place_id')
      .eq('trip_id', tripId).order('item_date', { nullsFirst: false }).order('sort_order'),
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

  // 每日時間線（依日期分組；無日期的項目歸在「未定日期」）
  const dayGroups = new Map();
  for (const it of itinerary.data ?? []) {
    const key = it.item_date || '未定日期';
    if (!dayGroups.has(key)) dayGroups.set(key, []);
    dayGroups.get(key).push(it);
  }
  const timelineHtml = dayGroups.size ? `
    <h3>🗓 每日行程</h3>
    ${[...dayGroups.entries()].map(([date, items]) => `
      <div class="timeline-day">
        <h4 class="timeline-day-title">${esc(date === '未定日期' ? date : date.replaceAll('-', '.'))}</h4>
        <div class="timeline">
          ${items.map((it, i) => `
            <div class="timeline-item">
              ${it.time_label ? `<span class="timeline-time">${esc(it.time_label)}</span>` : ''}
              <div class="timeline-body">
                <strong>${esc(it.place_name)}</strong>
                ${it.notes ? `<div class="sub">${esc(it.notes)}</div>` : ''}
                <a class="maps-link" href="${esc(itineraryMapsUrl(it))}" target="_blank" rel="noopener">🗺 在 Google Maps 開啟</a>
                ${i < items.length - 1 ? `<a class="maps-link route" href="${esc(itineraryRouteUrl(it, items[i + 1]))}" target="_blank" rel="noopener">🚇 前往下一站路線</a>` : ''}
              </div>
            </div>`).join('')}
        </div>
      </div>`).join('')}` : '';

  const html = timelineHtml + flightHtml + stayHtml + cardHtml;
  el.innerHTML = html
    ? `<div class="itinerary">${html}</div>`
    : '<p class="empty-note">行程還在規劃中…</p>';
}

// 打卡位置連結：有 GPS 座標用座標精準定位，否則用名稱搜尋
function photoLocation(p) {
  const hasCoords = p.lat != null && p.lng != null;
  if (!hasCoords && !p.location_name) return '';
  const url = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.location_name)}`;
  return `<a class="photo-loc" href="${esc(url)}" target="_blank" rel="noopener">📍 ${esc(p.location_name ?? '打卡點')}</a>`;
}

function polaroidHtml(p) {
  return `
    <figure class="polaroid" style="margin:0">
      <img src="${esc(p.src_url)}" alt="${esc(p.caption ?? '旅行照片')}" loading="lazy">
      <figcaption>
        <div class="place">${esc(p.caption ?? '')}</div>
        <div class="meta"><span>${photoLocation(p)}</span><span>${esc(p.taken_on?.replaceAll('-', '.') ?? '')}</span></div>
      </figcaption>
    </figure>`;
}

const FEATURED_PER_GROUP = 2; // 每個打卡點預設精選張數

async function loadPhotos() {
  const el = document.getElementById('panel-photos');
  // 照片牆只收「未關聯住宿、未配圖到文章」的照片（那些已在住宿卡相簿 / 文章內顯示）
  const { data } = await supabase
    .from('photos')
    .select('src_url, caption, taken_on, location_name, lat, lng, is_featured')
    .eq('trip_id', tripId)
    .is('stay_id', null)
    .is('post_id', null)
    .order('taken_on', { nullsFirst: false })
    .order('sort_order');

  if (!data?.length) { el.innerHTML = '<p class="empty-note">照片還在沖洗中…📷</p>'; return; }

  // 依打卡地點分組（無地點 → 其他），精選照排前面
  const groups = new Map();
  for (const p of data) {
    const key = p.location_name || '其他';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  for (const list of groups.values()) list.sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0));

  let gi = 0;
  el.innerHTML = [...groups.entries()].map(([loc, list]) => {
    const shown = list.slice(0, FEATURED_PER_GROUP);
    const hidden = list.slice(FEATURED_PER_GROUP);
    const gid = `pg-${gi++}`;
    return `
      <section class="photo-group">
        <h3 class="photo-group-title">📍 ${esc(loc)} <span class="muted">（${list.length} 張）</span></h3>
        <div class="polaroid-grid">${shown.map(polaroidHtml).join('')}</div>
        ${hidden.length ? `
          <div class="polaroid-grid photo-more" id="${gid}" hidden>${hidden.map(polaroidHtml).join('')}</div>
          <button type="button" class="btn-more" data-target="${gid}">＋ 展開其餘 ${hidden.length} 張</button>
        ` : ''}
      </section>`;
  }).join('');

  el.querySelectorAll('.btn-more').forEach(btn => {
    btn.addEventListener('click', () => {
      const more = document.getElementById(btn.dataset.target);
      more.hidden = false;
      btn.remove();
    });
  });
}

init();
