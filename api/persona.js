// POST /api/persona  { industry?, product?, size?, answer?: "A"|"B"|"C"|"D"|"", difficulty: "easy"|"normal"|"hard" }
// → 相手企業ペルソナ（JSON）
import { client, auth, readJson, FRAMEWORK, companyText, companyName, CAT, generate, loadKnowledge, knowledgeText, STYLES, COMPETITORS } from "./_lib.js";

const PERSONALITY = {
  easy: "協力的。聞かれれば数字も背景も素直に話す。相手の言い直しが近ければ乗ってくる。",
  normal: "普通。聞かれたことには答えるが、曖昧な質問には曖昧に返す。営業の話より本業の話をしたがる。",
  hard: "手強い。忙しそうで短く返す。数字は「だいたい」でしか出さず、詰められると「それ答える意味あります？」と言う。言い直しが少しでもズレたら認めない。営業代行には過去に一度失敗しており疑っている。",
};

// 相手のレイヤー（役職と決裁権）。受講者は役割も商談の中で聞き出す
const ROLES = {
  ceo: { role: "代表取締役社長", auth: "最終決裁者。その場で前向きな判断もできるが、数字が合わなければ即断る" },
  director: { role: "取締役 営業本部長", auth: "決裁権あり。ただし年間1,000万を超える投資は社長と相談する" },
  sales_mgr: { role: "営業部長", auth: "部の予算枠（月50万程度）までは決裁できる。それを超えると役員会の承認が要る" },
  section: { role: "営業課長（プレイングマネージャー）", auth: "決裁権なし。部長に上げる稟議の材料を集めに来ている。自分も数字を持って現場で売っている" },
  marketing: { role: "マーケティング責任者", auth: "リード獲得の予算を持つが、営業代行はマーケ予算か営業予算か社内で決まっていない。最終承認は担当役員" },
  bizdev: { role: "新規事業の事業部長", auth: "新規事業の予算を持つ決裁者。既存事業の営業部とは別組織で、営業の人手がほぼ無い" },
  planning: { role: "経営企画室の担当", auth: "決裁権なし。社長に「営業を外に出せないか調べておいて」と言われた情報収集役。営業の現場の数字は詳しくない" },
  is_lead: { role: "インサイドセールスのリーダー", auth: "決裁権なし。上長から外注の比較を任されている。現場の数字（コール数・アポ率）には一番詳しい" },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!auth(req, res)) return;
  try {
    const b = await readJson(req);
    const answer = ["A", "B", "C", "D"].includes(b.answer) ? b.answer : ["A", "B", "C", "D"][Math.floor(Math.random() * 4)];
    const difficulty = PERSONALITY[b.difficulty] ? b.difficulty : "normal";
    const keys = Object.keys(ROLES);
    const layer = ROLES[b.layer] || ROLES[keys[Math.floor(Math.random() * keys.length)]];
    const skeys = Object.keys(STYLES);
    const styleKey = STYLES[b.style] ? b.style : skeys[Math.floor(Math.random() * skeys.length)];
    const styleHidden = !STYLES[b.style];
    const style = STYLES[styleKey];
    const wish = [
      b.industry ? `業種：${b.industry}` : "業種：中小企業のBtoB（ソフトウェア・製造・建設・人材・物流・サービスなどから、毎回変える）",
      b.product ? `商材：${b.product}` : "商材：受講者が事前情報から想像しにくいものを1つ具体的に（単価・課金形態まで）",
      b.size ? `規模：${b.size}` : "規模：従業員10〜150名",
      b.sales_team ? `営業体制：${b.sales_team}` : "営業体制：営業1〜5名（社長が兼務する場合もある）",
    ].join("\n");

    let knowledge = "";
    try { knowledge = knowledgeText(await loadKnowledge()); } catch (e) { console.error(e); }
    const prompt = `${FRAMEWORK}

${companyText(b.company)}
${knowledge ? `\n■ 過去の実商談から得た知見（この中の業種・数字感・反論パターンを参考にして、現実味のある相手を作る。ただし同じ会社をそのまま再現しない）\n${knowledge}\n` : ""}
営業代行のヒアリング練習用に、架空の相手企業と、その商談相手を1人作る。受講者は事前に「会社概要」しか見えず、音声かチャットで質問して掘る。

■ 条件
${wish}
- 商談相手の役職は「${layer.role}」。決裁権：${layer.auth}。受講者には役職を伏せる（name に役職を入れない、brief にも書かない）。
- 商談相手のタイプ（ソーシャルスタイル）は「${style.name}」（${style.axis}：${style.traits}）。opening_line の言い回しと、hidden_facts の「数字を取っているか」「過去にやってやめた施策」はこのタイプらしくする。brief にはタイプを書かない。
- hidden_facts の最初の3つは必ず：①役職と経歴（前職・社歴）②決裁権の範囲と社内の承認の流れ ③今回時間を取った経緯と、この人が社内で負っているミッション（誰から何を期待されているか）。この役職の人が知っていること・知らないこと（例：経営企画なら現場の率は曖昧、ISリーダーなら単価や粗利は曖昧）を事実に反映する。
- 本当の課題は ${answer}（${CAT[answer]}）。ただし本人はそう認識しておらず、別の言い方（「営業が弱い」「人が足りない」「もっと数を打ちたい」「いい人が採れない」など）で語る。
- hidden_facts に、聞かれれば答える事実を12個程度、数字入りで書く（今期の売上目標と現状の着地見込み〔商材単価に見合う数字をランダムに。目標と見込みの差から必要な受注数・商談数が逆算できるように〕・誰に売っているか・何を・単価と課金形態・営業人数と経歴・使っている手法・月の行動量・アポ率・受注率・受注先に共通点があるか・数字を取っているか・過去にやってやめた施策・社長の本業の忙しさ 等）。正解に至る手がかりと、別の分類に見えるノイズを両方入れる。判定順序（戦略→手法→量→質）を踏まないと間違えるように。
${difficulty === "hard" ? `- 難易度「手強い」：この相手は他社と比較検討中。hidden_facts に「EmpowerX／セレブリックス／カリトル君（StockSun）のどれから、どんな提案（料金・体制）を受けているか」を2つ入れる（下の競合情報の数字を使う）。opening_line にも「何社か話を聞いている」ニュアンスを入れる。\n${COMPETITORS}\n` : ""}- hidden_facts に「報酬形態の希望」を1つ入れる：成果報酬（アポ課金）を希望／固定報酬でも可／まだ決めていない、のどれかと、その理由（例：「前に固定で払って成果ゼロだったので成果報酬しか稟議が通らない」「成果報酬だとアポの質が落ちると聞いたので固定で質を担保したい」「予算の枠が月○万と決まっている」）。本人からは言わず、聞かれたら答える。
- hidden_facts の最後に、${companyName(b.company)}の料金（上の商材情報の価格）を聞いたときにこの役職の人が言いそうな懸念を1つ入れる（決裁権がなければ「上にどう説明するか」の視点も）（自社の粗利・受注単価と照らした具体的な言い方で）。
- 実在の企業名・人名は使わない。
- personality は次の文をそのまま使う：${PERSONALITY[difficulty]}

JSONだけを返す（前後に文章を付けない）：
{"company":"社名","name":"姓＋さん（例：田中さん。役職を入れない）","role":"${layer.role}","gender":"male"|"female","age":年齢の数値（役職に見合う。例：社長45〜65、課長35〜45、担当28〜38）,"brief":"事前に分かる会社概要。業種・規模・商材・設立年・所在地の県。課題には触れない。80字以内","opening_line":"商談冒頭に本人が言う課題認識のひとこと。50字以内。口語。役職が分かる言い方はしない","hidden_facts":["…"],"answer":"${answer}","exp":"正解の理由。判定順序に沿って、なぜこの分類か、ノイズはなぜ違うか。150字以内","rephrase_example":"課題の言い直しの模範例1文（『〜で積んでいる限り、〜にならない構造ですよね』型）","personality":"${PERSONALITY[difficulty]}"}`;

    const ai = client();
    const r = await generate(ai, {
      contents: prompt,
      config: { responseMimeType: "application/json", temperature: 1.0 },
    });
    const text = r.text || "";
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (!json.company || !Array.isArray(json.hidden_facts) || !CAT[json.answer]) throw new Error("ペルソナJSONが不完全");
    json.difficulty = difficulty;
    json.role = layer.role; json.authority = layer.auth;
    json.style = styleKey; json.style_name = style.name; json.style_hidden = styleHidden;
    json.voice = json.gender === "female" ? "Aoede" : "Charon";
    res.status(200).json(json);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
