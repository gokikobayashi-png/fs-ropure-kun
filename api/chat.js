// POST /api/chat  { persona, history:[{who:"me"|"them", text}], message? }
// → { reply }  テキストチャット版ロープレ。相手役の次の発言を1回分返す。
// 会話は営業担当（受講者）から始める。
import { client, auth, readJson, personaSystemInstruction, generate, loadKnowledge, knowledgeText, QUIZ_RULES, QUIZ_SHAPE } from "./_lib.js";

const KICKOFF = "（商談が始まった。営業担当が着席して、先に話しかけてきた）";
const CHAT_NOTE = "\n\n■ 今回はテキストチャットでの商談。話し言葉のまま短く返す（2〜3文）。ト書き・括弧書きの動作描写・名前の見出しは付けず、セリフだけを書く。";
const QUIZ_NOTE = `

■ 出力形式（JSONだけを返す）
{"reply":"あなたのセリフ（上の話し方のルール通り）","quiz":${QUIZ_SHAPE} または null, "asked":["これまでに出した暗算チェックの要点"]}
reply を書いたあと、営業担当の練習用に「暗算チェック」を付ける。あなた（相手役）はこのチェックの存在を知らない体で、reply には一切触れない。
${QUIZ_RULES}
- 「これまでに出した暗算チェック」：${"__ASKED__"}`;

export function normalizeQuiz(q) {
  if (!q || typeof q !== "object" || !q.question) return null;
  const answer = Number(q.answer);
  if (!isFinite(answer)) return null;
  return { question: String(q.question), answer, unit: String(q.unit || ""), calc: (Array.isArray(q.calc) ? q.calc : []).map(String), mental: (Array.isArray(q.mental) ? q.mental : []).map(String), kind: String(q.kind || "") };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!auth(req, res)) return;
  try {
    const { persona, history = [], message = "", company = null, asked = [] } = await readJson(req);
    if (!persona || !persona.company) return res.status(400).json({ error: "persona が必要です" });

    let knowledge = "";
    try { knowledge = knowledgeText(await loadKnowledge(), 6000); } catch (e) { console.error(e); }

    // 会話を Gemini の形に。最初は必ず user（開始の合図）から始める
    const contents = [{ role: "user", parts: [{ text: KICKOFF }] }];
    for (const t of history.slice(-60)) {
      const text = String(t.text || "").trim();
      if (!text) continue;
      const role = t.who === "me" ? "user" : "model";
      const last = contents[contents.length - 1];
      if (last.role === role) last.parts[0].text += "\n" + text; // 同じ話者が続いたらまとめる
      else contents.push({ role, parts: [{ text }] });
    }
    const msg = String(message).trim();
    if (msg) {
      const last = contents[contents.length - 1];
      if (last.role === "user") last.parts[0].text += "\n" + msg;
      else contents.push({ role: "user", parts: [{ text: msg }] });
    }
    if (contents[contents.length - 1].role !== "user") return res.status(400).json({ error: "送る発言がありません" });

    const ai = client();
    const r = await generate(ai, {
      contents,
      config: { systemInstruction: personaSystemInstruction(persona, knowledge, company) + CHAT_NOTE + QUIZ_NOTE.replace("__ASKED__", (Array.isArray(asked) && asked.length ? asked.map(String).slice(-8).join("／") : "（まだ無い）")), temperature: 0.8, responseMimeType: "application/json" },
    });
    const t = (r.text || "").trim();
    let reply = "", quiz = null;
    try {
      const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
      reply = String(j.reply || "").trim();
      quiz = normalizeQuiz(j.quiz);
    } catch (_) { reply = t.replace(/^[「『]|[」』]$/g, ""); }
    reply = reply.replace(/^[「『]|[」』]$/g, "");
    if (!reply) throw new Error("相手の返事を作れませんでした。もう一度送ってください");
    res.status(200).json({ reply, quiz });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
