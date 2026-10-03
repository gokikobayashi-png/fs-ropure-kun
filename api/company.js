// POST /api/company  { text?, pdfs?:[{name, data(base64)}] }
// → 自社情報を項目ごとに構造化したJSON（画面で確認・編集してから保存する）
import { client, auth, readJson, generate } from "./_lib.js";

const PROMPT = `以下は、営業代行会社（またはその商材）の会社紹介・製品資料。営業ロープレの「自社情報」として使えるように、項目ごとに整理する。

■ ルール
- 資料に書いてあることだけを使う。書いていない項目は空文字（数値は null）。推測で埋めない。
- 文章は資料の言い回しをなるべく残し、1項目300字以内に要約する。
- plans は月額の固定料金プラン（例：ISプラン 月90万円）。monthly は万円単位の数値。成果報酬など月額でないものは plans に入れず pricing に書く。
- prep は初期費用・準備費用（万円）。months は最低契約期間（月）。
- objections は、資料に出てくる「導入前の懸念」「よくある質問」「顧客の課題・つまずき」を、相手が口にしそうな短い言葉で最大16個。

JSONだけを返す：
{"company":"会社名","product":"プロダクト/サービス名","value":"提供価値（バリュープロップ）","proof":"実績・根拠（数字入りの事例）","pricing":"価格・料金体系（そのまま要約）","plans":[{"name":"プラン名","monthly":90}],"prep":20,"months":6,"objections":["…"]}`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!auth(req, res)) return;
  try {
    const { text = "", pdfs = [] } = await readJson(req);
    const files = (Array.isArray(pdfs) ? pdfs : []).filter(f => f && f.data).slice(0, 5);
    if (String(text).trim().length < 20 && !files.length) return res.status(400).json({ error: "テキストを貼るか、PDFを選んでください" });

    const parts = [{ text: PROMPT }];
    for (const f of files) parts.push({ inlineData: { mimeType: "application/pdf", data: f.data } });
    if (String(text).trim()) parts.push({ text: "【貼り付けテキスト】\n" + String(text).slice(0, 60000) });

    const ai = client();
    const r = await generate(ai, { contents: [{ role: "user", parts }], config: { responseMimeType: "application/json", temperature: 0.2 } });
    const t = r.text || "";
    const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
    const num = v => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
    res.status(200).json({
      company: String(j.company || ""), product: String(j.product || ""), value: String(j.value || ""),
      proof: String(j.proof || ""), pricing: String(j.pricing || ""),
      plans: (Array.isArray(j.plans) ? j.plans : []).map(p => ({ name: String(p.name || ""), monthly: num(p.monthly) })).filter(p => p.name && p.monthly),
      prep: num(j.prep), months: num(j.months),
      objections: (Array.isArray(j.objections) ? j.objections : []).map(String).filter(Boolean).slice(0, 16),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
