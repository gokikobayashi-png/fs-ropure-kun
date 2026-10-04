// ログイン：共通パスワード＋メンバーのメールアドレスを確認して、本人情報とメンバー一覧を返す
import { auth, readJson, findMember, MEMBERS, resultsEnabled } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!auth(req, res)) return;
  try {
    const body = await readJson(req);
    const m = req.user || findMember(body.email);
    if (!m) return res.status(401).json({ error: "このメールアドレスは登録されていません。管理者（小林）に確認してください" });
    res.json({
      user: { email: m.email, name: m.name, short: m.short || m.name, admin: !!m.admin },
      members: MEMBERS.map(x => ({ email: x.email, name: x.name, short: x.short || x.name, admin: !!x.admin })),
      shared: resultsEnabled(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
