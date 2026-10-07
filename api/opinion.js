// ご意見BOX：ロープレのあとに、気になったこと・直してほしいことを送る。毎晩の更新でアプリに反映していく。
//  action=add    … 1件送る（ログイン中のメンバー）
//  action=list   … 一覧（全員分。状態と対応内容つき）
//  action=update … 状態・対応内容を更新（管理者のみ。毎晩の更新タスクが使う）
import { auth, readJson, resultsEnabled, addOpinion, listOpinions, updateOpinion } from "./_lib.js";

const CATS = ["相手役の話し方・中身", "採点・振り返り", "画面・使いやすさ", "不具合", "こんな機能がほしい", "その他"];
const STATUS = ["未対応", "対応中", "対応済み", "検討中", "見送り"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!auth(req, res)) return;
  try {
    const b = await readJson(req);
    const action = b.action || "list";
    if (!resultsEnabled()) return res.json({ shared: false, items: [] });
    if (action === "list") {
      const items = (await listOpinions()).map(x => ({ ...x, email: undefined }));
      return res.json({ shared: true, items, cats: CATS, statuses: STATUS });
    }
    const user = req.user;
    if (!user) return res.status(401).json({ error: "ログインし直してください（メールアドレスが未指定）" });
    if (action === "add") {
      const text = String(b.text || "").trim().slice(0, 2000);
      if (text.length < 3) return res.status(400).json({ error: "ご意見を入れてください" });
      const item = {
        text, cat: CATS.includes(b.cat) ? b.cat : "その他",
        company: String(b.company || "").slice(0, 80), mode: b.mode === "chat" ? "chat" : b.mode === "voice" ? "voice" : "",
        recordUrl: /^https:\/\/(www\.)?notion\.so\/|^https:\/\/app\.notion\.com\//.test(String(b.recordUrl || "")) ? String(b.recordUrl) : "",
        status: "未対応", reply: "", at: Date.now(),
      };
      const id = await addOpinion(user, item);
      return res.json({ ok: true, id });
    }
    if (action === "update") {
      if (!user.admin) return res.status(403).json({ error: "管理者だけが更新できます" });
      const patch = {};
      if (b.status !== undefined) { if (!STATUS.includes(b.status)) return res.status(400).json({ error: "status が不明です" }); patch.status = b.status; }
      if (b.reply !== undefined) patch.reply = String(b.reply).slice(0, 1500);
      if (b.version !== undefined) patch.version = String(b.version).slice(0, 60);
      if (patch.status === "対応済み") patch.doneAt = Date.now();
      await updateOpinion(String(b.id || ""), patch);
      return res.json({ ok: true });
    }
    res.status(400).json({ error: "action が不明です" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
