// 登入/登出/session 管理（Supabase Auth，email + 密碼）
import { supabase, toast } from './supabase-client.js?v=5';

export function initAuth({ onLogin, onLogout }) {
  const loginForm = document.getElementById('login-form');
  const logoutBtn = document.getElementById('logout-btn');
  const userEmailEl = document.getElementById('user-email');

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email = loginForm.elements.email.value.trim();
    const password = loginForm.elements.password.value;
    const btn = loginForm.querySelector('button');
    btn.disabled = true;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    if (error) toast('登入失敗：' + error.message, true);
  });

  logoutBtn.addEventListener('click', () => supabase.auth.signOut());

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      userEmailEl.textContent = session.user.email;
      onLogin(session);
    } else {
      onLogout();
    }
  });
}
