// 首頁：公開旅程 → Hero 大圖＋拍立得卡片
import { supabase, esc, ym, tripImage } from './front-client.js';

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
