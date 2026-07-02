// Supabase 初始化 — 只放公開 publishable key（anon 等級，受 RLS 保護）
// Gemini 等付費金鑰依 PLAN.md §4 絕不進前端，只放 Edge Function 環境變數。
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://xifaxliaarxxmvuqcpav.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_RZiyLvWMs9dZ5etPv4CHuw_CT-h0hAO';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 共用小工具
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// timestamptz(ISO) ↔ <input type="datetime-local">（以使用者本地時區呈現）
export function isoToLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localToIso(local) {
  return local ? new Date(local).toISOString() : null;
}

export function toast(msg, isError = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' toast-error' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
