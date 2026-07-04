// gemini-draft — Phase 3 AI 功能的唯一入口（PLAN.md §4 鐵則：
// Gemini 金鑰只存在此函式的環境變數；必須登入才能觸發；AI 只產草稿）
// 部署：MCP deploy_edge_function（verify_jwt: true）；本檔為鏡像記錄
import { createClient } from 'npm:@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const COMMON = `
共同要求：
- 繁體中文（臺灣用語），純文字輸出，不要使用任何 Markdown 符號
- 只根據提供的素材書寫，絕不可捏造未提及的事實、店名、價格或心情
- 這是「草稿」，會由主人親自確認與潤飾後才發布`;

const PROMPTS: Record<string, (context: string, notes: string) => string> = {
  // 遊記草稿：口述重點為主軸
  journal: (context, notes) => `你是替個人旅遊網站「Lei's Go!」的主人 Lei 代筆的遊記寫手。
請根據「主人口述重點」寫一篇遊記草稿，「旅程背景資料」僅供對照日期與地點。
${COMMON}
- 第一人稱、溫暖手帳日記的口吻，像在跟朋友分享
- 第一行輸出標題（15 字以內），空一行後寫內文
- 內文約 300–600 字，段落之間空一行

【旅程背景資料】
${context || '（無）'}

【主人口述重點】
${notes}`,

  // 歷史行程回填：把雜亂舊紀錄整理成回顧遊記
  backfill: (context, notes) => `你是替個人旅遊網站「Lei's Go!」的主人 Lei 整理舊旅行紀錄的寫手。
以下是一趟過去旅程的雜亂紀錄（可能混雜航班、住宿、照片說明、隨手備註）。
請把它們整理成一篇完整、有時間脈絡的回顧遊記草稿。
${COMMON}
- 第一人稱回顧口吻，依時間或行程順序組織
- 第一行輸出標題（15 字以內），空一行後寫內文
- 內文約 400–800 字，段落之間空一行

【旅程背景資料】
${context || '（無）'}

【雜亂紀錄】
${notes}`,

  // FB 粉專貼文
  fb: (context, notes) => `你是 Lei 的 FB 粉絲專頁小編。請根據素材寫一則宣傳貼文。
${COMMON}
- 口語親切、帶點俏皮，2–4 個短段落
- 適量 emoji（3–6 個），結尾附 2–3 個中文 hashtag
- 素材若含前臺連結，把連結放在最後一行

【素材】
${notes}

【補充資訊】
${context || '（無）'}`,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    // 鐵則：驗證登入後才可觸發 AI
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: '請先登入後臺再使用 AI 功能' }, 401);

    const { mode, context = '', notes = '' } = await req.json();
    const build = PROMPTS[mode];
    if (!build) return json({ error: `未知的 mode：${mode}` }, 400);
    if (!String(notes).trim()) return json({ error: '請先填入素材' }, 400);

    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: build(String(context), String(notes)) }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 4096 },
        }),
      },
    );
    if (!res.ok) {
      console.error('Gemini API error', res.status, await res.text());
      return json({ error: `Gemini API 錯誤（HTTP ${res.status}），請稍後再試` }, 502);
    }
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? '')
      .join('')
      .trim();
    if (!text) return json({ error: 'AI 沒有產生內容，請調整素材再試一次' }, 502);
    return json({ text });
  } catch (e) {
    console.error(e);
    return json({ error: '伺服器錯誤：' + String(e) }, 500);
  }
});
