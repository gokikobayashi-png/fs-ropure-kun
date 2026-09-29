// POST /api/persona  { industry?, product?, size?, answer?: "A"|"B"|"C"|"D"|"", difficulty: "easy"|"normal"|"hard" }
// → 相手企業ペルソナ（JSON）
import { client, auth, readJson, FRAMEWORK, ZENTECT, CAT, generate, loadKnowledge, knowledgeText } from "./_lib.js";

const PERSONALITY = {
  easy: "協力的。聞かれれば数字も背景も素直に話す。相手の言い直しが近ければ乗ってくる。",
  normal: "普通。聞かれたことには答えるが、曖昧な質問には曖昧に返す。営業の話より本業の話をしたがる。",
  hard: "手強い。忙しそうで短く返す。数字は「だいたい」でしか出さず、詰められると「それ答える意味あります？」と言う。言い直しが少しでもズレたら認めない。営業代行には過去に一度失敗しており疑っている。",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!auth(req, res)) return;
  try {
    const b = await readJson(req);
    const answer = ["A", "B", "C", "D"].includes(b.answer) ? b.answer : ["A", "B", "C", "D"][Math.floor(Math.random() * 4)];
    const difficulty = PERSONALITY[b.difficulty] ? b.difficulty : "normal";
    const wish = [
      b.industry ? `業種：${b.industry}` : "業種：中小企業のBtoB（ソフトウェア・製造・建設・人材・物流・サービスなどから、毎回変える）",
      b.product ? `商材：${b.product}` : "商材：受講者が事前情報から想像しにくいものを1つ具体的に（単価・課金形態まで）",
      b.size ? `規模：${b.size}` : "規模：従業員10〜150名",
    ].join("\n");

    let knowledge = "";
    try { knowledge = knowledgeText(await loadKnowledge()); } catch (e) { console.error(e); }
    const prompt = `${FRAMEWORK}

${ZENTECT}
${knowledge ? `\n■ 過去の実商談から得た知見（この中の業種・数字感・反論パターンを参考にして、現実味のある相手を作る。ただし同じ会社をそのまま再現しない）\n${knowledge}\n` : ""}
営業代行のヒアリング練習用に、架空の相手企業と、その商談相手（社長または営業責任者）を1人作る。受講者は事前に「会社概要」しか見えず、音声で質問して掘る。

■ 条件
${wish}
- 本当の課題は ${answer}（${CAT[answer]}）。ただし本人はそう認識しておらず、別の言い方（「営業が弱い」「人が足りない」「もっと数を打ちたい」「いい人が採れない」など）で語る。
- hidden_facts に、聞かれれば答える事実を12個程度、数字入りで書く（誰に売っているか・何を・単価と課金形態・営業人数と経歴・使っている手法・月の行動量・アポ率・受注率・受注先に共通点があるか・数字を取っているか・過去にやってやめた施策・社長の本業の忙しさ 等）。正解に至る手がかりと、別の分類に見えるノイズを両方入れる。判定順序（戦略→手法→量→質）を踏まないと間違えるように。
- hidden_facts の最後に、ゼンテクトの料金（IS月90万／一気通貫130万／成果報酬アポ3〜7万）を聞いたときに社長が言いそうな懸念を1つ入れる（自社の粗利・受注単価と照らした具体的な言い方で）。
- 実在の企業名・人名は使わない。
- personality は次の文をそのまま使う：${PERSONALITY[difficulty]}

JSONだけを返す（前後に文章を付けない）：
{"company":"社名","name":"姓＋敬称（例：田中社長）","role":"社長 or 営業部長","gender":"male"|"female","brief":"事前に分かる会社概要。業種・規模・商材・設立年・所在地の県。課題には触れない。80字以内","opening_line":"商談冒頭に本人が言う課題認識のひとこと。50字以内。口語","hidden_facts":["…"],"answer":"${answer}","exp":"正解の理由。判定順序に沿って、なぜこの分類か、ノイズはなぜ違うか。150字以内","rephrase_example":"課題の言い直しの模範例1文（『〜で積んでいる限り、〜にならない構造ですよね』型）","personality":"${PERSONALITY[difficulty]}"}`;

    const ai = client();
    const r = await generate(ai, {
      contents: prompt,
      config: { responseMimeType: "application/json", temperature: 1.0 },
    });
    const text = r.text || "";
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (!json.company || !Array.isArray(json.hidden_facts) || !CAT[json.answer]) throw new Error("ペルソナJSONが不完全");
    json.difficulty = difficulty;
    json.voice = json.gender === "female" ? "Aoede" : "Charon";
    res.status(200).json(json);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
