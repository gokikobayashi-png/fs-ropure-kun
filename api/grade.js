// POST /api/grade  { persona, transcript:[{who:"me"|"them", text}], picked:"A"|"B"|"C"|"D", rephrase }
// → { correct, answer, feedback }
import { client, auth, readJson, FRAMEWORK, CAT, TEXT_MODEL } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!auth(req, res)) return;
  try {
    const { persona, transcript = [], picked, rephrase = "" } = await readJson(req);
    if (!persona || !CAT[picked]) return res.status(400).json({ error: "persona と picked(A-D) が必要です" });
    const correct = picked === persona.answer;
    const log = transcript.map(t => (t.who === "me" ? "受講者" : persona.name) + "：" + t.text).join("\n") || "（会話なし）";

    const prompt = `${FRAMEWORK}

あなたはゼンテクトのFS商談コーチ。受講者が音声ロープレを終えた。振り返りを返す。

【相手企業】${persona.company}（${persona.name}）
【相手の事実】${persona.hidden_facts.join("／")}
【正解】${persona.answer} ${CAT[persona.answer]}。${persona.exp}
【言い直しの模範例】${persona.rephrase_example}
【会話ログ（音声の文字起こし。多少の誤変換あり）】
${log}
【受講者の判定】${picked} ${CAT[picked]}（${correct ? "正解" : "不正解"}）
【受講者の言い直し】${rephrase || "（なし）"}

次を日本語で、合計350字以内、箇条書きなし、見出し記号なしで書く：
1) 正誤を1行で。正解の分類になる理由を判定順序に沿って2文。
2) 「広げる」で聞けていた事・聞けていなかった事を各1つ、会話ログの実際の発言を引いて。
3) 言い直しの出来（相手が「そう、それ」と言えるか）を1文。無ければ「言い直しを声に出して」。
4) 次回、最初の3分で聞くべき質問を1つ。
口調は短く具体的に。ダラダラ褒めない。`;

    const ai = client();
    const r = await ai.models.generateContent({ model: TEXT_MODEL, contents: prompt, config: { temperature: 0.4 } });
    res.status(200).json({ correct, answer: persona.answer, answerLabel: CAT[persona.answer], exp: persona.exp, rephrase_example: persona.rephrase_example, feedback: r.text || "" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
