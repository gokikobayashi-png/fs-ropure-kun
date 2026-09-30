// POST /api/grade  { persona, transcript:[{who:"me"|"them", text}], picked:"A"|"B"|"C"|"D", rephrase }
// → { correct, answer, feedback }
import { client, auth, readJson, FRAMEWORK, ZENTECT, CAT, generate, knowledgeEnabled, appendKnowledge, jstNow, saveRecord } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!auth(req, res)) return;
  try {
    const { persona, transcript = [], picked, rephrase = "", mode = "voice" } = await readJson(req);
    if (!persona || !CAT[picked]) return res.status(400).json({ error: "persona と picked(A-D) が必要です" });
    const correct = picked === persona.answer;
    const log = transcript.map(t => (t.who === "me" ? "受講者" : persona.name) + "：" + t.text).join("\n") || "（会話なし）";

    const prompt = `${FRAMEWORK}

${ZENTECT}

あなたはゼンテクトのFS商談コーチ。受講者がロープレを終えた。振り返りを返す。

【相手企業】${persona.company}（${persona.name}）
【相手の事実】${persona.hidden_facts.join("／")}
【正解】${persona.answer} ${CAT[persona.answer]}。${persona.exp}
【言い直しの模範例】${persona.rephrase_example}
【会話ログ（音声の文字起こし、またはチャット。文字起こしの場合は多少の誤変換あり）】
${log}
【受講者の判定】${picked} ${CAT[picked]}（${correct ? "正解" : "不正解"}）
【受講者の言い直し】${rephrase || "（なし）"}

JSONだけを返す：
{"feedback":"受講者への振り返り。日本語、合計350字以内、箇条書きなし、見出し記号なし。1)正誤を1行、正解の分類になる理由を判定順序に沿って2文 2)「広げる」で聞けていた事・聞けていなかった事を各1つ、会話ログの実際の発言を引いて（売上目標と着地見込みを聞けていなければ、それを最優先で指摘） 3)言い直しの出来（相手が『そう、それ』と言えるか）を1文、無ければ『言い直しを声に出して』 4)次回、最初の3分で聞くべき質問を1つ。口調は短く具体的に、ダラダラ褒めない",
 "learnings":["このロープレから次回以降の練習に活かせる気づきを1〜3行、各80字以内。受講者の癖（例：数字を聞く前に提案した）、効いた質問、社長役の反応で不自然だった点など。無ければ空配列"]}`;

    const ai = client();
    const r = await generate(ai, { contents: prompt, config: { responseMimeType: "application/json", temperature: 0.4 } });
    const t = r.text || "";
    let feedback = t, learnings = [];
    try { const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); feedback = j.feedback || t; learnings = Array.isArray(j.learnings) ? j.learnings.map(String) : []; } catch (_) {}
    let saved = false;
    if (knowledgeEnabled() && learnings.length) {
      try { await appendKnowledge(learnings, `[ロープレ] ${jstNow()} ${persona.company}（正解:${CAT[persona.answer]}／判定:${CAT[picked]}${correct ? "○" : "×"}）`); saved = true; } catch (e) { console.error(e); }
    }
    let recordUrl = null, recordError = "";
    try { recordUrl = await saveRecord({ persona, transcript, picked, correct, rephrase, feedback, mode }); } catch (e) { console.error(e); recordError = String(e.message || e); }
    res.status(200).json({ recordUrl, recordError, recordEnabled: knowledgeEnabled(), correct, answer: persona.answer, answerLabel: CAT[persona.answer], exp: persona.exp, rephrase_example: persona.rephrase_example, feedback, learnings, saved });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
