// POST /api/grade  { persona, transcript:[{who:"me"|"them", text}], picked:"A"|"B"|"C"|"D", rephrase }
// → { correct, answer, feedback }
import { client, auth, readJson, FRAMEWORK, companyText, companyName, CAT, generate, knowledgeEnabled, appendKnowledge, jstNow, saveRecord } from "./_lib.js";

// 会話の回数を数える：質問／相手の言葉を拾ってから質問／提案／質問と答えのずれ。
// AIには「受講者の発言を1つずつ分類」だけさせ、合計はこちらで数える（AIに合計を言わせると数え間違うため）。
const cut = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) + "…" : s; };
const GOBI_TYPES = ["ぼかし", "敬語の重ねすぎ", "文法の誤り"];
export function tallyCounts(turns, transcript) {
  const items = [];
  let questions = 0, picked = 0, proposals = 0, offThem = 0, offMe = 0, gobi = 0;
  const gobiTypes = {};
  const flat = s => String(s || "").replace(/[\s、。,.　]/g, "");
  const seen = new Set();
  for (const t of Array.isArray(turns) ? turns : []) {
    const n = Math.round(Number(t && t.n));
    const src = transcript[n - 1];
    if (!src || src.who !== "me" || seen.has(n)) continue; // 受講者の発言だけ、1回ずつ
    seen.add(n);
    const q = Math.min(5, Math.max(0, Math.round(Number(t.q)) || 0));
    const echo = cut(t.echo, 30);
    const p = echo ? Math.min(q, Math.max(0, Math.round(Number(t.picked)) || 0)) : 0; // 拾った言葉を示せないものは数えない
    const prop = t.proposal === true || t.proposal === "true";
    const off = ["them", "me", "both"].includes(t.off) ? t.off : "";
    // おかしい語尾：発言に実際にある言い回しだけを数える（AIの作り話を弾く）
    const body = flat(src.text);
    const gb = [];
    for (const g of Array.isArray(t.gobi) ? t.gobi : []) {
      const bad = String((g && g.bad) || "").trim();
      if (flat(bad).length < 3 || !body.includes(flat(bad)) || gb.some(x => x.bad === bad) || gb.length >= 4) continue;
      const type = GOBI_TYPES.includes(g.type) ? g.type : "ぼかし";
      gb.push({ bad: cut(bad, 24), fix: cut(g.fix, 24), type });
      gobi++; gobiTypes[type] = (gobiTypes[type] || 0) + 1;
    }
    questions += q; picked += p; if (prop) proposals++;
    if (off === "them" || off === "both") offThem++;
    if (off === "me" || off === "both") offMe++;
    if (q || prop || off || gb.length) items.push({ n, q, picked: p, echo: p ? echo : "", could: q > p ? cut(t.could, 30) : "", proposal: prop, off, note: cut(t.note, 40), text: cut(src.text, 70), gobi: gb });
  }
  return { questions, picked, proposals, off: offThem + offMe, offThem, offMe, gobi, gobiTypes, items };
}
async function countTurns(ai, persona, transcript) {
  if (!transcript.some(t => t.who === "me")) return null;
  const log = transcript.map((t, i) => `${String(i + 1).padStart(2, "0")} ${t.who === "me" ? "受講者" : persona.name}：${t.text}`).join("\n");
  const prompt = `あなたは営業ロープレの会話ログを数える係。評価やアドバイスはしない。受講者（営業担当）の発言を1つずつ分類する。

【会話ログ】行頭の番号が発言番号。相手は${persona.name}。音声の文字起こしなので誤変換がある。意味の通らない短い発言（「Ja.」など）や、日本語以外の言語になっている発言は、文字起こしの誤りなので q=0・proposal=false・off=""・gobi=[] で扱う。
${log}

■ 数え方
- q（質問の数）：その発言の中で、受講者が相手に情報や考えを尋ねた質問の数。挨拶・音声の確認（「聞こえていますか」）・相づち・「よろしいでしょうか」のような進行の確認は数えない。同じ質問の言い換えは1つと数える。
- picked（拾ってから質問できた数）：q のうち、質問の前に「相手が直前の発言で新しく出した情報（数字・事実・事情・気持ち）」を受け止める一言を置いてから聞いた質問の数。受け止めの一言とは、相手の言葉を引用または言い換えた文（「〜なんですね」「〜とおっしゃいましたが」「先ほどの〜ですが」）。例：「役員の方から急かされているんですね。未達というのはどのくらいですか」「先ほど45件とおっしゃいましたが、目標は何件ですか」。厳しく数える。次はどれも拾いに数えない：
  ・「ありがとうございます」「承知しました」「なるほど」「それで言うと」「ちなみに」だけで次の質問に行った
  ・話題の単語（インバウンド、アウトバウンド、新規、商談 など）が重なっているだけで、相手が出した情報そのものには触れていない
  ・相手の言葉に触れずに、自分の解釈・仮説・提案を述べてから聞いた
  ・相手の発言を確認するだけの質問（「〜ということですかね」「〜という形でしょうか」）で、受け止めの一言が無い
  picked は q 以下。
- echo：picked が1以上のとき、受講者が拾った「相手の言葉」を20字以内で書く（相手の発言に実際にある言葉）。書けないなら picked は0。picked が0なら ""。
- could：q が1以上で picked が q より少ないとき、相手の直前の発言の中で拾えたはずの言葉を20字以内で書く（相手の発言に実際にある言葉）。それ以外は ""。
- proposal（提案したか）：その発言で、受講者が解決策・進め方・自社サービスのやり方・料金やプランを自分から出したら true。例：「〜がいいのかなと思います」「弊社では〜を行っています」「月額90万円でご支援します」。次回の日程や「提案書を作ります」という段取りだけなら false。
- off（質問と答えのずれ）：
  "them"＝この発言の質問に対して、直後の相手の答えが聞いたことに答えていない・別の話になっている。
  "me"＝直前の相手の質問や求めに対して、この発言が答えになっていない・話を逸らしている。
  両方なら "both"、どちらでもなければ ""。
- note：off が空でないとき、または proposal が true のとき、何がずれたか／何を提案したかを25字以内で。それ以外は ""。
- gobi（おかしい語尾）：その発言の中で、文末・句末の言い回しが不自然なものを抜き出す。bad は発言にそのまま出てくる文字列（20字以内、言い換えない）。fix は同じ意味で自然に言い切った形（20字以内）。type は次の3つのどれか：
  ・"ぼかし"＝言い切らずにぼかす語尾。「〜という形でしょうか」「〜ような形ですかね」「〜感じですかね」「〜のかなと思っております」「〜あったりしますか」「〜みたいなところは」
  ・"敬語の重ねすぎ"＝敬語を重ねた、または不要な所で「させていただく」を使った語尾。「あったりされますでしょうか」「お送りさせていただく中で」「ご提案をさせていただければと思っております」
  ・"文法の誤り"＝さ入れ言葉など。「行わさせていただいている」「入らさせていただきます」
  例：bad「あったりされますでしょうか」→ fix「ありますか」／bad「そういうような形でしょうか」→ fix「ということですか」／bad「入らさせていただきます」→ fix「入ります」
  数えないもの：普通の丁寧語（「〜でしょうか」「〜ですか」「〜いただけますか」「ありがとうございます」「よろしくお願いいたします」）、音声の誤変換と思われる意味の通らない単語、語尾以外の言い間違い。1発言につき最大4つ。無ければ []。

JSONだけを返す。受講者の発言すべてについて1つずつ、番号順に：
{"turns":[{"n":発言番号,"q":0,"picked":0,"echo":"","could":"","proposal":false,"off":"","note":"","gobi":[{"bad":"","fix":"","type":""}]}]}`;
  const r = await generate(ai, { contents: prompt, config: { responseMimeType: "application/json", temperature: 0 } });
  const t = r.text || "";
  const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
  if (!Array.isArray(j.turns) || !j.turns.length) throw new Error("turns が空");
  return tallyCounts(j.turns, transcript);
}
export function countsLine(c) {
  if (!c) return "";
  return `質問${c.questions}回（うち相手の言葉を拾ってから${c.picked}回）／提案${c.proposals}回／質問と答えのずれ${c.off}回（相手の答えがずれた${c.offThem}・自分の答えがずれた${c.offMe}）／おかしい語尾${c.gobi || 0}回${c.gobi ? "（" + GOBI_TYPES.filter(k => c.gobiTypes[k]).map(k => k + c.gobiTypes[k]).join("・") + "）" : ""}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!auth(req, res)) return;
  try {
    const { persona, transcript = [], picked, rephrase = "", mode = "voice", overview = "", calc = null, proposal = "", company = null, quizzes = [], checks = [], dry = false } = await readJson(req);
    const cks = (Array.isArray(checks) ? checks : []).filter(c => c && c.key && c.title).slice(0, 12);
    const me = companyName(company);
    const calcText = calc ? `チャネル：${calc.channel || "アウトバウンド"}／プラン：${calc.plan}（月${calc.monthly}万）／期間${calc.months}ヶ月／準備費${calc.prep}万／月の稼働${calc.calls}コール／アポ率${calc.apo_rate}%／受注率${calc.win_rate}%／1受注の売上${calc.revenue}万
→ 投資額${calc.invest}万、期間内の受注数${calc.wins}件、回収額${calc.recover}万 → ${calc.ok ? "成立" : "不成立"}
受講者が先に暗算で出した値：${calc.mine ? `投資額${calc.mine.invest ?? "?"}万／受注数${calc.mine.wins ?? "?"}件／回収額${calc.mine.recover ?? "?"}万／判定「${calc.mine.judge || "未選択"}」（${calc.mine.ok ? "判定は合っていた" : "判定がズレていた"}）` : "（暗算せず答えを見た）"}` : "（未入力）";
    const qz = (Array.isArray(quizzes) ? quizzes : []).slice(0, 12);
    const quizText = qz.length ? qz.map((q, i) => `${i + 1}. ${q.question} → 正解${q.answer}${q.unit || ""}／受講者の答え${q.mine === null || q.mine === undefined || q.mine === "" ? "（未回答）" : q.mine + (q.unit || "")}（${q.ok ? "○" : "×"}、${Math.round(q.sec || 0)}秒）`).join("\n") : "（なし）";
    if (!persona || !CAT[picked]) return res.status(400).json({ error: "persona と picked(A-D) が必要です" });
    const correct = picked === persona.answer;
    const log = transcript.map(t => (t.who === "me" ? "受講者" : persona.name) + "：" + t.text).join("\n") || "（会話なし）";

    const prompt = `${FRAMEWORK}

${companyText(company)}

あなたは${me}のFS商談コーチ。受講者がロープレを終えた。商談後の自己チェック3問への回答と会話ログから、振り返りを返す。

【相手企業】${persona.company}（${persona.name}／${persona.role || ""}。決裁権：${persona.authority || ""}。難易度：${persona.difficulty || ""}${persona.difficulty === "hard" ? "（他社＝EmpowerX／セレブリックス／カリトル君と比較検討中。比較に乗って機能・料金勝負になっていないか、構造の言い直しで差を作れたかも振り返る）" : ""}。タイプ：${persona.style_name || "不明"}${persona.style_hidden ? "（受講者には伏せていた。タイプに合わせた話し方ができていたかも振り返りで1文触れる）" : ""}）
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
【商談中の暗算チェック（相手が言った数字での即答）】
${quizText}
${cks.length ? `【上司からのFBで決めた観点（毎回採点する。会話ログに証拠が無ければ1〜2）】
${cks.map(c => `- ${c.key}｜${c.title}：${c.check}${c.example ? `（例：「${c.example}」）` : ""}`).join("\n")}` : ""}

■ スコア（教材「FS商談の考え方」の各段階ができていたか。5点満点、整数。甘くしない。会話ログに証拠が無ければ1〜2）
- counterpart 相手の把握：役割・決裁権・今回来た経緯・ミッションを聞けたか（5＝4つとも聞いてクロージングの形まで意識／3＝役割か経緯のどちらか／1＝聞いていない）
- widen 広げる：誰に・何を・どう売って・単価と課金形態・月の商談数・受注率・売上目標と着地見込み、を聞けたか。課題を探しに行かず全体像を掴んだか（5＝ほぼ全部／3＝半分／1＝冒頭から提案や料金）
- classify 深掘る：4分類の判定が正しく、判定順序（戦略→手法→量→質）を踏んだ質問をしたか（5＝正解で順序通り／3＝正解だが順序が怪しい、または不正解だが順序は踏んだ／1＝不正解で順序も無い）
- rephrase 言い直し：相手より一段深い言葉で構造を言い直し、相手が「そう、それ」と言ったか（5＝模範例と同等で相手が認めた／3＝言い直したが浅い、または相手が認めなかった／1＝言い直していない）
- converge 狭める：「こういうやり方ならできますよね」を1つ出し、合意を取ったか。分類に合った提案の大きさだったか（5＝出して相手が頷いた／3＝出したが合意なし、または分類とズレ／1＝出していない）
- roi 検算：検算に必要な4つ（単価・課金形態／月の受注数／1受注の導入数／受注率）を会話で聞き、問3の検算が正しく、不成立なら絞る提案になっていたか（5＝4つ聞いて正しい結論／3＝半分／1＝聞いていない）
- listening 傾聴態度：相手の話を遮らず最後まで聞き、相手の言葉をそのまま拾って返し（「◯◯とおっしゃいましたが」）、質問→受け止め→深掘りのリズムがあるか。受講者の発言量が相手より明らかに多い・質問を連射している・相手の答えを待たずに次へ進む、は減点（5＝相手が気持ちよく話し続けている／3＝聞けてはいるが拾い返しが無い／1＝自分が喋っている）
- closing クロージング：商談の締め方。次のステップ（次回日程・決裁者同席・提案書・トライアル）を具体的に提示して相手の合意を取ったか。料金・期間・報酬形態の希望（成果報酬か固定か）を確認してから提案したか。宿題（お互い次回までに何をするか）を明確にしたか（5＝次のステップが日時と内容まで合意／3＝次のステップを言ったが曖昧、または合意なし／1＝締めずに終わった・「是非お願いします」で終わらせた）

JSONだけを返す：
{"feedback":"受講者への振り返り。日本語、合計350字以内、箇条書きなし、見出し記号なし。1)正誤を1行、正解の分類になる理由を判定順序に沿って2文 2)「広げる」で聞けていた事・聞けていなかった事を各1つ、会話ログの実際の発言を引いて${cks.length ? "（上司のFBの観点でできていなかったことがあれば、それを最優先で、上司の言葉を引いて指摘）" : ""}（売上目標と着地見込みを聞けていなければ、それを最優先で指摘。相手の役職・決裁権・今回来た経緯を聞けていなければ、それも指摘。報酬形態の希望（成果報酬か固定か）を聞かずに料金や座組みを提案していたら、それも指摘） 3)言い直しの出来（相手が『そう、それ』と言えるか）を1文、無ければ『言い直しを声に出して』 4)次回、最初の3分で聞くべき質問を1つ。口調は短く具体的に、ダラダラ褒めない",
 "overview_review":"問1の評価。相手の事実と照らして、説明できていた要素と抜けた要素（誰に／何を／どう売って／月の商談数／受注率）を挙げる。抜けがあれば『まだ広げる余地あり』とし、会話で聞けばよかった質問を1つ。150字以内",
 "calc_review":"問3の評価。①相手の事実の数字で正しく検算するとどうなるか（1受注の売上・投資額・必要受注数・成立/不成立を数字で）②受講者の入力値とズレた変数と、その数字を会話で聞けていたか（聞かずに基準値や推測で埋めていたら指摘）③『こういうやり方なら』が検算結果に合っているか（不成立ならフル提案ではなく、投資を落とす／1受注を大きくする／座組みを変える、のどれか）。250字以内",
 "good":["良かった点を1〜3個。会話ログの実際の発言（時刻や言葉）を引いて、各60字以内"],
 "improve":["改善点を2〜4個。最も効いたズレから順に。上司FBの観点でできていなかったものは先頭に『上司FB：』を付ける。各80字以内"],
 "scores":{"counterpart":{"score":1〜5の整数,"why":"根拠。会話ログの発言を引いて40字以内"},"widen":{"score":1〜5,"why":"…"},"classify":{"score":1〜5,"why":"…"},"rephrase":{"score":1〜5,"why":"…"},"converge":{"score":1〜5,"why":"…"},"roi":{"score":1〜5,"why":"…"},"listening":{"score":1〜5,"why":"…"},"closing":{"score":1〜5,"why":"…"}},
 "custom":{${cks.map(c => `"${c.key}":{"score":1〜5,"why":"根拠。会話ログの発言を引いて40字以内"}`).join(",")}},
 "second_opinion":"もう1人のアドバイザー『Mr. Go fast』の指摘。コーチ（教材の段階ごとの評価）とは別の角度で、論理の穴だけを突く：①受講者の発言の中で、根拠なく決めつけた・因果が飛んだ・数字が噛み合っていない・相手の言葉を確認せず解釈した箇所を、会話ログの発言を引いて最大3つ ②その1つ1つに『本来こう確かめるべきだった』という確認の仕方（質問文）を付ける。口調は短く断定的、スピード重視で結論から。合計220字以内。穴が無ければ『論理の穴なし。次は速さ：同じ結論に半分の時間で辿り着け』の1文",
 "next_action":"次回のロープレで最初に直すこと1つ。最も低い軸について、商談のどの場面で何を言う／聞くかを具体的に。60字以内",
 "numbers_review":"数字の振り返り。受講者は数字が苦手。①暗算チェックと問3の暗算で、どの種類の計算（％・率・逆算・1受注の売上・投資と回収）が弱いかを具体的に（間違えた問題の数字を引いて）②商談中に『その場で計算して口に出せていれば』商談がどう変わったかを1つ（例：相手が月80商談・受注率15%と言った瞬間に『月12件ですね』と返せれば、次の質問が…）③次回、商談中に頭の中でやる計算を1つだけ指定（式まで）。200字以内。暗算チェックも問3の暗算も無ければ『商談中に数字を口に出して確認する癖を』の1文だけ",
 "learnings":["このロープレから次回以降の練習に活かせる気づきを1〜3行、各80字以内。受講者の癖（例：数字を聞く前に提案した）、効いた質問、相手役の反応で不自然だった点など。無ければ空配列"]}`;

    const ai = client();
    // 回数の集計は採点と同時に走らせる（失敗しても採点は返す）
    let countsError = "";
    const countsP = countTurns(ai, persona, transcript).catch(e => { countsError = String(e.message || e).slice(0, 200); console.error("count failed", countsError); return null; });
    const r = await generate(ai, { contents: prompt, config: { responseMimeType: "application/json", temperature: 0.4 } });
    let counts = await countsP;
    // 同時に走らせて失敗したとき（混雑・壊れたJSON）は、採点が終わってからもう1回だけ数える
    if (!counts && countsError) { try { counts = await countTurns(ai, persona, transcript); countsError = ""; } catch (e) { countsError = String(e.message || e).slice(0, 200); console.error("count retry failed", countsError); } }
    const t = r.text || "";
    let feedback = t, learnings = [], overviewReview = "", calcReview = "", numbersReview = "", scores = null, nextAction = "", custom = null, good = [], improve = [], secondOpinion = "";
    try { const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); feedback = j.feedback || t; learnings = Array.isArray(j.learnings) ? j.learnings.map(String) : []; overviewReview = String(j.overview_review || ""); calcReview = String(j.calc_review || ""); numbersReview = String(j.numbers_review || ""); nextAction = String(j.next_action || ""); secondOpinion = String(j.second_opinion || ""); good = Array.isArray(j.good) ? j.good.map(String) : []; improve = Array.isArray(j.improve) ? j.improve.map(String) : [];
      if (j.scores && typeof j.scores === "object") { scores = {}; for (const k of ["counterpart", "widen", "classify", "rephrase", "converge", "roi", "listening", "closing"]) { const v = j.scores[k] || {}; const n = Math.round(Number(v.score)); scores[k] = { score: isFinite(n) ? Math.min(5, Math.max(1, n)) : 1, why: String(v.why || "") }; } }
      if (cks.length && j.custom && typeof j.custom === "object") { custom = {}; for (const c of cks) { const v = j.custom[c.key] || {}; const n = Math.round(Number(v.score)); custom[c.key] = { score: isFinite(n) ? Math.min(5, Math.max(1, n)) : 1, why: String(v.why || ""), title: c.title }; } } } catch (_) {}
    let saved = false;
    if (!dry && knowledgeEnabled() && learnings.length) {
      try { await appendKnowledge(learnings, `[ロープレ] ${jstNow()} ${persona.company}（正解:${CAT[persona.answer]}／判定:${CAT[picked]}${correct ? "○" : "×"}）`); saved = true; } catch (e) { console.error(e); }
    }
    let recordUrl = null, recordError = "";
    if (!dry) try { recordUrl = await saveRecord({ persona, transcript, picked, correct, rephrase, feedback, mode, overview, calcText, proposal, overviewReview, calcReview, numbersReview, quizText, scores, nextAction, custom, secondOpinion, counts, countsText: countsLine(counts) }); } catch (e) { console.error(e); recordError = String(e.message || e); }
    res.status(200).json({ recordUrl, recordError, recordEnabled: knowledgeEnabled(), correct, answer: persona.answer, answerLabel: CAT[persona.answer], exp: persona.exp, rephrase_example: persona.rephrase_example, feedback, overviewReview, calcReview, numbersReview, scores, nextAction, custom, good, improve, secondOpinion, learnings, saved, counts, countsError });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
