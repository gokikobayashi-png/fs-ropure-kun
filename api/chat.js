// POST /api/chat  { persona, history:[{who:"me"|"them", text}], message? }
// → { reply }  テキストチャット版ロープレ。社長役の次の発言を1回分返す。
// message が空なら「商談開始」の最初のひとことを返す。
import { client, auth, readJson, personaSystemInstruction, generate, loadKnowledge, knowledgeText } from "./_lib.js";

const KICKOFF = "（商談が始まった。営業担当が着席した。あなたから「本日はよろしくお願いします」と軽く挨拶し、続けて自分の課題認識をひとことで話して、相手の出方を待つ）";
const CHAT_NOTE = "\n\n■ 今回はテキストチャットでの商談。話し言葉のまま短く返す（2〜3文）。ト書き・括弧書きの動作描写・名前の見出しは付けず、セリフだけを書く。";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!auth(req, res)) return;
  try {
    const { persona, history = [], message = "" } = await readJson(req);
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
      config: { systemInstruction: personaSystemInstruction(persona, knowledge) + CHAT_NOTE, temperature: 0.8 },
    });
    const reply = (r.text || "").trim().replace(/^[「『]|[」』]$/g, "");
    if (!reply) throw new Error("相手の返事を作れませんでした。もう一度送ってください");
    res.status(200).json({ reply });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
