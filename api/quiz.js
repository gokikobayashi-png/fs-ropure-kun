// POST /api/quiz  { persona, transcript:[{who,text}] }
// → { quizzes:[…] }  音声ロープレの文字起こしから、商談で出た数字の暗算チェックをまとめて作る（商談終了後に出す）
import { client, auth, readJson, generate, CAT, QUIZ_RULES, QUIZ_SHAPE } from "./_lib.js";
import { normalizeQuiz } from "./chat.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!auth(req, res)) return;
  try {
    const { persona, transcript = [] } = await readJson(req);
    if (!persona || !persona.company) return res.status(400).json({ error: "persona が必要です" });
    const log = transcript.map(t => (t.who === "me" ? "営業担当" : persona.name) + "：" + t.text).join("\n");
    if (!/\d|[一二三四五六七八九十百千万億]/.test(log)) return res.status(200).json({ quizzes: [] });
    const prompt = `以下は営業代行の初回商談（音声の文字起こし。多少の誤変換あり）。営業担当（受講者）は数字が苦手なので、商談後の練習として「商談中に頭の中で計算すべきだった数字」を暗算チェックにする。

${QUIZ_RULES}
- 会話の流れで登場した順に、最大5問。相手（${persona.name}）が言った数字だけを使う。
- 1問ごとに、その数字が出た相手の発言を quote に20字以内で引く。

【相手の事実（参考。会話に出ていない数字は使わない）】${(persona.hidden_facts || []).join("／")}
【正解の分類】${CAT[persona.answer] || ""}
【会話ログ】
${log.slice(0, 30000)}

JSONだけを返す：{"quizzes":[${QUIZ_SHAPE.slice(0, -1)},"quote":"相手の発言の引用"}]}`;
    const ai = client();
    const r = await generate(ai, { contents: prompt, config: { responseMimeType: "application/json", temperature: 0.3 } });
    const t = r.text || "";
    let quizzes = [];
    try { const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); quizzes = (Array.isArray(j.quizzes) ? j.quizzes : []).map(q => { const n = normalizeQuiz(q); if (n) n.quote = String(q.quote || ""); return n; }).filter(Boolean).slice(0, 5); } catch (_) {}
    res.status(200).json({ quizzes });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
