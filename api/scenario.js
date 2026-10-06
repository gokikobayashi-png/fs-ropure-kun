// シナリオ企業（実在の会社を想定したロープレ用に、事前に登録しておく会社）。チーム全員で共有する。
//  action=list   … 登録済みの一覧
//  action=read   … 会社名・URL・サービス資料（PDFの文字／貼り付けテキスト）から、会社情報をAIで読み取る（保存はしない）
//  action=save   … 1社を登録・更新
//  action=delete … 1社を削除
import { client, auth, readJson, resultsEnabled, getSetting, setSetting, readCompanySite } from "./_lib.js";
import { cleanProfile, companyProfile } from "./_profile.js";

const KEY = "scenario_companies";
const MAX = 60;
async function load() { const v = await getSetting(KEY); return Array.isArray(v) ? v.filter(x => x && x.id && x.profile) : []; }
function cleanItem(raw, user) {
  const p = cleanProfile({ ...(raw.profile || {}), known: true }, String(raw.name || ""));
  const name = String(raw.name || (p && p.name) || "").trim().slice(0, 80);
  if (!p || !name) return null;
  delete p.known;
  return { id: String(raw.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 24) || Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, url: String(raw.url || "").trim().slice(0, 600), category: String(raw.category || p.category || "").trim().slice(0, 30), profile: { ...p, name }, by: user ? user.short || user.name : "", at: Date.now() };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!auth(req, res)) return;
  try {
    const b = await readJson(req);
    const action = b.action || "list";

    if (action === "read") {
      const name = String(b.name || "").trim().slice(0, 80), url = String(b.url || "").trim().slice(0, 600);
      const docText = String(b.text || "").slice(0, 60000);
      const pdfs = (Array.isArray(b.pdfs) ? b.pdfs : []).filter(f => f && f.data).slice(0, 3);
      if (!name && !url && docText.trim().length < 100 && !pdfs.length) return res.status(400).json({ error: "会社名・URL・サービス資料のどれかを入れてください" });
      let site = { text: "", pages: [], errors: [] };
      if (url) { try { site = await readCompanySite(url); } catch (e) { site.errors.push(String(e.message || e)); } }
      const notes = [];
      const profile = await companyProfile(client(), { name, urls: url, siteText: site.text, docText, pdfs }, notes);
      if (!profile) return res.status(400).json({ error: `「${name || url || "資料"}」の会社情報を読み取れませんでした。サービス紹介のページのURLか資料を足すか、下の項目を手で入力して保存してください。${site.errors.length ? "（読めなかったURL：" + site.errors.join("／") + "）" : ""}`, detail: notes.join(" | ").slice(0, 600) });
      const { known, ...p } = profile;
      return res.json({ profile: p, source: profile.source, pages: site.pages, errors: site.errors });
    }

    if (!resultsEnabled()) return res.json({ shared: false, items: [] });
    if (action === "list") return res.json({ shared: true, items: await load() });
    if (!req.user) return res.status(401).json({ error: "ログインし直してください（メールアドレスが未指定）" });

    if (action === "save") {
      const item = cleanItem(b.item || {}, req.user);
      if (!item) return res.status(400).json({ error: "会社名・事業内容・商材を入れてください" });
      const items = await load();
      const i = items.findIndex(x => x.id === item.id);
      if (i >= 0) items[i] = item; else items.unshift(item);
      if (items.length > MAX) return res.status(400).json({ error: `登録できるのは${MAX}社までです。使わない会社を削除してください` });
      if (JSON.stringify(items).length > 88000) return res.status(400).json({ error: "登録内容が保存できる量を超えました。使わない会社を削除するか、メモを短くしてください" });
      await setSetting(KEY, items, req.user);
      return res.json({ ok: true, item, items });
    }
    if (action === "delete") {
      const items = (await load()).filter(x => x.id !== String(b.id || ""));
      await setSetting(KEY, items, req.user);
      return res.json({ ok: true, items });
    }
    res.status(400).json({ error: "action が不明です" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
