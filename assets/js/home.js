// 首頁：公開旅程 → Hero 大圖＋拍立得卡片
import { supabase, esc, ym, tripImage } from './front-client.js?v=14';

const STATUS_LABEL = { planning: '規劃中', traveling: '旅途中' };

async function init() {
  const { data: trips, error } = await supabase
    .from('trips')
    .select('id, title, destination, start_date, end_date, status, cover_photo_url')
    .eq('is_public', true)
    .order('start_date', { ascending: false, nullsFirst: false });

  const grid = document.getElementById('trip-cards');
  if (error || !trips?.length) {
    grid.innerHTML = '<p class="empty-note">旅行紀錄整理中，先去泡杯茶吧 ☕</p>';
    return;
  }

  // Hero 大圖：最新旅程的代表圖；還沒有照片時改單欄版面
  const heroImg = document.getElementById('hero-img');
  const heroSrc = await tripImage(trips[0]);
  if (heroSrc) {
    heroImg.src = heroSrc;
    heroImg.alt = `${trips[0].title} 的旅行照片`;
  } else {
    document.querySelector('.hero-photo').hidden = true;
    document.querySelector('.hero').classList.add('no-photo');
  }

  // 拍立得卡片（圖片逐一補齊，先渲染骨架避免版面跳動）
  grid.innerHTML = trips.map(t => `
    <a class="polaroid" href="trip.html?id=${t.id}" data-id="${t.id}">
      <img alt="${esc(t.title)}" loading="lazy">
      <figcaption>
        <div class="place">${esc(t.title)}</div>
        <div class="meta">
          <span>${esc(t.destination ?? '')}</span>
          <span>${STATUS_LABEL[t.status] ? `<span class="badge-plan">${STATUS_LABEL[t.status]}</span>` : ym(t.start_date)}</span>
        </div>
      </figcaption>
    </a>`).join('');

  await Promise.all(trips.map(async t => {
    const src = await tripImage(t);
    const img = grid.querySelector(`[data-id="${t.id}"] img`);
    if (src) img.src = src;
    else img.replaceWith(Object.assign(document.createElement('div'), {
      className: 'photo-placeholder',
      textContent: '📷 照片沖洗中…',
    }));
  }));
}

init();

// ── 旅行地圖燈箱：拖曳平移＋雙指縮放（手機地名小，縮放是必要功能）──
function initMapLightbox() {
  const box = document.getElementById('map-lightbox');
  const stage = document.getElementById('map-stage');
  const img = document.getElementById('map-full');
  const openBtn = document.getElementById('open-map');
  const closeBtn = document.getElementById('map-close');
  if (!box || !openBtn) return;

  const MAX_FACTOR = 6;          // 最大放大倍數（相對「剛好塞滿」）
  let scale = 1, minScale = 1, tx = 0, ty = 0;
  const pointers = new Map();    // Pointer Events 同時涵蓋滑鼠與觸控
  let lastDist = 0;
  let moved = false;

  const apply = () => { img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; };

  const clamp = () => {
    scale = Math.min(Math.max(scale, minScale), minScale * MAX_FACTOR);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    const sw = stage.clientWidth, sh = stage.clientHeight;
    tx = w <= sw ? (sw - w) / 2 : Math.min(0, Math.max(sw - w, tx)); // 小圖置中、大圖不留白邊
    ty = h <= sh ? (sh - h) / 2 : Math.min(0, Math.max(sh - h, ty));
  };

  const fit = () => {
    minScale = Math.min(stage.clientWidth / img.naturalWidth, stage.clientHeight / img.naturalHeight);
    scale = minScale;
    tx = ty = 0;
    clamp();
    apply();
  };

  const zoomAt = (cx, cy, factor) => {
    const next = Math.min(Math.max(scale * factor, minScale), minScale * MAX_FACTOR);
    factor = next / scale;
    tx = cx - (cx - tx) * factor; // 以手勢中心為縮放原點
    ty = cy - (cy - ty) * factor;
    scale = next;
    clamp();
    apply();
  };

  const open = () => {
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    if (img.complete && img.naturalWidth) fit();
    else img.addEventListener('load', fit, { once: true });
    closeBtn.focus();
  };
  const close = () => {
    box.hidden = true;
    document.body.style.overflow = '';
    openBtn.focus();
  };

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (!box.hidden && e.key === 'Escape') close(); });

  stage.addEventListener('pointerdown', e => {
    try { stage.setPointerCapture(e.pointerId); } catch { /* capture 失敗不影響手勢追蹤 */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      lastDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
    stage.classList.add('dragging');
  });

  stage.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      tx += dx;
      ty += dy;
      clamp();
      apply();
    } else if (pointers.size === 2) {
      moved = true;
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastDist > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / lastDist);
      lastDist = dist;
    }
  });

  const endPointer = e => {
    pointers.delete(e.pointerId);
    lastDist = 0;
    if (!pointers.size) stage.classList.remove('dragging');
    if (!moved && e.target === stage) close(); // 點圖旁空白處關閉
  };
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  // 桌機滾輪縮放
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1 / 1.2);
  }, { passive: false });

  // 雙擊（雙點）在原尺寸與 2.5 倍之間切換
  stage.addEventListener('dblclick', e => {
    if (scale > minScale * 1.5) fit();
    else zoomAt(e.clientX, e.clientY, (minScale * 2.5) / scale);
  });

  window.addEventListener('resize', () => { if (!box.hidden) fit(); });
}
initMapLightbox();
