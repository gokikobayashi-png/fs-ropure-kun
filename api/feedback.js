// POST /api/feedback  { text }
// → { items:[{title, check, example}] }  上司からのFBを、毎回のロープレで採点できる「観点」に構造化する
import { client, auth, readJson, generate, FRAMEWORK } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!auth(req, res)) return;
  try {
    const { text = "" } = await readJson(req);
    if (String(text).trim().length < 5) return res.status(400).json({ error: "FBの本文を入れてください" });
    const prompt = `${FRAMEWORK}

以下は、営業担当（受講者）がロープレの録画を上司に見てもらって受けたフィードバック（メモ書き。箇条書き・口語・矢印入り）。
これを「次回以降のロープレで、できたかどうかを毎回採点できる観点」に変換する。

■ ルール
- FBの1項目＝観点1つ。まとめ過ぎない（最大6つ）。FBに無いことは足さない。
- title：観点の名前。15字以内（例：「戦略の話では件数を聞く」）
- check：採点するときに見ること。会話ログから判定できる具体的な行動で書く。60字以内（例：「ターゲットや戦略の話になったら『今の件数は？』『月に何件？』と数字を聞いたか」）
- example：商談で実際に言うセリフの例。FBに具体例があればそれをそのまま使う。40字以内
- 上司が「合っている」と言った点は、「それを続けられたか」の観点にする。

JSONだけを返す：{"items":[{"title":"…","check":"…","example":"…"}]}

【FB】
${String(text).slice(0, 8000)}`;
    const ai = client();
    const r = await generate(ai, { contents: prompt, config: { responseMimeType: "application/json", temperature: 0.2 } });
    const t = r.text || "";
    const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
    const items = (Array.isArray(j.items) ? j.items : []).map(x => ({ title: String(x.title || "").slice(0, 40), check: String(x.check || "").slice(0, 200), example: String(x.example || "").slice(0, 120) })).filter(x => x.title && x.check).slice(0, 6);
    if (!items.length) throw new Error("観点に変換できませんでした。もう少し具体的に書いてください");
    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
