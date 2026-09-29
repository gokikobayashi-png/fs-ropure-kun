// GET  /api/knowledge            → { enabled, count, items:[{type,text}] }
// POST /api/knowledge {text,title} → 議事録などを「ロープレに使える知見」に要約してNotionへ追記
import { client, auth, readJson, FRAMEWORK, ZENTECT, generate, knowledgeEnabled, loadKnowledge, appendKnowledge, jstNow } from "./_lib.js";

export default async function handler(req, res) {
  if (!auth(req, res)) return;
  try {
    if (req.method === "GET") {
      const items = knowledgeEnabled() ? await loadKnowledge({ force: true }) : [];
      return res.status(200).json({ enabled: knowledgeEnabled(), count: items.filter(i => !i.type.startsWith("heading")).length, items: items.slice(-40) });
    }
    if (req.method !== "POST") return res.status(405).end();
    if (!knowledgeEnabled()) return res.status(400).json({ error: "Notion連携が未設定です（NOTION_TOKEN / NOTION_KNOWLEDGE_PAGE_ID）" });
    const { text = "", title = "" } = await readJson(req);
    if (text.trim().length < 50) return res.status(400).json({ error: "議事録の本文が短すぎます" });

    const prompt = `${FRAMEWORK}

${ZENTECT}

以下は、ゼンテクトの営業担当が実際に行った商談の議事録（またはメモ）。
これを「音声ロープレの社長役・コーチが次回から使える知見」に変換する。

■ 抽出するもの（該当するものだけ。各1行、80字以内、事実ベースで具体的に）
- 相手の業種・商材・規模と、実際に出てきた数字（単価・課金形態・営業人数・月の行動量・率・受注先の共通点）
- 相手が最初に言った課題の言葉と、本当の課題（4分類のどれか。判定順序で書く）
- 相手が言った反論・懸念・切り返し（料金、回収、業界理解、過去の失敗など）とその言い方
- 効いた質問、効いた言い直し、相手が「そう、それ」と言った瞬間
- 詰まった場面・失敗（聞けていなかった事、早すぎた提案、検算漏れ）
- 提案の落とし所（フル／絞る／座組み変更）と相手の反応
■ 書かないもの：個人名・連絡先・機密の固有名詞（社名は業種＋規模に置き換える）。一般論。

JSONだけを返す：{"summary":"この商談を一言で（60字以内）","lines":["…","…"]}`;
    const ai = client();
    const r = await generate(ai, { contents: prompt + "\n\n【議事録】\n" + text.slice(0, 60000), config: { responseMimeType: "application/json", temperature: 0.3 } });
    const t = r.text || "";
    const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
    const lines = Array.isArray(j.lines) ? j.lines.map(String) : [];
    if (!lines.length) throw new Error("知見を抽出できませんでした");
    await appendKnowledge(lines, `[議事録] ${jstNow()} ${title || j.summary || ""}`.trim());
    res.status(200).json({ ok: true, summary: j.summary || "", lines });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
