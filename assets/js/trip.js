// 旅程內頁：per-trip 主題色＋四頁籤（故事/行程/照片/筆記）
// 只查公開表；私人表（*_private、expenses）永不撈取
import { supabase, esc, textToHtml, dateRange, mapsUrl } from './front-client.js?v=12';
import { buildDailyTimeline, dayLabel, routeUrl, itemMapsUrl, localDateStr } from './day-timeline.js?v=12';

const POST_TYPE_LABEL = { pretrip: '行前情報', daily: '每日遊記', summary: '旅程總結' };

const tripId = new URLSearchParams(location.search).get('id');
let tripObj = null;

async function init() {
  if (!tripId) return showMissing();

  const { data: trip } = await supabase
    .from('trips')
    .select('id, title, destination, start_date, end_date, status, cover_photo_url, theme, bg_image_url')
    .eq('id', tripId)
    .eq('is_public', true)
    .maybeSingle();
  if (!trip) return showMissing();
  tripObj = trip;

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

// 取這些文章「有段落錨點」的配圖，依 post_id → 段落索引 分組（圖文穿插用）
// 沒指定段落的配圖不在此，改由照片牆呈現（回退）
async function postPhotoMap(postIds) {
  if (!postIds.length) return {};
  const { data } = await supabase
    .from('photos').select('src_url, caption, post_id, post_paragraph, is_featured, location_name')
    .eq('trip_id', tripId).in('post_id', postIds).not('post_paragraph', 'is', null).order('sort_order');
  const map = {};
  for (const p of data ?? []) {
    const byPara = (map[p.post_id] ??= new Map());
    const idx = p.post_paragraph;
    if (!byPara.has(idx)) byPara.set(idx, []);
    byPara.get(idx).push(p);
  }
  return map;
}

// 每個段落錨點最多 1–2 張精選；同地點重複不全放（與小書一致）
function pickInline(list) {
  const sorted = [...list].sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0));
  const picked = [], seen = new Set();
  for (const p of sorted) { if (picked.length >= 2) break; const l = p.location_name || ''; if (l && seen.has(l)) continue; picked.push(p); seen.add(l); }
  for (const p of sorted) { if (picked.length >= 2) break; if (!picked.includes(p)) picked.push(p); }
  return picked;
}

function postPhotosHtml(list) {
  const picked = pickInline(list ?? []);
  if (!picked.length) return '';
  return `<div class="post-photos">${picked.map(p => `
    <figure>
      <img src="${esc(p.src_url)}" alt="${esc(p.caption ?? '文章配圖')}" loading="lazy">
      ${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}
    </figure>`).join('')}</div>`;
}

const PREVIEW_PARAS = 3; // 長文預設顯示段數，其餘收在「閱讀全文」

async function renderPosts(el, posts, emptyText) {
  if (!posts?.length) { el.innerHTML = `<p class="empty-note">${emptyText}</p>`; return; }
  const photoMap = await postPhotoMap(posts.map(p => p.id));
  el.innerHTML = posts.map(p => {
    const paras = (textToHtml(p.content ?? '').match(/<p>.*?<\/p>/gs)) ?? [];
    const anchors = photoMap[p.id] ?? new Map();
    // 圖文穿插：段落後插入該錨點照片
    const segs = paras.map((para, i) => para + (anchors.has(i) ? postPhotosHtml(anchors.get(i)) : ''));
    // 文末照片：錨點索引 ≥ 段數（含 null/文末）
    const endList = [...anchors.entries()].filter(([idx]) => idx >= paras.length).flatMap(([, v]) => v);
    // 長文：預設只放前幾段，其餘（含文末照片）收進「閱讀全文」
    const clamp = paras.length > PREVIEW_PARAS + 1;
    const bodyHtml = clamp
      ? `<div class="post-body">${segs.slice(0, PREVIEW_PARAS).join('')}</div>
         <div class="post-body post-rest" hidden>${segs.slice(PREVIEW_PARAS).join('')}${postPhotosHtml(endList)}</div>
         <button type="button" class="btn-more post-toggle" aria-expanded="false"
           data-more="閱讀全文（還有 ${paras.length - PREVIEW_PARAS} 段）">閱讀全文（還有 ${paras.length - PREVIEW_PARAS} 段）</button>`
      : `<div class="post-body">${segs.join('')}</div>${postPhotosHtml(endList)}`;
    return `
      <article class="post">
        <h3>${esc(p.title ?? POST_TYPE_LABEL[p.post_type])}</h3>
        <div class="post-date">${esc(POST_TYPE_LABEL[p.post_type])}${p.post_date ? `・${esc(p.post_date.replaceAll('-', '.'))}` : ''}</div>
        ${bodyHtml}
      </article>`;
  }).join('');

  el.querySelectorAll('.post-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const rest = btn.closest('.post').querySelector('.post-rest');
      const show = rest.hidden;
      rest.hidden = !show;
      btn.setAttribute('aria-expanded', String(show));
      btn.textContent = show ? '收合' : btn.dataset.more;
    });
  });
}

async function loadPlan() {
  const el = document.getElementById('panel-plan');
  const [flights, stays, cards, stayPhotos, itinerary] = await Promise.all([
    supabase.from('flights')
      .select('airline, flight_no, depart_airport, arrive_airport, depart_time, arrive_time, layover_info, transfer_type, ticket_type')
      .eq('trip_id', tripId),
    supabase.from('stays')
      .select('id, name, google_place_id, address, check_in, check_out, notes')
      .eq('trip_id', tripId).order('check_in', { nullsFirst: false }).order('created_at'),
    supabase.from('transport_cards')
      .select('card_type, title, content, cost_note')
      .eq('trip_id', tripId).order('sort_order'),
    supabase.from('photos')
      .select('src_url, caption, stay_id')
      .eq('trip_id', tripId).not('stay_id', 'is', null).order('sort_order'),
    supabase.from('itinerary_items')
      .select('item_date, time_label, place_name, notes, lat, lng, google_place_id, sort_order')
      .eq('trip_id', tripId),
  ]);

  const photosByStay = {};
  for (const p of stayPhotos.data ?? []) (photosByStay[p.stay_id] ??= []).push(p);
  const stayGallery = stayId => {
    const list = photosByStay[stayId];
    if (!list?.length) return '';
    return `<div class="stay-photos">${list.map(p => `
      <figure><img src="${esc(p.src_url)}" alt="${esc(p.caption ?? '住宿照片')}" loading="lazy">
        ${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>`).join('')}</div>`;
  };
  const fmtT = iso => { const d = new Date(iso); const p = n => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}`; };

  // 交通卡片（非按日）獨立區塊
  const cardHtml = cards.data?.length ? `
    <section class="plan-transport"><h3>🚙 交通</h3>
    ${cards.data.map(c => `<div class="item-card callout">
      <span class="chip">${esc(c.card_type)}</span> <strong>${esc(c.title)}</strong>
      ${c.content ? `<div class="sub">${textToHtml(c.content)}</div>` : ''}
      ${c.cost_note ? `<div class="sub">費用參考：${esc(c.cost_note)}</div>` : ''}</div>`).join('')}</section>` : '';

  const staysById = Object.fromEntries((stays.data ?? []).map(s => [s.id, s]));
  const days = buildDailyTimeline(tripObj, flights.data, stays.data, itinerary.data);

  // 缺旅程起訖日 → 退回簡易列表（航班/住宿/交通）
  if (!days) {
    const flat = (flights.data ?? []).map(f => `<div class="item-card"><strong>✈ ${esc(f.airline ?? '')} ${esc(f.flight_no ?? '')}</strong>
      <div class="sub">${esc(f.depart_airport ?? '')} → ${esc(f.arrive_airport ?? '')}</div></div>`).join('')
      + (stays.data ?? []).map(s => `<div class="item-card"><strong>🏠 ${esc(s.name)}</strong>
      <div class="sub">${esc(s.check_in ?? '')} 入住 – ${esc(s.check_out ?? '')} 退房</div>${stayGallery(s.id)}</div>`).join('');
    el.innerHTML = (flat || cardHtml) ? `<div class="itinerary">${flat}${cardHtml}</div>` : '<p class="empty-note">行程還在規劃中…（填好旅程起訖日期即可自動展開每日時間軸）</p>';
    return;
  }

  const daysWithContent = days.filter(d => d.flights.length || d.stays.length || d.items.length);
  const dayHtml = daysWithContent.map(d => {
    const { md, week } = dayLabel(d.date);
    // 航班＋景點依時間合併；景點之間才給「前往下一站」
    const items = d.items;
    const entries = [
      ...d.flights.map(f => ({ t: new Date(f.depart_time).getHours() * 60 + new Date(f.depart_time).getMinutes(), html: `
        <div class="timeline-item flight">
          <span class="timeline-time">${f.depart_time ? esc(fmtT(f.depart_time)) : ''}</span>
          <div class="timeline-body"><strong>✈ ${esc(f.airline ?? '')} ${esc(f.flight_no ?? '')}</strong>
            <div class="sub">${esc(f.depart_airport ?? '')} → ${esc(f.arrive_airport ?? '')}${f.arrive_time ? `，${esc(fmtT(f.arrive_time))} 抵達` : ''}</div>
            ${f.layover_info ? `<div class="sub">轉機：${esc(f.layover_info)}</div>` : ''}</div>
        </div>` })),
      ...items.map((it, i) => {
        const m = /(\d{1,2}):(\d{2})/.exec(it.time_label ?? '');
        const t = m ? Number(m[1]) * 60 + Number(m[2]) : 24 * 60 + 1 + (it.sort_order || 0);
        return { t, html: `
          <div class="timeline-item">
            ${it.time_label ? `<span class="timeline-time">${esc(it.time_label)}</span>` : '<span class="timeline-time"></span>'}
            <div class="timeline-body"><strong>${esc(it.place_name)}</strong>
              ${it.notes ? `<div class="sub">${esc(it.notes)}</div>` : ''}
              <a class="maps-link" href="${esc(itemMapsUrl(it))}" target="_blank" rel="noopener">🗺 在 Google Maps 開啟</a>
              ${i < items.length - 1 ? `<a class="maps-link route" href="${esc(routeUrl(it, items[i + 1]))}" target="_blank" rel="noopener">🚇 前往下一站路線</a>` : ''}</div>
          </div>` };
      }),
    ].sort((a, b) => a.t - b.t);

    const stayBadge = d.stays.map(s => `<div class="plan-stay">🏠 今晚入住 <strong>${esc(s.name)}</strong>
      <span class="sub">入住 ${esc(s.check_in)} ～ 退房 ${esc(s.check_out ?? '?')}</span>
      <a class="maps-link" href="${esc(mapsUrl(staysById[s.id] ?? s))}" target="_blank" rel="noopener">🗺 開啟</a>
      ${stayGallery(s.id)}</div>`).join('');

    return `<section class="plan-day">
      <h3 class="plan-day-head">第 ${d.index} 天 <span class="muted">${md} ${week}</span></h3>
      ${stayBadge}
      <div class="timeline">${entries.map(e => e.html).join('')}</div>
    </section>`;
  }).join('');

  el.innerHTML = (dayHtml || cardHtml)
    ? `<div class="itinerary daily">${dayHtml}${cardHtml}</div>`
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
  // 照片牆收「未關聯住宿、且未釘到文章段落」的照片
  //（住宿照在住宿卡相簿；有段落錨點的照片已穿插在文章內；沒指定段落者回退到此）
  const { data } = await supabase
    .from('photos')
    .select('src_url, caption, taken_on, location_name, lat, lng, is_featured')
    .eq('trip_id', tripId)
    .is('stay_id', null)
    .is('post_paragraph', null)
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
          <button type="button" class="btn-more" data-target="${gid}" data-total="${list.length}" aria-expanded="false">看全部 ${list.length} 張</button>
        ` : ''}
      </section>`;
  }).join('');

  // 展開/收合切換（按鈕保留，可再收回）
  el.querySelectorAll('.btn-more').forEach(btn => {
    btn.addEventListener('click', () => {
      const more = document.getElementById(btn.dataset.target);
      const show = more.hidden;
      more.hidden = !show;
      btn.setAttribute('aria-expanded', String(show));
      btn.textContent = show ? '收合' : `看全部 ${btn.dataset.total} 張`;
    });
  });
}

init();
