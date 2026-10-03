// POST /api/grade  { persona, transcript:[{who:"me"|"them", text}], picked:"A"|"B"|"C"|"D", rephrase }
// → { correct, answer, feedback }
import { client, auth, readJson, FRAMEWORK, companyText, companyName, CAT, generate, knowledgeEnabled, appendKnowledge, jstNow, saveRecord } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!auth(req, res)) return;
  try {
    const { persona, transcript = [], picked, rephrase = "", mode = "voice", overview = "", calc = null, proposal = "", company = null } = await readJson(req);
    const me = companyName(company);
    const calcText = calc ? `プラン：${calc.plan}（月${calc.monthly}万）／期間${calc.months}ヶ月／準備費${calc.prep}万／月の稼働${calc.calls}コール／アポ率${calc.apo_rate}%／受注率${calc.win_rate}%／1受注の売上${calc.revenue}万
→ 投資額${calc.invest}万、期間内の受注数${calc.wins}件、回収額${calc.recover}万 → ${calc.ok ? "成立" : "不成立"}（受講者自身の判断：${calc.judge || "未選択"}）` : "（未入力）";
    if (!persona || !CAT[picked]) return res.status(400).json({ error: "persona と picked(A-D) が必要です" });
    const correct = picked === persona.answer;
    const log = transcript.map(t => (t.who === "me" ? "受講者" : persona.name) + "：" + t.text).join("\n") || "（会話なし）";

    const prompt = `${FRAMEWORK}

${companyText(company)}

あなたは${me}のFS商談コーチ。受講者がロープレを終えた。商談後の自己チェック3問への回答と会話ログから、振り返りを返す。

【相手企業】${persona.company}（${persona.name}／${persona.role || ""}。決裁権：${persona.authority || ""}）
【相手の事実】${persona.hidden_facts.join("／")}
【正解】${persona.answer} ${CAT[persona.answer]}。${persona.exp}
【言い直しの模範例】${persona.rephrase_example}
【会話ログ（音声の文字起こし、またはチャット。文字起こしの場合は多少の誤変換あり）】
${log}
【問1 受講者による相手の営業の説明（誰に・何を・どう売って・月に何件商談し・何%決まるか）】${overview || "（なし）"}
【問2 受講者の判定】${picked} ${CAT[picked]}（${correct ? "正解" : "不正解"}）
【問2 受講者の言い直し】${rephrase || "（なし）"}
【問3 受講者の検算】${calcText}
【問3 受講者の「こういうやり方なら」】${proposal || "（なし）"}

JSONだけを返す：
{"feedback":"受講者への振り返り。日本語、合計350字以内、箇条書きなし、見出し記号なし。1)正誤を1行、正解の分類になる理由を判定順序に沿って2文 2)「広げる」で聞けていた事・聞けていなかった事を各1つ、会話ログの実際の発言を引いて（売上目標と着地見込みを聞けていなければ、それを最優先で指摘。相手の役職・決裁権・今回来た経緯を聞けていなければ、それも指摘） 3)言い直しの出来（相手が『そう、それ』と言えるか）を1文、無ければ『言い直しを声に出して』 4)次回、最初の3分で聞くべき質問を1つ。口調は短く具体的に、ダラダラ褒めない",
 "overview_review":"問1の評価。相手の事実と照らして、説明できていた要素と抜けた要素（誰に／何を／どう売って／月の商談数／受注率）を挙げる。抜けがあれば『まだ広げる余地あり』とし、会話で聞けばよかった質問を1つ。150字以内",
 "calc_review":"問3の評価。①相手の事実の数字で正しく検算するとどうなるか（1受注の売上・投資額・必要受注数・成立/不成立を数字で）②受講者の入力値とズレた変数と、その数字を会話で聞けていたか（聞かずに基準値や推測で埋めていたら指摘）③『こういうやり方なら』が検算結果に合っているか（不成立ならフル提案ではなく、投資を落とす／1受注を大きくする／座組みを変える、のどれか）。250字以内",
 "learnings":["このロープレから次回以降の練習に活かせる気づきを1〜3行、各80字以内。受講者の癖（例：数字を聞く前に提案した）、効いた質問、相手役の反応で不自然だった点など。無ければ空配列"]}`;

    const ai = client();
    const r = await generate(ai, { contents: prompt, config: { responseMimeType: "application/json", temperature: 0.4 } });
    const t = r.text || "";
    let feedback = t, learnings = [], overviewReview = "", calcReview = "";
    try { const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); feedback = j.feedback || t; learnings = Array.isArray(j.learnings) ? j.learnings.map(String) : []; overviewReview = String(j.overview_review || ""); calcReview = String(j.calc_review || ""); } catch (_) {}
    let saved = false;
    if (knowledgeEnabled() && learnings.length) {
      try { await appendKnowledge(learnings, `[ロープレ] ${jstNow()} ${persona.company}（正解:${CAT[persona.answer]}／判定:${CAT[picked]}${correct ? "○" : "×"}）`); saved = true; } catch (e) { console.error(e); }
    }
    let recordUrl = null, recordError = "";
    try { recordUrl = await saveRecord({ persona, transcript, picked, correct, rephrase, feedback, mode, overview, calcText, proposal, overviewReview, calcReview }); } catch (e) { console.error(e); recordError = String(e.message || e); }
    res.status(200).json({ recordUrl, recordError, recordEnabled: knowledgeEnabled(), correct, answer: persona.answer, answerLabel: CAT[persona.answer], exp: persona.exp, rephrase_example: persona.rephrase_example, feedback, overviewReview, calcReview, learnings, saved });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
