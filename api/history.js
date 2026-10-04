// ロープレ成績（メンバー別・サーバー保存）
//  action=add    … 1回分を保存（本人）
//  action=list   … 本人の記録＋チーム要約。管理者は全員の記録も
//  action=delete … 自分の記録を1件消す（管理者は誰のでも）
//  action=get_setting / set_setting … 全員共通の設定（自社情報など）
import { auth, readJson, MEMBERS, resultsEnabled, addResult, listResults, deleteResult, getSetting, setSetting } from "./_lib.js";

const AXES = ["counterpart", "widen", "classify", "rephrase", "converge", "roi", "numbers"];
function summarize(rows) {
  // メンバーごとの本数・今週・今月・平均総合・軸平均、チーム全体の軸平均
  const now = Date.now(), day = 86400000;
  const byEmail = {};
  for (const m of MEMBERS) byEmail[m.email] = { email: m.email, name: m.name, short: m.short || m.name, admin: !!m.admin, count: 0, week: 0, month: 0, today: 0, totals: [], axes: {}, correct: 0, sec: 0, last: 0 };
  const teamAxes = {};
  for (const { email, entry } of rows) {
    const s = byEmail[email]; if (!s) continue;
    s.count++; s.totals.push(entry.total || 0); if (entry.correct) s.correct++; s.sec += entry.sec || 0; s.last = Math.max(s.last, entry.at || 0);
    const age = now - (entry.at || 0);
    if (age < day) s.today++; if (age < 7 * day) s.week++; if (age < 30 * day) s.month++;
    for (const k of AXES) { const v = entry.scores && entry.scores[k] && entry.scores[k].score; if (v) { (s.axes[k] = s.axes[k] || []).push(v); (teamAxes[k] = teamAxes[k] || []).push(v); } }
  }
  const avg = a => (a && a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null);
  const members = Object.values(byEmail).map(s => ({ ...s, avg: avg(s.totals), axes: Object.fromEntries(AXES.map(k => [k, avg(s.axes[k])])), totals: undefined }));
  return { members, teamAxes: Object.fromEntries(AXES.map(k => [k, avg(teamAxes[k])])), teamAvg: avg(rows.map(r => r.entry.total || 0)), teamCount: rows.length };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!auth(req, res)) return;
  try {
    const body = await readJson(req);
    const user = req.user;
    const action = body.action || "list";
    if (!resultsEnabled()) return res.json({ shared: false, mine: [], all: null, team: null });
    if (action === "get_setting") return res.json({ value: await getSetting(String(body.key || "")) });
    if (!user) return res.status(401).json({ error: "ログインし直してください（メールアドレスが未指定）" });
    if (action === "set_setting") { await setSetting(String(body.key || ""), body.value, user); return res.json({ ok: true }); }
    if (action === "add") {
      const e = body.entry || {};
      if (!e.scores) return res.status(400).json({ error: "entry.scores がありません" });
      const id = await addResult(user, e);
      return res.json({ ok: true, id });
    }
    if (action === "delete") {
      const rows = await listResults({});
      const hit = rows.find(r => r.entry.id === body.id);
      if (!hit) return res.status(404).json({ error: "見つかりません" });
      if (!user.admin && hit.email !== user.email) return res.status(403).json({ error: "自分の記録だけ消せます" });
      await deleteResult(body.id);
      return res.json({ ok: true });
    }
    // list
    const rows = await listResults({});
    const mine = rows.filter(r => r.email === user.email).map(r => r.entry);
    const team = summarize(rows);
    const all = user.admin ? rows.map(r => ({ email: r.email, entry: r.entry })) : null;
    res.json({ shared: true, mine, team, all });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
