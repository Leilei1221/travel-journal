// 前臺唯讀 Supabase client — 只用公開 anon key，只查公開資料
// 鐵則（PLAN.md §4）：永不 select *_private 表與 expenses（RLS 亦於資料庫層阻擋）
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const supabase = createClient(
  'https://xifaxliaarxxmvuqcpav.supabase.co',
  'sb_publishable_RZiyLvWMs9dZ5etPv4CHuw_CT-h0hAO'
);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// 純文字內容 → 段落 HTML（跳脫後才換行）
export function textToHtml(s) {
  return esc(s).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

export function ym(dateStr) {
  return dateStr ? dateStr.slice(0, 7).replace('-', '.') : '';
}

export function dateRange(a, b) {
  const f = d => d ? d.replaceAll('-', '.') : '';
  return a || b ? `${f(a)} – ${f(b)}` : '';
}

// Google Maps 通用連結（與後臺 stays.js 同邏輯）
export function mapsUrl(stay) {
  return stay.google_place_id
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stay.name)}&query_place_id=${encodeURIComponent(stay.google_place_id)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([stay.name, stay.address].filter(Boolean).join(' '))}`;
}

// 取旅程代表圖：封面照優先，否則該旅程第一張照片
export async function tripImage(trip) {
  if (trip.cover_photo_url) return trip.cover_photo_url;
  const { data } = await supabase
    .from('photos')
    .select('src_url')
    .eq('trip_id', trip.id)
    .order('taken_on', { nullsFirst: false })
    .order('sort_order')
    .limit(1);
  return data?.[0]?.src_url ?? null;
}
