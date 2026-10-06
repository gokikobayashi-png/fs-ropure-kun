import { GoogleGenAI } from "https://esm.sh/@google/genai";
import { renderAvatar } from "/avatar.js";

const $ = id => document.getElementById(id);
const CAT = { A: "戦略", B: "手法", C: "量", D: "質" };
let persona = null, session = null, transcript = [], picked = null;
let history = [];
let micCtx = null, micStream = null, micNode = null, playCtx = null, nextPlay = 0, sources = [];
let camStream = null, recorder = null, recChunks = [], recDest = null, recUrl = "";
let timerId = null, startedAt = 0, curIn = "", curOut = "", inEl = null, outEl = null, mode = "voice", chatBusy = false;

/* ---------- 認証（ID＝メールアドレス＋共通パスワード） ---------- */
function pw() { try { return (sessionStorage.getItem("pw") || "").normalize("NFKC").replace(/[^\x20-\x7E]/g, ""); } catch (_) { return ""; } }
let user = null, members = [], shared = false; // ログイン中の本人／メンバー一覧／サーバー保存が有効か
function loadUser() { try { user = JSON.parse(sessionStorage.getItem("user") || "null"); } catch (_) { user = null; } return user; }
function uk(k) { return user ? `${k}:${user.email}` : k; } // メンバー別の localStorage キー
async function api(path, body) {
  const r = await fetch("/api/" + path, { method: "POST", headers: { "content-type": "application/json", "x-app-password": pw(), "x-app-user": user ? user.email : "" }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { status("pw-status", j.error || "パスワードが違います"); showLogin(); throw new Error(j.error || "ログインが必要"); }
  if (r.status === 504 || r.status === 502 || r.status === 503) throw new Error("AIの返事に時間がかかりすぎました。もう一度押してください（混み合っていると起きます）");
  if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
  return j;
}
function showLogin() { $("login").hidden = false; $("app").hidden = true; document.body.style.overflow = "hidden"; setTimeout(() => ($("lg-email").value ? $("pw") : $("lg-email")).focus(), 50); }
function hideLogin() { $("login").hidden = true; $("app").hidden = false; document.body.style.overflow = ""; }
function renderUserChip() {
  const c = $("user-chip"); if (!user) { c.hidden = true; return; }
  c.textContent = ""; const b = document.createElement("b"); b.textContent = user.name; c.appendChild(b);
  if (user.admin) { const a = document.createElement("span"); a.className = "adm"; a.textContent = "管理者"; c.appendChild(a); }
  c.hidden = false;
}
async function login() {
  const email = $("lg-email").value.trim().toLowerCase(), p = $("pw").value.normalize("NFKC").trim();
  if (!email) { status("pw-status", "ID（メールアドレス）を入れてください", true); return; }
  if (!p) { status("pw-status", "パスワードを入れてください", true); return; }
  try { sessionStorage.setItem("pw", p); localStorage.setItem("ropure-last-email", email); } catch (_) {}
  $("pw-ok").disabled = true; status("pw-status", "確認中…");
  try {
    user = { email }; // api() がヘッダに載せるため仮置き
    const j = await api("me", { email });
    user = j.user; members = j.members || []; shared = !!j.shared;
    try { sessionStorage.setItem("user", JSON.stringify(user)); } catch (_) {}
    status("pw-status", ""); hideLogin(); $("logout").hidden = false;
    afterLogin();
  } catch (e) { user = null; status("pw-status", e.message, true); }
  finally { $("pw-ok").disabled = false; }
}
$("pw-ok").addEventListener("click", login);
["pw", "lg-email"].forEach(id => $(id).addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); login(); } }));
$("pw-eye").addEventListener("click", () => { const i = $("pw"); i.type = i.type === "password" ? "text" : "password"; });
try { $("lg-email").value = localStorage.getItem("ropure-last-email") || ""; } catch (_) {}
$("logout").addEventListener("click", () => { try { sessionStorage.removeItem("pw"); sessionStorage.removeItem("user"); } catch (_) {} location.reload(); });

/* ---------- 自社情報（このブラウザに保存） ---------- */
const CO_KEY = "ropure-company-v1";
const CO_DEFAULT = {
  company: "株式会社ゼンテクト",
  product: "BtoB営業支援（インサイドセールス／フィールドセールス代行・営業戦略・セールスカイゼン）",
  value: "営業代行でも自社採用でもない、最短で自ら正解を探し出す成長パートナー。ターゲット選定〜リサーチ・トーク設計〜アポ獲得〜データ分析・改善設計を、短いスパンでPDCAを回しきる。",
  proof: "建設業向けサービス、AI・データ活用、製造業向け、物流向け、営業DX、リーガルテックなどの支援実績。建設現場CO2排出量算定サービスでは、不明瞭だった訴求軸を設計。相手の声「何社か話した中で一番納得感がある」。",
  pricing: "固定報酬型：ISプラン 月90万円／一気通貫プラン 月130万円（各130時間/人月、PM費用は月額の10%）、準備費用20万円、最低6ヶ月。成果報酬型：準備費用20万円＋アポ1件 役員以上7万／部長5万／担当者3万。",
  plans: [{ name: "ISプラン", monthly: 90 }, { name: "一気通貫プラン", monthly: 130 }],
  prep: 20, months: 6, trial_months: 3, calls: 1000, apo_rate: 1, win_rate: 5, in_calls: 100, in_apo_rate: 30, in_win_rate: 20,
  objections: ["それ払って回収できるのか", "うちの単価で何件取れば元が取れるのか", "本当にうちの業界が分かるのか", "アポだけ取って質が低いんじゃないか", "前に営業代行を使って失敗した", "最低6ヶ月は長い"],
};
let company = null; // 保存済みの自社情報（null なら既定）
function loadCompany() { try { const v = JSON.parse(localStorage.getItem(CO_KEY) || "null"); company = v && v.company ? v : null; } catch (_) { company = null; } }
function co() { return company || CO_DEFAULT; }
function coForApi() { return company; } // 既定のときはサーバ側の詳しいゼンテクト情報を使う
const numOr = (v, d) => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? d : Number(v));

function listRow(box, value, kind) {
  const row = document.createElement("div"); row.className = "list-row";
  const a = document.createElement("input"); a.type = "text"; a.value = kind === "plan" ? value.name || "" : value || "";
  a.placeholder = kind === "plan" ? "プラン名（例：ISプラン）" : "例：現場が嫌がる";
  row.appendChild(a);
  if (kind === "plan") { const b = document.createElement("input"); b.type = "number"; b.min = "0"; b.step = "1"; b.className = "yen"; b.placeholder = "月額 万円"; b.value = value.monthly ?? ""; row.appendChild(b); }
  const x = document.createElement("button"); x.type = "button"; x.className = "btn x"; x.textContent = "×"; x.setAttribute("aria-label", "削除");
  x.addEventListener("click", () => { row.remove(); countObjs(); });
  row.appendChild(x); box.appendChild(row);
  if (kind !== "plan") a.addEventListener("input", countObjs);
  return a;
}
function countObjs() { $("co-obj-n").textContent = [...$("co-objs").querySelectorAll("input")].filter(i => i.value.trim()).length; }
function fillCompany(c) {
  $("co-company").value = c.company || ""; $("co-product").value = c.product || ""; $("co-value").value = c.value || "";
  $("co-proof").value = c.proof || ""; $("co-pricing").value = c.pricing || "";
  $("co-plans").textContent = ""; (c.plans && c.plans.length ? c.plans : [{ name: "", monthly: "" }]).forEach(pl => listRow($("co-plans"), pl, "plan"));
  $("co-prep").value = c.prep ?? ""; $("co-months").value = c.months ?? ""; $("co-trial").value = c.trial_months ?? "";
  $("co-calls").value = c.calls ?? ""; $("co-apo").value = c.apo_rate ?? ""; $("co-win").value = c.win_rate ?? "";
  $("co-in-calls").value = c.in_calls ?? ""; $("co-in-apo").value = c.in_apo_rate ?? ""; $("co-in-win").value = c.in_win_rate ?? "";
  $("co-objs").textContent = ""; (c.objections || []).forEach(o => listRow($("co-objs"), o, "obj")); countObjs();
}
function readCompanyForm() {
  const d = CO_DEFAULT;
  return {
    company: $("co-company").value.trim(), product: $("co-product").value.trim(), value: $("co-value").value.trim(),
    proof: $("co-proof").value.trim(), pricing: $("co-pricing").value.trim(),
    plans: [...$("co-plans").querySelectorAll(".list-row")].map(r => { const i = r.querySelectorAll("input"); return { name: i[0].value.trim(), monthly: numOr(i[1].value, 0) }; }).filter(x => x.name && x.monthly > 0),
    prep: numOr($("co-prep").value, 0), months: numOr($("co-months").value, d.months), trial_months: numOr($("co-trial").value, d.trial_months),
    calls: numOr($("co-calls").value, d.calls), apo_rate: numOr($("co-apo").value, d.apo_rate), win_rate: numOr($("co-win").value, d.win_rate),
    in_calls: numOr($("co-in-calls").value, d.in_calls), in_apo_rate: numOr($("co-in-apo").value, d.in_apo_rate), in_win_rate: numOr($("co-in-win").value, d.in_win_rate),
    objections: [...$("co-objs").querySelectorAll("input")].map(i => i.value.trim()).filter(Boolean),
  };
}
function showCoState() { $("co-state").textContent = company ? "保存済み：" + company.company + "／" + company.product : "既定（ゼンテクト）"; fillCompany(co()); }
$("co-plan-add").addEventListener("click", () => listRow($("co-plans"), { name: "", monthly: "" }, "plan").focus());
$("co-obj-add").addEventListener("click", () => { listRow($("co-objs"), "", "obj").focus(); countObjs(); });
$("co-save").addEventListener("click", () => {
  const c = readCompanyForm();
  if (!c.company || !c.product) { status("co-status", "会社名とプロダクト/サービスは必須です", true); return; }
  if (!c.plans.length) { status("co-status", "検算に使う月額プランを1つ以上入れてください", true); return; }
  company = c; try { localStorage.setItem(CO_KEY, JSON.stringify(c)); } catch (_) {}
  showCoState(); status("co-status", "保存しました。次に相手を生成するときから反映されます");
  if (shared) api("history", { action: "set_setting", key: "company", value: c }).then(() => status("co-status", "保存しました（全メンバー共通）。次に相手を生成するときから反映されます")).catch(e => status("co-status", "この端末には保存。共有保存に失敗：" + e.message, true));
});
$("co-reset").addEventListener("click", () => {
  company = null; try { localStorage.removeItem(CO_KEY); } catch (_) {}
  fillCompany(CO_DEFAULT); showCoState(); status("co-status", "既定（ゼンテクト）に戻しました");
  if (shared) api("history", { action: "set_setting", key: "company", value: null }).catch(() => {});
});
function fileB64(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej(r.error); r.readAsDataURL(f); }); }
$("co-read").addEventListener("click", async () => {
  const text = $("co-src").value.trim(); const files = [...$("co-pdf").files];
  if (text.length < 20 && !files.length) { status("co-read-status", "テキストを貼るか、PDFを選んでください", true); return; }
  const total = files.reduce((a, f) => a + f.size, 0);
  if (total > 3 * 1024 * 1024) { status("co-read-status", "PDFが合計3MBを超えています。ページを絞るか、本文をテキストで貼ってください", true); return; }
  $("co-read").disabled = true; status("co-read-status", "AIが資料を読んでいます（10〜40秒）…");
  try {
    const pdfs = await Promise.all(files.map(async f => ({ name: f.name, data: await fileB64(f) })));
    const j = await api("company", { text, pdfs });
    const cur = readCompanyForm();
    fillCompany({ ...cur, ...Object.fromEntries(Object.entries(j).filter(([k, v]) => v !== null && v !== "" && !(Array.isArray(v) && !v.length))), trial_months: cur.trial_months, calls: cur.calls, apo_rate: cur.apo_rate, win_rate: cur.win_rate });
    status("co-read-status", "読み取りました。内容を確認・編集して「保存する」を押してください（資料に無い項目は元の値のまま）");
  } catch (e) { status("co-read-status", e.message, true); }
  finally { $("co-read").disabled = false; }
});
loadCompany(); showCoState();

/* ---------- 知見（Notion） ---------- */
async function loadKnow() {
  try {
    const r = await fetch("/api/knowledge", { headers: { "x-app-password": pw() } });
    const j = await r.json();
    if (r.status === 401) { $("know-status").textContent = "ログイン後に表示"; status("pw-status", j.error || "パスワードが違います"); showLogin(); return; }
    if (!j.enabled) { $("know-status").textContent = "未接続（Notion連携を設定すると使えます）"; $("know-add").disabled = true; return; }
    $("know-status").textContent = j.count + " 件の知見をロープレに反映中";
    $("know-add").disabled = false;
    const ul = $("know-list"); ul.textContent = "";
    (j.items || []).slice().reverse().forEach(it => { const li = document.createElement("li"); li.textContent = (it.type.startsWith("heading") ? "■ " : "") + it.text; ul.appendChild(li); });
    $("know-list-wrap").hidden = !(j.items && j.items.length);
  } catch (e) { $("know-status").textContent = "読み込み失敗：" + e.message; }
}
$("know-add").addEventListener("click", async () => {
  const text = $("know-text").value.trim(); if (text.length < 50) { status("know-result", "本文が短すぎます（50字以上）", true); return; }
  $("know-add").disabled = true; status("know-result", "AIが知見に変換しています（10〜30秒）…");
  try {
    const j = await api("knowledge", { text, title: $("know-title").value.trim(), company: coForApi() });
    status("know-result", "追記しました：" + (j.summary || "") + "（" + j.lines.length + "行）");
    $("know-text").value = ""; $("know-title").value = "";
    loadKnow();
  } catch (e) { status("know-result", e.message, true); }
  finally { $("know-add").disabled = false; }
});
async function afterLogin() {
  renderUserChip();
  loadTemplates(); renderTemplates(); loadChecks(); renderChecks(); loadMissed(); renderMissed(); loadHistory();
  $("dash-seg").hidden = !(user && user.admin);
  loadKnow();
  if (shared) {
    api("history", { action: "get_setting", key: "company" }).then(j => { if (j.value && j.value.company) { company = j.value; try { localStorage.setItem(CO_KEY, JSON.stringify(company)); } catch (_) {} fillCompany(company); showCoState(); } }).catch(() => {});
  }
  await syncHistory();
  renderDash();
}

/* ---------- 画面遷移 ---------- */
function view(name) {
  ["play", "dash", "history", "settings"].forEach(v => { $("view-" + v).hidden = v !== name; });
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.view === name));
  if (name === "dash") { renderDash(); if (dashScope === "team") renderTeam(); }
  if (name === "history") renderHistory();
  if (name === "settings") { renderChecks(); renderMissed(); }
  window.scrollTo(0, 0);
}
document.querySelectorAll("#tabs button").forEach(b => b.addEventListener("click", () => view(b.dataset.view)));
document.querySelectorAll("#setnav button").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll("#setnav button").forEach(x => x.classList.toggle("on", x === b));
  ["co", "fb", "missed", "know", "data"].forEach(id => { $(id).hidden = id !== b.dataset.set; });
}));
["fb", "missed", "know", "data"].forEach(id => { $(id).hidden = true; });
try { $("rec-default").checked = localStorage.getItem("ropure-rec-default") === "1"; $("rec-on").checked = $("rec-default").checked; } catch (_) {}
$("rec-default").addEventListener("change", () => { try { localStorage.setItem("ropure-rec-default", $("rec-default").checked ? "1" : "0"); } catch (_) {} $("rec-on").checked = $("rec-default").checked; });
$("export-btn").addEventListener("click", () => {
  const data = {}; ["ropure-company-v1", uk("ropure-boss-fb-v1"), uk("ropure-missed-quiz-v1"), uk("ropure-history-v1"), uk("ropure-templates-v1")].forEach(k => { try { data[k] = JSON.parse(localStorage.getItem(k) || "null"); } catch (_) {} });
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "zenai-ropure-" + jst() + ".json"; a.click();
});
$("data-clear").addEventListener("click", () => { history = []; saveHistory(); missed = []; saveMissed(); renderDash(); status("gen-status", ""); });
function rtab(name) {
  ["q", "eval", "info"].forEach(t => { $("rt-" + t).hidden = t !== name; });
  document.querySelectorAll("#rtabs button").forEach(b => b.classList.toggle("on", b.dataset.rt === name));
}
document.querySelectorAll("#rtabs button").forEach(b => b.addEventListener("click", () => rtab(b.dataset.rt)));
function step(n) {
  view("play");
  [1, 2, 3, 4].forEach(i => { $("s" + i).classList.toggle("on", i === n); });
  $("step1").hidden = n !== 1; $("step2").hidden = n !== 2; $("step3").hidden = n !== 3; $("step4").hidden = n !== 4;
}
function status(id, text, err) { const e = $(id); e.textContent = text || ""; e.classList.toggle("err", !!err); }

/* ---------- ① スタイル選択・テンプレート ---------- */
let styleKey = "";
const STYLE_NAME = { "": "ランダム", analytical: "アナリティカル", driver: "ドライバー", amiable: "エミアブル", expressive: "エクスプレッシブ" };
document.querySelectorAll("#styles .stylecard").forEach(b => b.addEventListener("click", () => { styleKey = b.dataset.style || ""; document.querySelectorAll("#styles .stylecard").forEach(x => x.classList.toggle("on", x === b)); }));
function caseSettings() { return { real_name: $("real-name").value.trim(), real_url: $("real-url").value.trim(), industry: $("industry").value.trim(), product: $("product").value.trim(), size: $("size").value.trim(), sales_team: $("sales-team").value.trim(), difficulty: $("difficulty").value, layer: $("layer").value, answer: $("answer").value, style: styleKey }; }
function applyCase(c) { $("real-name").value = c.real_name || ""; $("real-url").value = c.real_url || ""; $("industry").value = c.industry || ""; $("product").value = c.product || ""; $("size").value = c.size || ""; $("sales-team").value = c.sales_team || ""; $("difficulty").value = c.difficulty || "normal"; $("layer").value = c.layer || ""; $("answer").value = c.answer || ""; styleKey = c.style || ""; document.querySelectorAll("#styles .stylecard").forEach(x => x.classList.toggle("on", (x.dataset.style || "") === styleKey)); }
const TPL_KEY = "ropure-templates-v1";
let templates = [];
function loadTemplates() { try { templates = JSON.parse(localStorage.getItem(uk(TPL_KEY)) || "[]"); if (!Array.isArray(templates)) templates = []; } catch (_) { templates = []; } }
function saveTemplates() { try { localStorage.setItem(uk(TPL_KEY), JSON.stringify(templates.slice(0, 30))); } catch (_) {} renderTemplates(); }
const LAYER_NAME = { "": "レイヤー任意", ceo: "社長", director: "営業本部長", sales_mgr: "営業部長", section: "営業課長", marketing: "マーケ責任者", bizdev: "新規事業部長", planning: "経営企画", is_lead: "ISリーダー" };
const DIFF_NAME = { easy: "協力的", normal: "普通", hard: "手強い" };
function renderTemplates() {
  const box = $("tpls"); box.textContent = "";
  if (!templates.length) { const p = document.createElement("p"); p.className = "hint"; p.style.margin = "6px 0 0"; p.textContent = "まだありません。設定を入れて「今の設定を保存」を押すと、ここに並びます。"; box.appendChild(p); return; }
  templates.forEach(t => {
    const b = document.createElement("button"); b.type = "button"; b.className = "tpl";
    const tag = document.createElement("span"); tag.className = "tag"; tag.textContent = STYLE_NAME[t.style || ""] || "ランダム"; b.appendChild(tag);
    const x = document.createElement("button"); x.type = "button"; x.className = "btn x"; x.textContent = "×"; x.setAttribute("aria-label", "削除"); x.addEventListener("click", e => { e.stopPropagation(); templates = templates.filter(y => y !== t); saveTemplates(); }); b.appendChild(x);
    const nm = document.createElement("b"); nm.textContent = t.name; b.appendChild(nm);
    const uses = history.filter(h => h.tpl === t.id); const avg = uses.length ? (uses.reduce((a, h) => a + h.total, 0) / uses.length).toFixed(1) : "—";
    const sm = document.createElement("small"); sm.textContent = (DIFF_NAME[t.difficulty] || "普通") + " ・ " + (t.layer ? (LAYER_NAME[t.layer] || "") : "レイヤー任意") + " ・ 使用 " + uses.length + "回 ・ 平均 " + avg; b.appendChild(sm);
    b.addEventListener("click", () => { applyCase(t); currentTpl = t.id; status("gen-status", "テンプレート「" + t.name + "」を読み込みました"); });
    box.appendChild(b);
  });
}
let currentTpl = null;
$("tpl-save").addEventListener("click", () => {
  const c = caseSettings();
  const name = [c.real_name || (c.real_url ? c.real_url.split(/\s+/)[0].replace(/^https?:\/\//, "").split("/")[0] : ""), c.industry, c.product, c.layer ? LAYER_NAME[c.layer] : ""].filter(Boolean).join("・") || "名前なしの相手";
  const t = { id: Date.now().toString(36), name, ...c }; templates.unshift(t); currentTpl = t.id; saveTemplates(); status("gen-status", "保存しました：" + name);
});
["real-name", "real-url", "industry", "product", "size", "sales-team", "layer", "difficulty", "answer"].forEach(id => $(id).addEventListener("input", () => { currentTpl = null; }));

/* ---------- ① → ② ペルソナ生成 ---------- */
async function generate() {
  $("gen").disabled = true; lockStart(true); status("gen-status", "相手を用意しています（10〜40秒）…");
  try {
    persona = await api("persona", { ...caseSettings(), company: coForApi() }); persona.tpl = currentTpl;
    $("p-company").textContent = persona.company;
    $("p-brief").textContent = persona.brief;
    const rn = $("p-real"); rn.textContent = ""; rn.hidden = !persona.real;
    if (persona.real) { const b = document.createElement("b"); b.textContent = "実在の会社を想定しています。"; rn.appendChild(b); const errs = persona.real.errors || [];
      rn.appendChild(document.createTextNode(" 担当者と社内の数字（営業体制・商談数・売上目標など）は架空です。" + ((persona.real.pages || []).length ? "読んだページ：" + persona.real.pages.join("、") : persona.real.url ? "サイトは読めなかったので、社名から分かる範囲で作りました。" : "URLなしなので、社名から分かる範囲で作りました。") + (persona.real.thin && (persona.real.pages || []).length ? "（ページから読める文章が少なかったので、サービス紹介のページのURLを足すと精度が上がります）" : "") + (errs.length ? " 読めなかったURL：" + errs.join("／") : ""))); }
    $("p-name").textContent = persona.name + "（役職は商談で確認）";
    renderAvatar($("p-avatar"), persona); renderAvatar($("call-avatar"), persona);
    $("call-name").textContent = persona.name; $("call-company").textContent = persona.company;
    $("call-brief").textContent = persona.brief; $("call-role").textContent = "役職は商談で確認";
    status("gen-status", ""); status("call-status", "");
    step(2);
  } catch (e) { status("gen-status", e.message, true); }
  finally { $("gen").disabled = false; lockStart(false); }
}
$("gen").addEventListener("click", generate);
$("regen").addEventListener("click", generate);

/* ---------- ③ 音声ロープレ ---------- */
function addMsg(who, text) {
  const d = document.createElement("div"); d.className = "msg " + who;
  if (who !== "sys") { const w = document.createElement("span"); w.className = "who"; const t = document.createElement("span"); t.className = "t"; t.textContent = $("timer").textContent; w.appendChild(t); w.appendChild(document.createTextNode(who === "me" ? "あなた" : persona.name)); d.appendChild(w); }
  d.appendChild(document.createTextNode(text)); $("transcript").appendChild(d); $("transcript").scrollTop = 1e9; return d;
}
function setMsg(d, text) { const w = d.querySelector(".who"); d.textContent = ""; if (w) d.appendChild(w); d.appendChild(document.createTextNode(text)); $("transcript").scrollTop = 1e9; }
function flushIn() { if (curIn.trim()) transcript.push({ who: "me", text: curIn.trim() }); curIn = ""; inEl = null; }
function flushOut(guard = true) { const t = curOut.trim(); if (t) transcript.push({ who: "them", text: t }); curOut = ""; outEl = null; if (t && guard) guardLanguage(t); }

// 相手役が日本語以外で話し出したら、日本語に戻す（Gemini Live は聞き取りにくい音声を別の言語と誤認すると、その言語で返すことがある）
function looksJapanese(text) {
  const letters = String(text || "").match(/\p{L}/gu) || [];
  if (letters.length < 12) return true;
  const kana = letters.filter(c => /[\u3040-\u30ff]/.test(c)).length;
  return kana / letters.length >= 0.1;
}
let langFixAt = 0;
function guardLanguage(text) {
  if (mode !== "voice" || !session || looksJapanese(text)) return;
  if (Date.now() - langFixAt < 8000) return; // 連続で割り込まない
  langFixAt = Date.now();
  stopPlayback();
  addMsg("sys", "相手が日本語以外で話したので、日本語で言い直させています");
  try {
    session.sendClientContent({ turns: [{ role: "user", parts: [{ text: "（注意：今の発言は日本語ではなかった。この商談は日本語だけで行う。営業担当は日本語で話している。直前の発言を、同じ人物のまま日本語で短く言い直す。以後も必ず日本語だけで話す）" }] }], turnComplete: true });
  } catch (e) { console.error(e); }
}

function b64ToPcm(b64) {
  const bin = atob(b64), n = bin.length / 2, out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = (bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)); out[i] = (v >= 0x8000 ? v - 0x10000 : v) / 0x8000; }
  return out;
}
function play(b64) {
  if (!playCtx) return;
  const pcm = b64ToPcm(b64);
  const buf = playCtx.createBuffer(1, pcm.length, 24000); buf.getChannelData(0).set(pcm);
  const src = playCtx.createBufferSource(); src.buffer = buf; src.connect(playCtx.destination); if (recDest) src.connect(recDest);
  const t = Math.max(playCtx.currentTime + 0.02, nextPlay); src.start(t); nextPlay = t + buf.duration;
  sources.push(src); talking(true); src.onended = () => { sources = sources.filter(s => s !== src); if (!sources.length) talking(false); };
}
function stopPlayback() { sources.forEach(s => { try { s.stop(); } catch (_) {} }); sources = []; nextPlay = 0; talking(false); }
let talkTimer = null;
function talking(on, ms) {
  clearTimeout(talkTimer); $("call-avatar").classList.toggle("talking", on);
  if (on && ms) talkTimer = setTimeout(() => $("call-avatar").classList.remove("talking"), ms);
}

function onMessage(m) {
  const sc = m.serverContent; if (!sc) return;
  if (sc.interrupted) { stopPlayback(); flushOut(); return; }
  if (sc.inputTranscription && sc.inputTranscription.text) {
    if (curOut) flushOut();
    curIn += sc.inputTranscription.text;
    if (!inEl) inEl = addMsg("me", curIn); else setMsg(inEl, curIn);
  }
  if (sc.outputTranscription && sc.outputTranscription.text) {
    if (curIn) flushIn();
    curOut += sc.outputTranscription.text;
    if (!outEl) outEl = addMsg("them", curOut); else setMsg(outEl, curOut);
  }
  if (sc.modelTurn && sc.modelTurn.parts) for (const p of sc.modelTurn.parts) if (p.inlineData && p.inlineData.data) play(p.inlineData.data);
  if (sc.turnComplete) flushOut();
}

function setMode(m) {
  mode = m;
  const chat = m === "chat";
  $("mode-label").textContent = chat ? "チャットロープレ" : "音声ロープレ";
  $("nocam-hint").textContent = chat ? "相手の返事は下の会話に出ます" : "カメラをオンにすると、ここに自分の映像が出ます";
  $("chatbox").hidden = !chat; $("chat-hint").hidden = !chat; $("voice-hint").hidden = chat;
  $("meter").parentElement.hidden = chat;
  $("cc-btn").hidden = chat; $("cc-btn").setAttribute("aria-pressed", "false");
  $("transcript").hidden = !chat;
  $("selfbox").classList.toggle("chatmode", chat);
  if (chat) $("selfbox").insertBefore($("transcript"), $("chatbox")); else $("step3").querySelector(".callmain").appendChild($("transcript"));
  status("chat-status", ""); status("call-status2", "");
}
$("cc-btn").addEventListener("click", () => { const on = $("cc-btn").getAttribute("aria-pressed") !== "true"; $("cc-btn").setAttribute("aria-pressed", String(on)); $("transcript").hidden = !on; });
function startTimer() {
  startedAt = Date.now(); $("timer").textContent = "00:00";
  timerId = setInterval(() => { const s = Math.floor((Date.now() - startedAt) / 1000); $("timer").textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }, 500);
}
function lockStart(on) { $("call").disabled = on; $("chat-start").disabled = on; $("regen").disabled = on; }

async function startCall() {
  lockStart(true); setMode("voice"); resetQuiz(); status("call-status", "マイクの許可 → 接続中…");
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const { token, model, config } = await api("token", { persona, company: coForApi() });

    playCtx = new AudioContext({ sampleRate: 24000 }); await playCtx.resume();
    await startRecording();
    const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } });
    let opened;
    const openP = new Promise((res, rej) => { opened = { res, rej }; });
    session = await ai.live.connect({
      model, config,
      callbacks: {
        onopen: () => opened.res(),
        onmessage: onMessage,
        onerror: e => { status("call-status", "接続エラー：" + (e.message || e), true); opened.rej(e); },
        onclose: e => { if (timerId) endCall("接続が切れました" + (e && e.reason ? "：" + e.reason : "")); },
      },
    });
    await openP;

    // マイク → 16kHz PCM → Gemini
    micCtx = new AudioContext(); await micCtx.audioWorklet.addModule("/pcm-capture.js");
    const src = micCtx.createMediaStreamSource(micStream);
    micNode = new AudioWorkletNode(micCtx, "pcm-capture");
    micNode.port.onmessage = ev => {
      const bytes = new Uint8Array(ev.data); let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      try { session.sendRealtimeInput({ audio: { data: btoa(s), mimeType: "audio/pcm;rate=16000" } }); } catch (_) {}
      // レベルメーター
      const i16 = new Int16Array(ev.data); let sum = 0; for (let i = 0; i < i16.length; i += 8) sum += Math.abs(i16[i]);
      $("meter").style.width = Math.min(100, (sum / (i16.length / 8)) / 60) + "%";
    };
    src.connect(micNode); // 出力には繋がない（自分の声は再生しない）

    transcript = []; $("transcript").textContent = ""; curIn = curOut = ""; inEl = outEl = null;
    addMsg("sys", persona.company + " " + persona.name + "との商談。ゴール：課題を言い直して合意を取る");
    step(3); $("dot").classList.add("live"); $("hangup").disabled = false; status("call-status", "");
    startTimer();

    // 会話は受講者から始める（相手は黙って待つ）
    session.sendClientContent({ turns: [{ role: "user", parts: [{ text: "（商談が始まった。営業担当が着席した。営業担当が先に話すので、あなたは黙って待つ）" }] }], turnComplete: false });
    addMsg("sys", "あなたから話しかけてください（例：本日はお時間ありがとうございます。今回どのあたりにご興味を持っていただけたんでしょうか）");
  } catch (e) {
    status("call-status", "開始できませんでした：" + (e.message || e), true); cleanupAudio();
    lockStart(false);
  }
}
async function startRecording() {
  recorder = null; recChunks = []; recDest = null; $("selfcam").hidden = true; $("playback").hidden = true;
  if (!$("rec-on").checked || typeof MediaRecorder === "undefined") return;
  try {
    try { camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } }); } catch (_) { camStream = null; }
    if (camStream) { $("selfvid").srcObject = camStream; $("selfcam").hidden = false; }
    recDest = playCtx.createMediaStreamDestination();
    playCtx.createMediaStreamSource(micStream).connect(recDest); // 自分の声
    const tracks = [...(camStream ? camStream.getVideoTracks() : []), ...recDest.stream.getAudioTracks()];
    const mime = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4", "audio/webm"].find(m => MediaRecorder.isTypeSupported(m)) || "";
    recorder = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
    recorder.start(1000);
    if (!camStream) status("call-status2", "カメラが使えないので、声だけ録画します");
  } catch (e) { console.error(e); status("call-status2", "録画を開始できませんでした：" + (e.message || e), true); }
}
function stopRecording() {
  const r = recorder; recorder = null;
  try { camStream && camStream.getTracks().forEach(t => t.stop()); } catch (_) {} camStream = null; $("selfcam").hidden = true;
  if (!r) return;
  const finish = () => {
    if (!recChunks.length) return;
    const blob = new Blob(recChunks, { type: r.mimeType || "video/webm" });
    if (recUrl) URL.revokeObjectURL(recUrl); recUrl = URL.createObjectURL(blob);
    const isVideo = /video/.test(blob.type);
    const name = "ロープレ_" + (user ? (user.short || user.name) : "") + "_" + jst() + "_" + (persona ? persona.company : "") + (isVideo ? ".webm" : ".weba");
    $("rec-dl").href = recUrl; $("rec-dl").download = name;
    $("rec-info").textContent = (isVideo ? "映像＋音声" : "音声のみ") + "／" + (blob.size / 1048576).toFixed(1) + "MB。このブラウザを閉じると消えるので、残すなら保存を";
    const v = $("rec-play"); v.hidden = false; v.src = recUrl;
    $("playback").hidden = false;
  };
  if (r.state !== "inactive") { r.onstop = finish; r.stop(); } else finish();
}
function jst() { const d = new Date(Date.now() + 9 * 3600 * 1000); return d.toISOString().slice(0, 16).replace("T", "_").replace(":", ""); }
function cleanupAudio() {
  stopRecording();
  try { micNode && micNode.disconnect(); } catch (_) {}
  try { micStream && micStream.getTracks().forEach(t => t.stop()); } catch (_) {}
  try { micCtx && micCtx.close(); } catch (_) {}
  stopPlayback(); try { playCtx && playCtx.close(); } catch (_) {}
  micNode = micStream = micCtx = playCtx = null;
}
function endCall(note) {
  clearInterval(timerId); timerId = null;
  flushIn(); flushOut(false);
  try { session && session.close(); } catch (_) {} session = null;
  cleanupAudio();
  $("dot").classList.remove("live"); $("hangup").disabled = true;
  $("chat-input").disabled = true; $("chat-send").disabled = true;
  if (note) addMsg("sys", note);
  picked = null; document.querySelectorAll("#opts .opt").forEach(b => { b.setAttribute("aria-pressed", "false"); b.classList.remove("correct", "wrong"); b.disabled = false; });
  $("rephrase").value = ""; $("overview").value = ""; $("proposal").value = ""; ["premise-value", "premise-target", "premise-person"].forEach(id => { $(id).value = ""; }); resetCalc(); $("verdict").hidden = true; $("feedback").hidden = true; $("again").hidden = true; $("grade").disabled = false; status("grade-status", "");
  resetResult();
  if (mode === "voice" && transcript.length) voiceQuiz().then(() => showResult()); else showResult();
}
function resetResult() {
  $("res-date").textContent = new Date().toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  $("res-company").textContent = persona.company + " ／ " + persona.name + "（役職は判定後に表示）";
  $("res-mode").textContent = (mode === "chat" ? "チャット" : "音声") + " ・ " + $("timer").textContent;
  $("res-good").textContent = ""; $("res-improve").textContent = ""; $("res-radar").innerHTML = ""; $("res-axes").textContent = ""; $("video-url").value = ""; status("video-status", ""); lastEntry = null;
  $("res-grade").textContent = "–"; $("res-total").textContent = ""; coachSayRes("判定すると、ここに所見が出ます。"); gofastSay("判定すると、論理の穴を指摘します。");
  renderResInfo(false);
  rtab("q");
}
function showResult() {
  const box = $("res-transcript"); box.textContent = "";
  transcript.forEach(t => { const d = document.createElement("div"); d.className = "msg " + t.who; const w = document.createElement("span"); w.className = "who"; w.textContent = (t.who === "me" ? "あなた" : persona.name); d.appendChild(w); d.appendChild(document.createTextNode(t.text)); box.appendChild(d); });
  if (!transcript.length) { const d = document.createElement("div"); d.className = "msg sys"; d.textContent = "（会話なし）"; box.appendChild(d); }
  step(4);
}
/* ---------- 読み上げ（ブラウザの音声合成。無料・端末の声） ---------- */
function jaVoices() { return speechSynthesis.getVoices().filter(v => /^ja/i.test(v.lang)); }
function pickVoice() {
  const vs = jaVoices(); let pref = ""; try { pref = localStorage.getItem("ropure-voice") || ""; } catch (_) {}
  return vs.find(v => v.name === pref) || vs.find(v => /Otoya|Hattori|Ichiro|Keita|Daichi|Naoki|male|男/i.test(v.name) && !/female/i.test(v.name)) || vs.find(v => /Google|Microsoft/i.test(v.name)) || vs[0] || null;
}
function renderVoices() {
  const sel = $("voice-sel"); if (!sel) return; const vs = jaVoices(); sel.textContent = "";
  if (!vs.length) { const o = document.createElement("option"); o.textContent = "日本語の音声が見つかりません"; sel.appendChild(o); return; }
  const cur = pickVoice();
  vs.forEach(v => { const o = document.createElement("option"); o.value = v.name; o.textContent = v.name + (v.localService ? "" : "（オンライン）"); if (cur && cur.name === v.name) o.selected = true; sel.appendChild(o); });
}
if ("speechSynthesis" in window) { renderVoices(); speechSynthesis.onvoiceschanged = renderVoices; }
$("voice-sel").addEventListener("change", () => { try { localStorage.setItem("ropure-voice", $("voice-sel").value); } catch (_) {} });
$("voice-test").addEventListener("click", () => speak("判定は不正解です。正解は手法です。次回は冒頭3分で、相手の売上目標と現状の着地見込みを聞いてください。"));
function speak(text, btn, stopBtn) {
  if (!("speechSynthesis" in window)) { alert("このブラウザは読み上げに対応していません"); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(String(text || "").replace(/\n+/g, "。")); u.lang = "ja-JP"; u.rate = 1.05;
  const v = pickVoice(); if (v) u.voice = v;
  u.pitch = v && /Otoya|Hattori|Ichiro|Keita|Daichi|Naoki|male|男/i.test(v.name) ? 0.95 : 0.6; // 男声が無い端末では低めにする
  if (stopBtn) { stopBtn.hidden = false; u.onend = u.onerror = () => { stopBtn.hidden = true; }; }
  speechSynthesis.speak(u);
}
if ("speechSynthesis" in window) speechSynthesis.getVoices();
$("res-speak").addEventListener("click", () => speak($("res-coach").textContent.replace(/^Mr\. KOHEI/, ""), $("res-speak"), $("res-speak-stop")));
$("res-speak-stop").addEventListener("click", () => { speechSynthesis.cancel(); $("res-speak-stop").hidden = true; });
$("dash-speak").addEventListener("click", () => speak($("coach-say").textContent.replace(/^Mr\. KOHEI/, "")));
$("res-speak2").addEventListener("click", () => speak($("res-gofast").textContent.replace(/^Mr\. Go fast ／ 論理の指摘/, "")));
$("dash-speak2").addEventListener("click", () => speak($("dash-gofast").textContent.replace(/^Mr\. Go fast ／ 量/, "")));
function gofastSay(text) { const b = $("res-gofast"); b.textContent = ""; const n = document.createElement("span"); n.className = "nm"; n.textContent = "Mr. Go fast ／ 論理の指摘"; b.appendChild(n); b.appendChild(document.createTextNode(text)); }
function coachSayRes(text) { const b = $("res-coach"); b.textContent = ""; const n = document.createElement("span"); n.className = "nm"; n.textContent = "Mr. KOHEI"; b.appendChild(n); b.appendChild(document.createTextNode(text)); }
function renderResInfo(graded) {
  const box = $("res-info"); box.textContent = "";
  const kv = document.createElement("div"); kv.className = "kv";
  const row = (k, v) => { const d = document.createElement("div"); const b = document.createElement("b"); b.textContent = k + "："; d.appendChild(b); d.appendChild(document.createTextNode(v || "")); kv.appendChild(d); };
  row("会社", persona.company); row("会社概要", persona.brief); row("相手", persona.name);
  if (persona.real) row("想定", "実在の会社（担当者と社内の数字は架空）" + (persona.real.url ? " " + persona.real.url : ""));
  if (graded) { if (persona.value) row("誰のどんな課題を解決しているサービスか", persona.value); if (persona.target_why) row("なぜそのターゲットなのか", persona.target_why); if (persona.person_job) row("この人は何をしている人か", persona.person_job); row("相手の課題認識（本音）", persona.opening_line); row("役職", persona.role); row("決裁権", persona.authority); row("タイプ（ソーシャルスタイル）", (persona.style_name || "—") + (persona.style_hidden ? "（伏せていました）" : "")); row("正解", CAT[persona.answer] + "：" + (persona.exp || "")); row("言い直しの模範例", persona.rephrase_example); }
  else row("役職・決裁権・タイプ・課題認識・相手の事実", "判定後に表示");
  box.appendChild(kv);
  if (graded && (persona.hidden_facts || []).length) { const h = document.createElement("h3"); h.textContent = "相手の事実（答え合わせ用）"; h.style.cssText = "font-size:13px;margin:14px 0 4px"; box.appendChild(h); const ul = document.createElement("ul"); ul.className = "pts"; persona.hidden_facts.forEach(f => { const li = document.createElement("li"); li.textContent = f; ul.appendChild(li); }); box.appendChild(ul); }
  if (quizzes.length) { const h = document.createElement("h3"); h.textContent = "暗算チェック " + quizzes.filter(q => q.ok).length + "/" + quizzes.length; h.style.cssText = "font-size:13px;margin:14px 0 4px"; box.appendChild(h); const ul = document.createElement("ul"); ul.className = "pts"; quizzes.forEach(q => { const li = document.createElement("li"); li.textContent = q.question + " → 正解" + q.answer + q.unit + "／自分" + (q.mine === null ? "未回答" : q.mine + q.unit) + "（" + (q.ok ? "○" : "×") + "、" + q.sec.toFixed(1) + "秒）"; ul.appendChild(li); }); box.appendChild(ul); }
}
async function voiceQuiz() {
  status("chat-status", "この商談で出た数字を暗算チェックにしています…");
  try {
    const { quizzes: qs } = await api("quiz", { persona, transcript });
    status("chat-status", "");
    if (!qs || !qs.length) return;
    addMsg("sys", "商談で出た数字の暗算チェック（" + qs.length + "問）。相手が言った数字で、その場で出すべきだった計算です");
    quizQueue = qs.slice(); await runQuizQueue();
    addMsg("sys", "暗算チェック終了：" + quizzes.filter(q => q.ok).length + "/" + quizzes.length + " 正解");
  } catch (e) { status("chat-status", "暗算チェックを作れませんでした：" + e.message, true); }
}
$("call").addEventListener("click", startCall);

/* ---------- 暗算チェック（商談中に出た数字で即答） ---------- */
let quizzes = [];          // この回の結果 [{question, answer, unit, mine, ok, sec, kind}]
let quizQueue = [];        // 出題待ち（音声のあとはまとめて）
let quizCur = null, quizT0 = 0, quizTimer = null, quizResolve = null;
function quizActive() { return !!quizCur; }
function quizStart(q) {
  return new Promise(res => {
    quizResolve = res; quizCur = q; quizT0 = performance.now();
    $("quiz-q").textContent = q.question; $("quiz-quote").textContent = q.quote ? "相手の発言：「" + q.quote + "」" : "";
    $("quiz-unit").textContent = q.unit || ""; $("quiz-in").value = ""; $("quiz-in").disabled = false; $("quiz-ok").disabled = false; $("quiz-skip").disabled = false;
    $("quiz-res").hidden = true; $("quiz-mental").hidden = true; $("quiz-next-row").hidden = true;
    const done = quizzes.filter(x => x.ok).length;
    $("quiz-score").textContent = quizzes.length ? `${done}/${quizzes.length} 正解` : "";
    $("quiz").hidden = false; $("quiz").scrollIntoView({ block: "nearest" });
    clearInterval(quizTimer); quizTimer = setInterval(() => { $("quiz-timer").textContent = ((performance.now() - quizT0) / 1000).toFixed(1) + "秒"; }, 100);
    $("quiz-in").focus();
  });
}
function quizAnswer(skip) {
  if (!quizCur) return;
  clearInterval(quizTimer);
  const sec = (performance.now() - quizT0) / 1000;
  const raw = $("quiz-in").value.trim();
  const mine = skip || raw === "" ? null : Number(raw);
  const ans = quizCur.answer;
  const ok = mine !== null && isFinite(mine) && Math.abs(mine - ans) <= Math.max(Math.abs(ans) * 0.02, 0.05);
  quizzes.push({ question: quizCur.question, answer: ans, unit: quizCur.unit, mine, ok, sec, kind: quizCur.kind });
  if (!ok) addMissed({ ...quizCur, mine });
  $("quiz-in").disabled = true; $("quiz-ok").disabled = true; $("quiz-skip").disabled = true;
  const r = $("quiz-res"); r.hidden = false; r.className = "qres " + (ok ? "ok" : "ng"); r.textContent = "";
  const lab = document.createElement("span"); lab.className = "lab"; lab.textContent = (ok ? "正解" : mine === null ? "未回答" : "不正解") + " ／ " + sec.toFixed(1) + "秒" + (sec <= 10 ? "（即答ライン）" : "（目標10秒以内）"); r.appendChild(lab);
    r.appendChild(document.createTextNode("答え：" + ans + (quizCur.unit || "") + (quizCur.calc && quizCur.calc.length ? "\n" + quizCur.calc.join("\n") : "")));
  if (quizCur.mental && quizCur.mental.length) { const m = $("quiz-mental"); m.hidden = false; m.textContent = ""; const l = document.createElement("span"); l.className = "lab"; l.textContent = "暗算のコツ"; m.appendChild(l); m.appendChild(document.createTextNode(quizCur.mental.join("\n"))); }
  $("quiz-next-row").hidden = false; $("quiz-next").focus();
}
$("quiz-ok").addEventListener("click", () => quizAnswer(false));
$("quiz-skip").addEventListener("click", () => quizAnswer(true));
$("quiz-in").addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); quizAnswer(false); } });
$("quiz-next").addEventListener("click", () => { $("quiz").hidden = true; const f = quizResolve; quizCur = null; quizResolve = null; if (f) f(); });
async function runQuizQueue() { while (quizQueue.length) { await quizStart(quizQueue.shift()); } }
function resetQuiz() { quizzes = []; quizQueue = []; quizCur = null; quizResolve = null; clearInterval(quizTimer); $("quiz").hidden = true; }
function askedList() { return quizzes.map(q => q.question); }

/* ---------- 上司からのFB → 採点の観点（このブラウザに保存） ---------- */
const FB_KEY = "ropure-boss-fb-v1";
const FB_SEED = [
  { key: "fb_count", title: "戦略の話では件数を聞く", check: "ターゲットや戦略の話になったら「今の件数は？」「月に何件？」と数字を聞いたか", example: "今の件数は？", at: 0, src: "上司FB（初期登録）" },
  { key: "fb_pain", title: "「何が困っているのか」を聞く", check: "うまくいきそうに見える相手ほど、「何が困っているんですか？」と困りごとを直接聞いたか", example: "こんなにうまくいきそうなのに、何が困っているんですか？", at: 0, src: "上司FB（初期登録）" },
  { key: "fb_focus", title: "受注角度の高い所から攻める", check: "「受注角度の高いところから攻める」方針を保ったうえで、そこの具体性（どこから・誰から）まで詰めたか", example: "受注角度が高いのはどこですか？そこの具体的には？", at: 0, src: "上司FB（初期登録）" },
  { key: "fb_elicit", title: "具体性はこちらから提示せず引き出す", check: "やり方の具体性を自分から提示せず、「〜はいろんなエリアありますよね」「どこからやるとか決まっているんですか？」と相手に言わせたか", example: "メールはいろんなエリアありますよね。どこからやるとか決まっているんですか？", at: 0, src: "上司FB（初期登録）" },
];
let checks = [];
function loadChecks() { try { const v = JSON.parse(localStorage.getItem(uk(FB_KEY)) || "null"); checks = Array.isArray(v) ? v : FB_SEED.map(x => ({ ...x, at: Date.now() })); } catch (_) { checks = FB_SEED.map(x => ({ ...x, at: Date.now() })); } if (!localStorage.getItem(uk(FB_KEY))) saveChecks(); }
function saveChecks() { try { localStorage.setItem(uk(FB_KEY), JSON.stringify(checks.slice(0, 12))); } catch (_) {} renderChecks(); }
function checksForApi() { return checks.map(c => ({ key: c.key, title: c.title, check: c.check, example: c.example })); }
function renderChecks() {
  $("fb-state").textContent = "観点 " + checks.length + "件"; $("fb-cnt").textContent = checks.length ? String(checks.length) : "";
  const box = $("fb-list"); box.textContent = "";
  if (!checks.length) { const p = document.createElement("p"); p.className = "hint"; p.textContent = "まだありません。"; box.appendChild(p); return; }
  checks.forEach(c => {
    const scored = history.filter(h => h.custom && h.custom[c.key]); const latest = scored.length ? scored[scored.length - 1].custom[c.key].score : null; const avg = scored.length ? scored.reduce((a, h) => a + h.custom[c.key].score, 0) / scored.length : null;
    const weak = avg !== null && avg < 2.5;
    const d = document.createElement("div"); d.className = "fbcard" + (weak ? " weak" : "");
    const sc = document.createElement("span"); sc.className = "sc"; sc.textContent = scored.length ? `直近 ${latest} ／ 平均 ${avg.toFixed(1)}` + (weak ? " ・ 弱点" : "") : "未採点（次のロープレから）"; d.appendChild(sc);
    const t = document.createElement("div"); t.className = "t"; t.textContent = c.title; d.appendChild(t);
    const ck = document.createElement("div"); ck.className = "c"; ck.textContent = "採点：" + c.check; d.appendChild(ck);
    if (c.example) { const e = document.createElement("div"); e.className = "e"; e.textContent = "例：「" + c.example + "」"; d.appendChild(e); }
    const m = document.createElement("div"); m.className = "m"; m.textContent = (c.src || "上司FB") + (c.at ? "・" + new Date(c.at).toLocaleDateString("ja-JP") : ""); d.appendChild(m);
    const row = document.createElement("div"); row.className = "row"; const x = document.createElement("button"); x.type = "button"; x.className = "btn"; x.textContent = "削除"; x.style.color = "var(--bad)"; x.addEventListener("click", () => { checks = checks.filter(y => y !== c); saveChecks(); }); row.appendChild(x); d.appendChild(row);
    box.appendChild(d);
  });
}
$("fb-add").addEventListener("click", async () => {
  const text = $("fb-text").value.trim(); if (text.length < 5) { status("fb-status", "FBの本文を入れてください", true); return; }
  if (checks.length >= 12) { status("fb-status", "観点は12件までです。古いものを消してください", true); return; }
  $("fb-add").disabled = true; status("fb-status", "AIが観点に変換しています…");
  try {
    const { items } = await api("feedback", { text });
    const now = Date.now();
    items.forEach((it, i) => { if (checks.length < 12) checks.push({ key: "fb_" + now.toString(36) + i, title: it.title, check: it.check, example: it.example, at: now, src: "上司FB" }); });
    saveChecks(); $("fb-text").value = ""; status("fb-status", items.length + "件の観点を追加しました。次のロープレから採点されます");
  } catch (e) { status("fb-status", e.message, true); }
  finally { $("fb-add").disabled = false; }
});
loadChecks(); renderChecks();

/* ---------- スコア履歴とダッシュボード（メンバー別・サーバー保存＋この端末にキャッシュ） ---------- */
const HIST_KEY = "ropure-history-v1";
const AXES = [["counterpart", "相手の把握"], ["widen", "広げる"], ["classify", "深掘る"], ["rephrase", "言い直し"], ["converge", "狭める"], ["roi", "検算"], ["numbers", "数字"]];
// 見せ方は5スキル。中身は教材7軸（＋傾聴態度・クロージング）を割り当てて平均する
const SKILLS = [["hearing", "ヒアリング力", ["counterpart", "widen"]], ["dig", "課題深掘り", ["classify", "rephrase"]], ["proposal", "提案力", ["converge", "roi", "numbers"]], ["closing", "クロージング", ["closing"]], ["listening", "傾聴態度", ["listening", "rephrase"]]];
const AX_LABEL = Object.fromEntries([...AXES, ["listening", "傾聴態度"], ["closing", "クロージング"]]);
const scoreVal = v => (v && typeof v === "object" ? v.score : v) || null;
function skillOf(sc, def) {
  let keys = def[2];
  if (def[0] === "closing" && !scoreVal(sc.closing)) keys = ["converge"]; // 古い記録はクロージング未採点 → 狭めるで代用
  const parts = keys.map(k => [k, scoreVal(sc[k])]).filter(x => x[1]);
  if (!parts.length) return { score: null, parts: [] };
  return { score: Math.round(parts.reduce((a, x) => a + x[1], 0) / parts.length * 10) / 10, parts };
}
function skillScores(sc) { return Object.fromEntries(SKILLS.map(d => [d[0], skillOf(sc || {}, d)])); }
function renderSkillList(box, sk, teamSk) {
  box.textContent = "";
  const vals = SKILLS.map(d => sk[d[0]].score).filter(v => v !== null); const min = vals.length ? Math.min(...vals) : null;
  SKILLS.forEach(([k, label]) => {
    const v = sk[k]; const row = document.createElement("div"); row.className = "sk" + (v.score !== null && v.score === min && min < 4 ? " weak" : "");
    const top = document.createElement("div"); top.className = "sk-top";
    const l = document.createElement("span"); l.textContent = label + (v.score !== null && v.score === min && min < 4 ? "（課題）" : ""); const n = document.createElement("b"); n.textContent = v.score === null ? "—" : v.score.toFixed(1);
    if (teamSk && teamSk[k] && teamSk[k].score !== null) { const t = document.createElement("span"); t.className = "avg"; t.textContent = " / チーム " + teamSk[k].score.toFixed(1); n.appendChild(t); }
    top.append(l, n);
    const parts = document.createElement("div"); parts.className = "sk-parts"; parts.textContent = v.parts.length ? "← " + v.parts.map(([pk, pv]) => `${AX_LABEL[pk]} ${pv}`).join("・") : "← 記録なし";
    row.append(top, parts); box.appendChild(row);
  });
}
let team = null, allRows = null, dashScope = "me", teamFocus = "all", teamPeriod = "month", lastEntry = null;
function loadHistory() { try { history = JSON.parse(localStorage.getItem(uk(HIST_KEY)) || "[]"); if (!Array.isArray(history)) history = []; } catch (_) { history = []; } }
function saveHistory() { try { localStorage.setItem(uk(HIST_KEY), JSON.stringify(history.slice(-300))); } catch (_) {} }
async function syncHistory() {
  if (!user) return;
  try {
    const j = await api("history", { action: "list" });
    shared = !!j.shared;
    if (j.shared) {
      // サーバーが正。まだ送れていないローカル分（pending）は再送
      const pending = history.filter(e => e.pending);
      history = (j.mine || []).slice().sort((x, y) => x.at - y.at);
      for (const e of pending) { try { const r = await api("history", { action: "add", entry: { ...e, pending: undefined } }); e.pending = false; e.id = r.id; history.push(e); } catch (_) { history.push(e); } }
      history.sort((x, y) => x.at - y.at); saveHistory();
      team = j.team || null; allRows = j.all || null;
    }
    $("dash-clear").hidden = shared;
  } catch (e) { console.warn("成績の同期に失敗", e); }
}
function numbersScore() {
  // 暗算チェックの正答率と問3の暗算から。チェックが無ければ null
  const n = quizzes.length, c = quizzes.filter(q => q.ok).length;
  const parts = [];
  if (n) parts.push(c / n);
  if (guess) parts.push([guess.okInvest, guess.okWins, guess.okRecover, guess.ok].filter(Boolean).length / 4);
  if (!parts.length) return null;
  const r = parts.reduce((a, b) => a + b, 0) / parts.length;
  return { score: Math.max(1, Math.round(r * 4) + 1), why: (n ? `暗算チェック ${c}/${n} 正解` : "") + (guess ? (n ? "／" : "") + "問3の暗算 " + [guess.okInvest, guess.okWins, guess.okRecover, guess.ok].filter(Boolean).length + "/4" : "") };
}

function avgScores(list) { const out = {}; [...AXES, ["listening"], ["closing"]].forEach(([k]) => { const v = list.map(e => e.scores[k] && e.scores[k].score).filter(x => x); out[k] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }); return out; }

function polar(cx, cy, r, i, n) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }

function renderAxList(ent) {
  const avg = avgScores(history); const box = $("res-axes"); box.textContent = "";
  const weakK = AXES.map(([k]) => k).filter(k => avg[k] !== null).sort((a, b) => avg[a] - avg[b])[0];
  AXES.forEach(([k, label]) => { const s = ent.scores[k]; const d = document.createElement("div"); if (k === weakK) d.className = "weak"; const l = document.createElement("span"); l.textContent = label + (k === weakK ? "（弱点）" : ""); const v = document.createElement("span"); const b = document.createElement("b"); b.textContent = s ? s.score : "—"; b.style.color = s && s.score <= 2 ? "var(--bad)" : s && s.score >= 5 ? "#059669" : ""; v.appendChild(b); const a = document.createElement("span"); a.className = "avg"; a.textContent = " / " + (avg[k] !== null ? avg[k].toFixed(1) : "—"); v.appendChild(a); d.appendChild(l); d.appendChild(v); d.title = s ? s.why : ""; box.appendChild(d); });
}

function drawRadarInto(svg, latest, avg, axes = AXES) {
  const n = axes.length, cx = 160, cy = 150, R = 100; let h = "";
  for (let g = 1; g <= 5; g++) { const pts = axes.map((_, i) => polar(cx, cy, R * g / 5, i, n).map(v => v.toFixed(1)).join(",")).join(" "); h += `<polygon points="${pts}" fill="none" stroke="#E2E8F0" stroke-width="${g === 5 ? 1.2 : .6}"/>`; }
  axes.forEach(([k, label], i) => { const [x, y] = polar(cx, cy, R, i, n); const [lx, ly] = polar(cx, cy, R + 22, i, n); h += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#E2E8F0" stroke-width=".6"/><text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="12" font-weight="700" fill="#1A3A5C" text-anchor="middle" dominant-baseline="middle">${label}</text>`; });
  const poly = (sc, fill, stroke, op, dash) => { const pts = axes.map(([k], i) => polar(cx, cy, R * (scoreVal(sc[k]) || 0) / 5, i, n).map(v => v.toFixed(1)).join(",")).join(" "); return `<polygon points="${pts}" fill="${fill}" fill-opacity="${op}" stroke="${stroke}" stroke-width="${dash ? 1.5 : 2.2}"${dash ? ' stroke-dasharray="5 4"' : ""}/>`; };
  if (avg) h += poly(avg, "none", "#6B7280", 0, true);
  if (latest) h += poly(latest.scores, "#05AABA", "#1A3A5C", .28) + axes.map(([k], i) => { const s = scoreVal(latest.scores[k]) || 0; const [x, y] = polar(cx, cy, R * s / 5, i, n); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#05AABA"/>`; }).join("");
  svg.innerHTML = h;
}

function donut(label, score, why, weak) {
  const r = 34, c = 2 * Math.PI * r, p = score ? score / 5 : 0;
  return `<div class="donut${weak ? " weak" : ""}" title="${(why || "").replace(/"/g, "&quot;")}"><svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="${r}" fill="none" stroke="#E2E8F0" stroke-width="10"/><circle cx="42" cy="42" r="${r}" fill="none" stroke="${weak ? "#EF4444" : "#05AABA"}" stroke-width="10" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" stroke-linecap="round" transform="rotate(-90 42 42)"/><text x="42" y="47" text-anchor="middle" class="dv">${score ? score : "—"}</text></svg><span class="dl">${label}</span>${why ? `<span class="dw">${why}</span>` : ""}</div>`;
}

function coachSay(text) { const b = $("coach-say"); b.textContent = ""; const n = document.createElement("span"); n.className = "nm"; n.textContent = "Mr. KOHEI"; b.appendChild(n); b.appendChild(document.createTextNode(text)); }

function gofastDashSay(text) { const b = $("dash-gofast"); b.textContent = ""; const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = "Mr. Go fast ／ 量"; b.appendChild(nm); b.appendChild(document.createTextNode(text)); }

/* 会話の回数（質問／拾ってから質問／提案／質問と答えのずれ） */
function gobiSub(c) { return ["ぼかし", "敬語の重ねすぎ", "文法の誤り"].filter(k => c.gobiTypes && c.gobiTypes[k]).map(k => k + " " + c.gobiTypes[k]).join("／"); }
function countsText(c) { return c ? "質問" + c.questions + "回（うち相手の言葉を拾ってから" + c.picked + "回）／提案" + c.proposals + "回／質問と答えのずれ" + c.off + "回（相手の答えがずれた" + c.offThem + "・自分の答えがずれた" + c.offMe + "）／おかしい語尾" + (c.gobi || 0) + "回" + (c.gobi ? "（" + gobiSub(c) + "）" : "") : ""; }
function renderCounts(c, err) {
  const panel = $("counts-panel"); panel.hidden = !c && !err;
  const box = $("res-counts"); box.textContent = ""; $("counts-list").textContent = ""; $("counts-detail").hidden = true;
  if (!c) { $("counts-hint").textContent = err ? "今回は回数を数えられませんでした（AIが混み合っているか、返事が壊れていました）。採点には影響ありません。" : ""; return; }
  const tile = (label, value, sub, warn) => { const d = document.createElement("div"); d.className = "cnt-tile" + (warn ? " warn" : ""); const l = document.createElement("span"); l.className = "l"; l.textContent = label; const v = document.createElement("span"); v.className = "v"; v.textContent = value; const u = document.createElement("small"); u.textContent = "回"; v.appendChild(u); d.appendChild(l); d.appendChild(v); if (sub) { const s = document.createElement("span"); s.className = "s"; s.textContent = sub; d.appendChild(s); } box.appendChild(d); };
  const rate = c.questions ? Math.round(c.picked / c.questions * 100) : 0;
  tile("質問した", c.questions, "");
  tile("相手の言葉を拾ってから質問", c.picked, c.questions ? "質問" + c.questions + "回のうち " + rate + "%" : "", c.questions >= 3 && rate < 30);
  tile("提案した", c.proposals, "");
  tile("質問と答えがずれた", c.off, c.off ? "相手の答えがずれた " + c.offThem + "／自分の答えがずれた " + c.offMe : "", c.off >= 3);
  tile("語尾がおかしい", c.gobi || 0, c.gobi ? gobiSub(c) : "", (c.gobi || 0) >= 5);
  $("counts-hint").textContent = c.questions >= 3 && rate < 30 ? "質問の前に、相手が直前に言った言葉を一言返す（「〜なんですね」）。まず半分を目標に。" : "AIが会話ログの発言を1つずつ分類して数えています（文字起こしの誤変換で±1〜2回ずれることがあります）。";
  const list = $("counts-list"); list.textContent = "";
  const groups = [["拾ってから質問できた", i => i.picked > 0], ["拾わずに質問した", i => i.q > i.picked], ["提案した", i => i.proposal], ["質問と答えがずれた", i => !!i.off]];
  groups.forEach(([label, f], gi) => {
    const hit = (c.items || []).filter(f); if (!hit.length) return;
    const h = document.createElement("h4"); h.textContent = label + "（" + hit.length + "発言）"; list.appendChild(h);
    const ul = document.createElement("ul");
    hit.forEach(i => { const li = document.createElement("li"); const no = document.createElement("span"); no.className = "no"; no.textContent = String(i.n).padStart(2, "0"); li.appendChild(no); li.appendChild(document.createTextNode("「" + i.text + "」"));
      const extra = gi === 3 ? (i.off === "them" ? "相手の答えがずれた" : i.off === "me" ? "自分の答えがずれた" : "両方ずれた") + (i.note ? "：" + i.note : "") : gi === 2 ? i.note : gi === 0 ? (i.echo ? "拾った言葉：「" + i.echo + "」" : "") : (i.could ? "拾えた言葉：「" + i.could + "」" : "");
      if (extra) { const nt = document.createElement("span"); nt.className = "nt"; nt.textContent = " ← " + extra; li.appendChild(nt); }
      ul.appendChild(li); });
    list.appendChild(ul);
  });
  const gs = (c.items || []).filter(i => i.gobi && i.gobi.length);
  if (gs.length) {
    const h = document.createElement("h4"); h.textContent = "語尾がおかしい（" + (c.gobi || 0) + "回）"; list.appendChild(h);
    const ul = document.createElement("ul");
    gs.forEach(i => i.gobi.forEach(g => { const li = document.createElement("li"); const no = document.createElement("span"); no.className = "no"; no.textContent = String(i.n).padStart(2, "0"); li.appendChild(no); li.appendChild(document.createTextNode("「" + g.bad + "」 → ")); const fx = document.createElement("span"); fx.className = "fx"; fx.textContent = "「" + g.fix + "」"; li.appendChild(fx); const nt = document.createElement("span"); nt.className = "nt"; nt.textContent = "（" + g.type + "）"; li.appendChild(nt); ul.appendChild(li); }));
    list.appendChild(ul);
  }
  $("counts-detail").hidden = !list.childNodes.length; $("counts-detail").open = false;
}

function recordHistory(r) {
  if (!r.scores) return null;
  const sc = { ...r.scores }; const ns = numbersScore(); if (ns) sc.numbers = ns;
  const keys = AXES.map(a => a[0]).filter(k => sc[k]);
  const total = keys.reduce((s, k) => s + sc[k].score, 0) / keys.length;
  const e = { at: Date.now(), company: persona.company, role: persona.role, mode, correct: !!r.correct, answer: r.answer, picked, scores: sc, custom: r.custom || null, tpl: persona.tpl || null, style: persona.style || "", quiz: quizzes.map(q => ({ kind: q.kind, ok: q.ok })), total: Math.round(total * 10) / 10, counts: r.counts ? { q: r.counts.questions, picked: r.counts.picked, prop: r.counts.proposals, off: r.counts.off, gobi: r.counts.gobi || 0 } : null, next: r.nextAction || "", feedback: String(r.feedback || "").slice(0, 600), sec: Math.round((Date.now() - startedAt) / 1000) };
  history.push(e); saveHistory(); lastEntry = e;
  if (shared) api("history", { action: "add", entry: e }).then(j => { e.id = j.id; saveHistory(); if (e.video) api("history", { action: "update", id: e.id, patch: { video: e.video } }).catch(() => {}); syncHistory(); }).catch(() => { e.pending = true; saveHistory(); });
  return e;
}
/* 動画リンク（Googleドライブ）を直近の記録に付ける */
$("video-save").addEventListener("click", async () => {
  const url = $("video-url").value.trim();
  if (!/^https?:\/\//.test(url)) { status("video-status", "https:// から始まるリンクを貼ってください", true); return; }
  if (!lastEntry) { status("video-status", "先に「判定する」を押して、この回の記録を作ってください", true); return; }
  lastEntry.video = url; saveHistory(); status("video-status", "保存中…");
  try { if (shared && lastEntry.id) await api("history", { action: "update", id: lastEntry.id, patch: { video: url } }); status("video-status", "履歴に動画リンクを保存しました（履歴タブの ▶ から開けます）"); }
  catch (e) { status("video-status", "この端末には保存。共有保存に失敗：" + e.message, true); }
});
/* 週ごとの平均（直近8週） */
function weekKey(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
function weekly(list, n = 8) {
  const m = new Map(); list.forEach(e => { const k = weekKey(e.at); (m.get(k) || m.set(k, []).get(k)).push(e.total); });
  const keys = [...m.keys()].sort((a, b) => a - b).slice(-n);
  return keys.map(k => { const v = m.get(k); const d = new Date(k); return { k, label: `${d.getMonth() + 1}/${d.getDate()}週`, avg: v.reduce((a, b) => a + b, 0) / v.length, n: v.length }; });
}
function drawTrend(list) {
  const svg = $("trend"); const W = 520, H = 200, px = 34, py = 16, pb = 30; const L = weekly(list); let h = "";
  for (let g = 0; g <= 5; g++) { const y = py + (H - py - pb) * (1 - g / 5); h += `<line x1="${px}" y1="${y.toFixed(1)}" x2="${W - 12}" y2="${y.toFixed(1)}" stroke="#E2E8F0" stroke-width=".8"/><text x="${px - 8}" y="${y.toFixed(1)}" font-size="10" fill="#6B7280" text-anchor="end" dominant-baseline="middle">${g}</text>`; }
  if (!L.length) { svg.innerHTML = h; return; }
  const xs = i => L.length === 1 ? (px + W - 12) / 2 : px + (W - 12 - px) * i / (L.length - 1);
  const ys = v => py + (H - py - pb) * (1 - v / 5);
  const line = L.map((e, i) => xs(i).toFixed(1) + "," + ys(e.avg).toFixed(1)).join(" ");
  h += `<polygon points="${px},${H - pb} ${line} ${xs(L.length - 1).toFixed(1)},${H - pb}" fill="rgba(5,170,186,.10)"/><polyline points="${line}" fill="none" stroke="#05AABA" stroke-width="2.5"/>`;
  L.forEach((e, i) => { h += `<circle cx="${xs(i).toFixed(1)}" cy="${ys(e.avg).toFixed(1)}" r="4.5" fill="#1A3A5C" stroke="#fff" stroke-width="2"><title>${e.label}：平均 ${e.avg.toFixed(1)}（${e.n}本）</title></circle><text x="${xs(i).toFixed(1)}" y="${H - 10}" font-size="10" fill="#6B7280" text-anchor="middle">${e.label}</text>`; });
  svg.innerHTML = h;
}
function drawRadar(latest, avg) { drawRadarInto($("radar"), latest, avg); }
function renderHistory() {
  const esc = v => String(v || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const t = $("hist-table"); t.innerHTML = `<tr><th>日時</th><th>相手</th><th>方式</th><th>動画</th><th>4分類</th><th>総合</th><th title="質問した回数／相手の言葉を拾ってから質問した回数／提案した回数／質問と答えがずれた回数／語尾がおかしかった回数">質問/拾い/提案/ずれ/語尾</th><th>次の一手</th></tr>` + (history.length ? history.slice().reverse().map(e => `<tr><td class="n">${new Date(e.at).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</td><td>${esc(e.company)}<span class="why">（${esc(e.role)}）</span></td><td>${e.mode === "chat" ? "チャット" : "音声"}</td><td>${/^https?:\/\//.test(e.video || "") ? `<a class="vid" href="${esc(e.video)}" target="_blank" rel="noopener">▶ 動画</a>` : '<span class="why">—</span>'}</td><td class="n">${e.correct ? "○" : "×"}</td><td class="n"><b>${e.total.toFixed(1)}</b></td><td class="n">${e.counts ? `${Number(e.counts.q) || 0} / ${Number(e.counts.picked) || 0} / ${Number(e.counts.prop) || 0} / ${Number(e.counts.off) || 0} / ${e.counts.gobi === undefined ? "—" : Number(e.counts.gobi) || 0}` : '<span class="why">—</span>'}</td><td class="why">${esc(e.next)}</td></tr>`).join("") : `<tr><td colspan="8" class="why">まだありません。</td></tr>`);
}
function gofastVolume(list, who = "") {
  const now = Date.now(), day = 86400000;
  const n = list.length, today = list.filter(e => now - e.at < day).length, week = list.filter(e => now - e.at < 7 * day).length;
  const days = new Set(list.map(e => new Date(e.at).toDateString())).size;
  const last = n ? Math.floor((now - list[n - 1].at) / day) : null;
  const avgMin = n ? Math.round(list.reduce((a, e) => a + (e.sec || 0), 0) / n / 60) : 0;
  const L = [];
  if (!n) return `${who}記録ゼロ。話にならない。今日中に3本。量をやらない人間に質は来ない。`;
  L.push(`${who}今日${today}本、今週${week}本、累計${n}本（${days}日）。`);
  if (today === 0) L.push("今日はまだゼロ。これを読んでいる暇があったら1本やれ。");
  else if (today < 3) L.push(`今日${today}本で終わる気か。最低3本。`);
  else L.push(`今日${today}本。やっと普通。`);
  if (week < 5) L.push(`週${week}本は少ない。週5本が下限、週10本で初めて伸びる。`);
  else if (week < 10) L.push(`週${week}本。下限はクリア。週10本に上げろ。`);
  else L.push(`週${week}本。量は合格。次は1本あたりの時間を短く、同じ結論に速く辿り着け。`);
  if (last !== null && last >= 2) L.push(`最後にやったのは${last}日前。空けた分だけ戻る。`);
  if (avgMin && avgMin > 20) L.push(`1本平均${avgMin}分。長い。15分で全体像を掴めるようにしろ。`);
  const correct = list.filter(e => e.correct).length;
  if (n >= 5 && correct / n < 0.5) L.push(`4分類の正解率${Math.round(correct / n * 100)}%。考えてから打つな、打ってから考えろ。数をこなせば判定順序が体に入る。`);
  return L.join("");
}
function teamAvgScores() { return team && team.teamAxes && Object.values(team.teamAxes).some(v => v) ? team.teamAxes : null; }
function renderRanking() {
  const box = $("ranking"); box.textContent = "";
  const now = Date.now(), day = 86400000;
  let rows;
  if (team && team.members && team.members.length) rows = team.members.map(m => ({ ...m, me: user && m.email === user.email }));
  else rows = [{ email: user ? user.email : "", short: user ? user.short || user.name : "自分", me: true, month: history.filter(e => now - e.at < 30 * day).length, week: history.filter(e => now - e.at < 7 * day).length, count: history.length }];
  rows.sort((a, b) => b.month - a.month || b.count - a.count);
  const max = Math.max(1, ...rows.map(r => r.month));
  rows.forEach((r, i) => {
    const d = document.createElement("div"); d.className = "rank" + (r.me ? " me" : "");
    const no = document.createElement("div"); no.className = "no" + (r.month === 0 ? " low" : i >= 2 ? " mid" : ""); no.textContent = i + 1;
    const mid = document.createElement("div"); mid.style.flex = "1";
    const nm = document.createElement("div"); nm.className = "nm"; nm.textContent = r.short || r.name; if (r.me) { const y = document.createElement("span"); y.className = "you"; y.textContent = "あなた"; nm.appendChild(y); }
    const bar = document.createElement("div"); bar.className = "bar"; const bi = document.createElement("i"); bi.style.width = (r.month / max * 100) + "%"; if (r.month === 0) bi.style.background = "#EF4444"; bar.appendChild(bi);
    const sub = document.createElement("div"); sub.className = "sub"; sub.textContent = `今週 ${r.week}本 ／ 累計 ${r.count}本`;
    mid.append(nm, bar, sub);
    const c = document.createElement("div"); c.className = "cnt"; c.textContent = r.month; const sm = document.createElement("small"); sm.textContent = "本"; c.appendChild(sm);
    d.append(no, mid, c); box.appendChild(d);
  });
  if (team && team.members) { const f = document.createElement("p"); f.className = "hint"; f.textContent = `チーム合計（今月）${rows.reduce((a, r) => a + r.month, 0)}本`; box.appendChild(f); }
  if (!shared) { const f = document.createElement("p"); f.className = "hint"; f.textContent = "※ サーバー保存が未設定のため、この端末の記録だけで表示しています"; box.appendChild(f); }
}
function renderDash() {
  const n = history.length;
  $("band-av").textContent = (user ? (user.short || user.name) : "？").slice(0, 1);
  $("band-title").textContent = "個人ダッシュボード — " + (user ? user.name : "");
  $("band-sub").textContent = (user ? user.email : "") + ` ｜ 累計 ${n}本` + (n ? ` ｜ 最終 ${new Date(history[n - 1].at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "");
  renderRanking();
  gofastDashSay(gofastVolume(history));
  const tavg = teamAvgScores();
  if (!n) { $("kpis").innerHTML = ""; $("axes").innerHTML = ""; $("donuts-fb").innerHTML = ""; $("fb-none").hidden = false; $("radar-total").textContent = ""; drawRadarInto($("radar"), null, tavg ? skillScores(tavg) : null, SKILLS); $("skill-list").textContent = ""; drawTrend([]); $("hist").textContent = ""; coachSay("まだロープレの記録がありません。1回やると、ここで所見を話します。"); return; }
  const latest = history[n - 1], avg = avgScores(history), prev = history.slice(0, -1);
  const avgTotal = history.reduce((s, e) => s + e.total, 0) / n;
  const correct = history.filter(e => e.correct).length;
  const kpi = (k, v, sub) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}${sub ? `<small> ${sub}</small>` : ""}</div></div>`;
  $("kpis").innerHTML = kpi("直近の総合", latest.total.toFixed(1), "/5") + kpi("平均", avgTotal.toFixed(1), "/5") + kpi("4分類の正解率", Math.round(correct / n * 100) + "%", `${correct}/${n}`) + kpi("ロープレ回数", n, "回");
  $("radar-total").textContent = `総合 ${latest.total.toFixed(1)} / 5.0`;
  const skMine = skillScores(latest.scores), skTeam = tavg ? skillScores(tavg) : (prev.length ? skillScores(avgScores(prev)) : null);
  drawRadarInto($("radar"), { scores: skMine }, skTeam, SKILLS); renderSkillList($("skill-list"), skMine, tavg ? skTeam : null); drawTrend(history);
  $("hist").textContent = "週ごとの平均総合。点にカーソルを合わせると本数が出ます";
  const weakK = AXES.map(([k]) => k).filter(k => avg[k] !== null).sort((a, b) => avg[a] - avg[b])[0];
  $("axes").innerHTML = `<tr><th>軸</th><th>直近</th><th style="width:30%">平均</th><th>チーム</th><th>直近の根拠</th></tr>` + AXES.map(([k, label]) => { const s = latest.scores[k]; const a = avg[k]; const t = tavg ? tavg[k] : null; return `<tr class="${k === weakK ? "weak" : ""}"><td>${label}${k === weakK ? "（弱点）" : ""}</td><td class="n">${s ? s.score : "—"}</td><td><div class="bar"><i style="width:${a ? a / 5 * 100 : 0}%"></i></div><span class="why">${a ? a.toFixed(1) : "—"}</span></td><td class="n why">${t ? t.toFixed(1) : "—"}</td><td class="why">${s ? s.why : "記録なし"}</td></tr>`; }).join("");
  const cu = latest.custom ? Object.values(latest.custom) : [];
  const cuWeak = cu.length ? Math.min(...cu.map(c => c.score)) : 0;
  $("donuts-fb").innerHTML = cu.map(c => donut(c.title, c.score, c.why, c.score === cuWeak && c.score <= 3)).join("");
  $("fb-none").hidden = !!cu.length;
  const weakLabel = (AXES.find(a => a[0] === weakK) || [])[1] || "";
  const skVals = SKILLS.map(d => [d[1], skMine[d[0]].score]).filter(x => x[1] !== null).sort((x, y) => x[1] - y[1]);
  const trend = prev.length ? (latest.total - prev[prev.length - 1].total) : 0;
  const fbWeak = cu.filter(c => c.score <= 2);
  const teamGap = tavg && weakK && tavg[weakK] ? (avg[weakK] - tavg[weakK]) : null;
  coachSay([
    `直近は ${latest.company} との商談で、総合 ${latest.total.toFixed(1)}／5${prev.length ? `（前回比 ${trend >= 0 ? "+" : ""}${trend.toFixed(1)}）` : ""}。4分類は${latest.correct ? "正解" : "不正解"}でした。`,
    skVals.length ? `5スキルで一番の課題は「${skVals[0][0]}」（${skVals[0][1].toFixed(1)}）。` : "",
    weakLabel ? `教材7軸では「${weakLabel}」が平均で一番低い（${avg[weakK].toFixed(1)}${teamGap !== null ? `、チーム平均との差 ${teamGap >= 0 ? "+" : ""}${teamGap.toFixed(1)}` : ""}）。${latest.scores[weakK] ? latest.scores[weakK].why : ""}` : "",
    fbWeak.length ? `上司のFBの観点では「${fbWeak.map(c => c.title).join("」「")}」ができていません。${fbWeak[0].why}` : (cu.length ? "上司のFBの観点は、おおむね守れています。" : ""),
    latest.next ? `次の一手：${latest.next}` : "",
  ].filter(Boolean).join("\n"));
}
/* ---------- チーム（管理者） ---------- */
function setDashScope(sc) {
  dashScope = sc;
  document.querySelectorAll("#dash-seg button").forEach(b => b.classList.toggle("on", b.dataset.scope === sc));
  $("dash").hidden = sc === "team"; $("team").hidden = sc !== "team";
  if (sc === "team") renderTeam();
}
document.querySelectorAll("#dash-seg button").forEach(b => b.addEventListener("click", () => setDashScope(b.dataset.scope)));
document.querySelectorAll("#team-period button").forEach(b => b.addEventListener("click", () => { teamPeriod = b.dataset.p; document.querySelectorAll("#team-period button").forEach(x => x.classList.toggle("on", x === b)); renderTeam(); }));
function periodFilter(e) { const age = Date.now() - e.at, day = 86400000; return teamPeriod === "week" ? age < 7 * day : teamPeriod === "month" ? age < 30 * day : true; }
function renderTeam() {
  if (!user || !user.admin) return;
  const mem = (team && team.members) || [];
  const seg = $("team-seg"); seg.textContent = "";
  [{ email: "all", short: "チーム全体" }, ...mem].forEach(m => { const b = document.createElement("button"); b.type = "button"; b.textContent = m.short || m.name; b.classList.toggle("on", teamFocus === m.email); b.addEventListener("click", () => { teamFocus = m.email; renderTeam(); }); seg.appendChild(b); });
  const rows = (allRows || []).filter(r => periodFilter(r.entry));
  const focusRows = teamFocus === "all" ? rows : rows.filter(r => r.email === teamFocus);
  const list = focusRows.map(r => r.entry).sort((a, b) => a.at - b.at);
  const pl = { week: "今週", month: "今月", all: "全期間" }[teamPeriod];
  $("team-sub").textContent = `${pl} ｜ ${teamFocus === "all" ? "チーム全体" : (mem.find(m => m.email === teamFocus) || {}).name || ""} ｜ ${list.length}本` + (shared ? "" : "（サーバー保存が未設定）");
  // KPI
  const kpi = (k, v, sub) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}${sub ? `<small> ${sub}</small>` : ""}</div></div>`;
  const avgT = list.length ? list.reduce((a, e) => a + e.total, 0) / list.length : 0;
  const correct = list.filter(e => e.correct).length;
  const active = new Set(focusRows.map(r => r.email)).size;
  const avgMin = list.length ? Math.round(list.reduce((a, e) => a + (e.sec || 0), 0) / list.length / 60) : 0;
  $("team-kpis").innerHTML = kpi(`${pl}の本数`, list.length, "本") + kpi("平均 総合", list.length ? avgT.toFixed(1) : "—", "/5") + kpi("4分類の正解率", list.length ? Math.round(correct / list.length * 100) + "%" : "—", list.length ? `${correct}/${list.length}` : "") + kpi(teamFocus === "all" ? "実施した人" : "1本の平均時間", teamFocus === "all" ? active : avgMin, teamFocus === "all" ? `/${mem.length}人` : "分");
  // メンバー比較
  const per = mem.map(m => { const L = rows.filter(r => r.email === m.email).map(r => r.entry); const a = avgScores(L); const ks = AXES.map(x => x[0]).filter(k => a[k] !== null); const weak = ks.sort((x, y) => a[x] - a[y])[0]; return { m, L, a, n: L.length, avg: L.length ? L.reduce((s, e) => s + e.total, 0) / L.length : null, correct: L.filter(e => e.correct).length, weak, last: L.length ? L[L.length - 1].at : 0 }; });
  const lab = k => (AXES.find(a => a[0] === k) || [])[1] || "—";
  $("team-table").innerHTML = `<tr><th>メンバー</th><th>本数</th><th>平均 総合</th><th>4分類 正解率</th><th>弱点の軸</th><th>最終実施</th></tr>` + per.map(p => `<tr class="${p.n === 0 ? "weak" : ""}"><td><b>${p.m.name}</b>${p.m.admin ? ' <span class="why">管理者</span>' : ""}</td><td class="n">${p.n}</td><td class="n">${p.avg !== null ? p.avg.toFixed(1) : "—"}</td><td class="n">${p.n ? Math.round(p.correct / p.n * 100) + "%" : "—"}</td><td>${p.weak ? lab(p.weak) + `（${p.a[p.weak].toFixed(1)}）` : "—"}</td><td class="why">${p.last ? new Date(p.last).toLocaleDateString("ja-JP") : "まだなし"}</td></tr>`).join("");
  // ヒートマップ
  const col = v => v === null ? "" : v >= 4 ? "background:#C7F0E6" : v >= 3 ? "background:#E0F5EF" : v >= 2 ? "background:#FEF3C7" : "background:#FEE2E2";
  const ta = avgScores(rows.map(r => r.entry));
  const skP = per.map(p => skillScores(p.a)), skT = skillScores(ta);
  $("team-heat").innerHTML = `<tr><th>スキル</th>${mem.map(m => `<th>${m.short || m.name}</th>`).join("")}<th>チーム</th></tr>` + SKILLS.map(([k, label, parts]) => `<tr><td>${label}<div class="why">${parts.map(x => AX_LABEL[x]).join("・")}</div></td>${skP.map(sp => `<td class="h" style="${col(sp[k].score)}">${sp[k].score !== null ? sp[k].score.toFixed(1) : "—"}</td>`).join("")}<td class="h">${skT[k].score !== null ? skT[k].score.toFixed(1) : "—"}</td></tr>`).join("");
  // 日別の本数（直近14日・積み上げ）
  const colors = ["#1A3A5C", "#05AABA", "#059669", "#F59E0B", "#8B5CF6", "#EF4444"];
  const days = []; for (let i = 13; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push(d.getTime()); }
  const W = 320, H = 180, px = 24, py = 10, pb = 22, bw = (W - px - 8) / 14;
  const src = (allRows || []).filter(r => teamFocus === "all" || r.email === teamFocus);
  const counts = days.map(d0 => mem.map(m => src.filter(r => r.email === m.email && r.entry.at >= d0 && r.entry.at < d0 + 86400000).length));
  const maxD = Math.max(1, ...counts.map(c => c.reduce((a, b) => a + b, 0)));
  let h = "";
  for (let g = 0; g <= maxD; g += Math.max(1, Math.ceil(maxD / 4))) { const y = py + (H - py - pb) * (1 - g / maxD); h += `<line x1="${px}" y1="${y.toFixed(1)}" x2="${W - 8}" y2="${y.toFixed(1)}" stroke="#E2E8F0" stroke-width=".6"/><text x="${px - 5}" y="${y.toFixed(1)}" font-size="9" fill="#6B7280" text-anchor="end" dominant-baseline="middle">${g}</text>`; }
  days.forEach((d0, i) => { let acc = 0; counts[i].forEach((c, mi) => { if (!c) return; const hh = (H - py - pb) * c / maxD; const y = py + (H - py - pb) * (1 - (acc + c) / maxD); h += `<rect x="${(px + i * bw + 2).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${hh.toFixed(1)}" fill="${colors[mi % colors.length]}" rx="2"><title>${mem[mi].short}：${c}本</title></rect>`; acc += c; }); const d = new Date(d0); if (i % 2 === 1) h += `<text x="${(px + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" font-size="9" fill="#6B7280" text-anchor="middle">${d.getMonth() + 1}/${d.getDate()}</text>`; });
  $("team-days").innerHTML = h;
  $("team-days-legend").innerHTML = mem.map((m, i) => `<span><i style="background:${colors[i % colors.length]}"></i>${m.short || m.name}</span>`).join("");
  // Mr. KOHEI（質）
  const K = [];
  if (!rows.length) K.push(`${pl}はまだ誰も記録がありません。`);
  else {
    const teamWeak = AXES.map(x => x[0]).filter(k => ta[k] !== null).sort((x, y) => ta[x] - ta[y]); const best = teamWeak[teamWeak.length - 1];
    if (teamWeak.length) K.push(`チームで一番弱いのは「${lab(teamWeak[0])}」（${ta[teamWeak[0]].toFixed(1)}）、一番できているのは「${lab(best)}」（${ta[best].toFixed(1)}）。`);
    const strongest = AXES.map(([k, label]) => { const b = per.filter(p => p.a[k] !== null && p.n >= 2).sort((x, y) => y.a[k] - x.a[k])[0]; return b && b.a[k] >= 3.5 ? `${label}は${b.m.short}（${b.a[k].toFixed(1)}）` : null; }).filter(Boolean);
    if (strongest.length) K.push(`うまい人：${strongest.slice(0, 3).join("、")}。朝会で1本見せ合うといい。`);
    per.filter(p => p.weak && p.n >= 2 && p.a[p.weak] <= 2.5).forEach(p => K.push(`${p.m.short}は「${lab(p.weak)}」が${p.a[p.weak].toFixed(1)}。ここを次の3本のテーマに。`));
  }
  const kb = $("team-kohei"); kb.textContent = ""; const kn = document.createElement("span"); kn.className = "nm"; kn.textContent = "Mr. KOHEI ／ チームの質"; kb.appendChild(kn); kb.appendChild(document.createTextNode(K.join("")));
  // Mr. Go fast（量）
  const G = [];
  const wk = mem.map(m => ({ m, w: (allRows || []).filter(r => r.email === m.email && Date.now() - r.entry.at < 7 * 86400000).length }));
  G.push(`今週のチーム合計 ${wk.reduce((a, x) => a + x.w, 0)}本。${wk.map(x => `${x.m.short}${x.w}`).join("、")}。`);
  wk.filter(x => x.w === 0).forEach(x => G.push(`${x.m.short}はゼロ。今日中に2本。`));
  wk.filter(x => x.w > 0 && x.w < 5).forEach(x => G.push(`${x.m.short}は週${x.w}で止まっている、下限の5に届かせろ。`));
  const slow = per.filter(p => p.n).map(p => ({ p, min: Math.round(p.L.reduce((a, e) => a + (e.sec || 0), 0) / p.n / 60) })).filter(x => x.min > 20);
  if (slow.length) G.push(`平均時間：${slow.map(x => `${x.p.m.short}${x.min}分`).join("・")}、長い。`);
  if (list.length) G.push(`4分類の正解率は${Math.round(correct / list.length * 100)}%。週20本を超えてから質を語れ。`);
  const gb = $("team-gofast"); gb.textContent = ""; const gn = document.createElement("span"); gn.className = "nm"; gn.textContent = "Mr. Go fast ／ チームの量"; gb.appendChild(gn); gb.appendChild(document.createTextNode(G.join("")));
  // メンバー管理
  $("team-members").innerHTML = `<tr><th>名前</th><th>ID（メールアドレス）</th><th>権限</th><th>累計</th></tr>` + mem.map(m => `<tr><td><b>${m.name}</b></td><td class="why">${m.email}</td><td>${m.admin ? "管理者" : "メンバー"}</td><td class="n">${m.count}本</td></tr>`).join("");
}
$("dash-clear").addEventListener("click", () => { history = []; saveHistory(); renderDash(); });
loadTemplates(); renderTemplates();

/* ---------- 間違えた暗算チェック（このブラウザに貯める） ---------- */
const MISS_KEY = "ropure-missed-quiz-v1";
let missed = [];
function loadMissed() { try { missed = JSON.parse(localStorage.getItem(uk(MISS_KEY)) || "[]"); if (!Array.isArray(missed)) missed = []; } catch (_) { missed = []; } }
function saveMissed() { try { localStorage.setItem(uk(MISS_KEY), JSON.stringify(missed.slice(-100))); } catch (_) {} renderMissed(); }
function addMissed(q) {
  const same = missed.find(m => m.question === q.question);
  if (same) { same.miss++; same.mine = q.mine; same.at = Date.now(); }
  else missed.push({ question: q.question, answer: q.answer, unit: q.unit, calc: q.calc || [], mental: q.mental || [], mine: q.mine, miss: 1, at: Date.now(), company: persona ? persona.company : "", kind: q.kind || "" });
  saveMissed();
}
const KIND_NAME = { pct: "％暗算", ratio: "率を出す", reverse: "逆算", funnel: "ファネル", revenue: "1受注の売上", roi: "投資と回収" };
function renderKinds() {
  const box = $("kinds"); box.textContent = "";
  const agg = {}; history.forEach(h => (h.quiz || []).forEach(q => { const k = KIND_NAME[q.kind] ? q.kind : "other"; agg[k] = agg[k] || { n: 0, c: 0 }; agg[k].n++; if (q.ok) agg[k].c++; }));
  const keys = Object.keys(agg); if (!keys.length) { const p = document.createElement("p"); p.className = "hint"; p.style.margin = "0"; p.textContent = "暗算チェックを解くと、分野ごとの正解率が出ます。"; box.appendChild(p); return; }
  const rates = keys.map(k => [k, agg[k].c / agg[k].n]); const weak = rates.slice().sort((a, b) => a[1] - b[1])[0][0];
  rates.forEach(([k, r]) => { const d = document.createElement("div"); if (k === weak && r < 0.8) d.className = "weak"; const l = document.createElement("span"); l.textContent = KIND_NAME[k] || "その他"; const bar = document.createElement("div"); bar.className = "bar"; const i = document.createElement("i"); i.style.width = Math.round(r * 100) + "%"; bar.appendChild(i); const v = document.createElement("span"); v.style.textAlign = "right"; v.textContent = Math.round(r * 100) + "%"; d.appendChild(l); d.appendChild(bar); d.appendChild(v); box.appendChild(d); });
}
function renderMissed() {
  $("miss-state").textContent = "間違えた問題 " + missed.length + "件"; $("miss-cnt").textContent = missed.length ? String(missed.length) : ""; renderKinds();
  const ul = $("miss-list"); ul.textContent = "";
  if (!missed.length) { const li = document.createElement("li"); li.className = "hint"; li.textContent = "まだありません。"; ul.appendChild(li); return; }
  missed.slice().reverse().forEach(m => {
    const li = document.createElement("li");
    const q = document.createElement("div"); q.className = "mq"; q.textContent = m.question; li.appendChild(q);
    const meta = document.createElement("div"); meta.className = "mm"; meta.textContent = (KIND_NAME[m.kind] ? KIND_NAME[m.kind] + " ・ " : "") + new Date(m.at).toLocaleDateString("ja-JP") + (m.company ? "・" + m.company : "") + "／" + m.miss + "回間違い／前回の答え：" + (m.mine === null || m.mine === undefined ? "未回答" : m.mine + (m.unit || "")); li.appendChild(meta);
    const row = document.createElement("div"); row.className = "mi";
    const inp = document.createElement("input"); inp.type = "number"; inp.step = "any"; inp.inputMode = "decimal"; inp.placeholder = "解き直す"; row.appendChild(inp);
    const u = document.createElement("span"); u.textContent = m.unit || ""; row.appendChild(u);
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "btn"; btn.textContent = "答える"; row.appendChild(btn);
    const show = document.createElement("button"); show.type = "button"; show.className = "btn"; show.textContent = "答えを見る"; row.appendChild(show);
    li.appendChild(row);
    const res = document.createElement("div"); res.className = "mr"; li.appendChild(res);
    const reveal = (ok) => { res.className = "mr " + (ok ? "ok" : "ng"); res.textContent = (ok ? "正解。一覧から消しました" : "不正解") + "\n答え：" + m.answer + (m.unit || "") + (m.calc.length ? "\n" + m.calc.join("\n") : "") + (m.mental.length ? "\n暗算のコツ：" + m.mental.join("／") : ""); };
    const answer = () => {
      const v = Number(inp.value); if (inp.value.trim() === "" || !isFinite(v)) return;
      const ok = Math.abs(v - m.answer) <= Math.max(Math.abs(m.answer) * 0.02, 0.05);
      if (ok) { missed = missed.filter(x => x !== m); try { localStorage.setItem(uk(MISS_KEY), JSON.stringify(missed)); } catch (_) {} $("miss-state").textContent = "間違えた問題 " + missed.length + "件"; }
      else { m.miss++; m.mine = v; m.at = Date.now(); try { localStorage.setItem(uk(MISS_KEY), JSON.stringify(missed)); } catch (_) {} }
      inp.disabled = true; btn.disabled = true; reveal(ok);
    };
    btn.addEventListener("click", answer); inp.addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); answer(); } });
    show.addEventListener("click", () => { res.className = "mr"; res.textContent = "答え：" + m.answer + (m.unit || "") + (m.calc.length ? "\n" + m.calc.join("\n") : "") + (m.mental.length ? "\n暗算のコツ：" + m.mental.join("／") : ""); });
    ul.appendChild(li);
  });
}
$("miss-clear").addEventListener("click", () => { missed = []; saveMissed(); });
loadMissed(); renderMissed();

/* ---------- ③ チャットロープレ ---------- */
async function askPersona() {
  chatBusy = true; $("chat-send").disabled = true;
  const typing = addMsg("sys", persona.name + "が入力中…");
  try {
    const { reply, quiz } = await api("chat", { persona, history: transcript, company: coForApi(), asked: askedList() });
    typing.remove();
    if (!timerId) return; // 待っている間に商談を終えた
    transcript.push({ who: "them", text: reply }); addMsg("them", reply);
    talking(true, Math.min(5000, 600 + reply.length * 70));
    status("chat-status", "");
    if (quiz && timerId) { $("chat-send").disabled = true; await quizStart(quiz); }
  } catch (e) {
    typing.remove(); status("chat-status", e.message + "（もう一度「送る」で再送できます）", true);
  } finally {
    chatBusy = false; if (timerId) { $("chat-send").disabled = false; $("chat-input").focus(); }
  }
}
async function startChat() {
  lockStart(true); setMode("chat"); resetQuiz();
  transcript = []; $("transcript").textContent = ""; curIn = curOut = ""; inEl = outEl = null;
  addMsg("sys", persona.company + " " + persona.name + "との商談（チャット）。ゴール：課題を言い直して合意を取る");
  step(3); $("dot").classList.add("live"); $("hangup").disabled = false; status("call-status", "");
  $("chat-input").disabled = false; $("chat-input").value = "";
  startTimer();
  addMsg("sys", "あなたから話しかけてください（例：本日はお時間ありがとうございます。今回どのあたりにご興味を持っていただけたんでしょうか）");
  $("chat-send").disabled = false; $("chat-input").focus();
}
async function sendChat() {
  if (chatBusy || !timerId || quizActive()) return;
  const text = $("chat-input").value.trim();
  const last = transcript[transcript.length - 1];
  if (text) { transcript.push({ who: "me", text }); addMsg("me", text); $("chat-input").value = ""; }
  else if (!last || last.who !== "me") return; // 空送信は、直前が自分の発言（再送）のときだけ有効
  await askPersona();
}
$("chat-start").addEventListener("click", startChat);
$("chat-send").addEventListener("click", sendChat);
$("chat-input").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChat(); }
});
$("hangup").addEventListener("click", () => endCall("商談終了 " + $("timer").textContent));

/* ---------- ④ 記録（田村さんへの共有） ---------- */
function copyBtn(id, text, done) {
  const b = $(id); const label = b.dataset.label || (b.dataset.label = b.textContent);
  b.textContent = label;
  b.onclick = () => {
    const ok = () => { b.textContent = done; setTimeout(() => { b.textContent = label; }, 2000); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(ok, () => fallbackCopy(text, ok)); else fallbackCopy(text, ok);
  };
}
function fallbackCopy(text, ok) { const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); ok(); } catch (_) {} t.remove(); }
function logText(r) {
  const lines = transcript.map((t, i) => String(i + 1).padStart(2, "0") + " " + (t.who === "me" ? "営業（自分）" : persona.name) + "：" + t.text);
  return ["【ZenAIロープレ記録】" + persona.company + " " + persona.name + "（" + (mode === "chat" ? "チャット" : "音声") + "）",
    "会社概要：" + persona.brief,
    "相手の役職：" + persona.role + "（決裁権：" + (persona.authority || "") + "）",
    "判定：" + picked + " " + CAT[picked] + "（" + (r.correct ? "正解" : "不正解") + "）／正解：" + r.answer + " " + r.answerLabel,
    "前提 誰のどんな課題を解決しているサービスか：" + ($("premise-value").value.trim() || "（なし）"),
    "前提 なぜそのターゲットなのか：" + ($("premise-target").value.trim() || "（なし）"),
    "前提 この人は何をしている人か：" + ($("premise-person").value.trim() || "（なし）"),
    "問1 相手の営業の説明：" + ($("overview").value.trim() || "（なし）"),
    "問2 自分の言い直し：" + ($("rephrase").value.trim() || "（なし）"),
    "問3 検算：" + calcLine() + "／こういうやり方なら：" + ($("proposal").value.trim() || "（なし）"),
    "", "■ 会話ログ", ...lines, "", "■ 暗算チェック", ...(quizzes.length ? quizzes.map((q, i) => (i + 1) + ". " + q.question + " → 正解" + q.answer + q.unit + "／自分" + (q.mine === null ? "未回答" : q.mine + q.unit) + "（" + (q.ok ? "○" : "×") + "、" + q.sec.toFixed(1) + "秒）") : ["（なし）"]),
    ...(r.counts ? ["", "■ 会話の回数", countsText(r.counts)] : []),
    "", "■ コーチ（AI）の振り返り", r.feedback, r.premiseReview ? "【前提のすり合わせ】" + r.premiseReview : "", r.overviewReview ? "【問1 全体像】" + r.overviewReview : "", r.calcReview ? "【問3 検算】" + r.calcReview : "", r.numbersReview ? "【数字】" + r.numbersReview : "",
    "", "田村さん、ズレていたと思う行番号とアドバイスをお願いします。"].join("\n");
}
function calcLine() {
  const k = calc(false); if (!k) return "（1受注の売上が未入力）";
  const g = guess ? "／暗算：投資" + (guess.invest ?? "—") + "・受注" + (guess.wins ?? "—") + "・回収" + (guess.recover ?? "—") + "・判定" + (guess.judge || "未選択") + (guess.ok ? "○" : "×") : "／暗算せず";
  return g + "／" + k.plan + " 月" + k.monthly + "万×" + k.months + "ヶ月＋準備費" + k.prep + "万＝投資" + k.invest + "万／" + k.calls + "コール×アポ率" + k.apo_rate + "%×受注率" + k.win_rate + "%→受注" + k.wins + "件×" + k.revenue + "万＝回収" + k.recover + "万 → " + (k.ok ? "成立" : "不成立");
}
function showRecord(r) {
  $("record").hidden = false;
  $("record-link").hidden = $("record-copy").hidden = !r.recordUrl;
  if (r.recordUrl) {
    $("record-msg").textContent = "この回の会話をNotionに記録しました。リンクを田村さんに送ると、会話の行ごとにコメントでアドバイスをもらえます。";
    $("record-link").href = r.recordUrl; copyBtn("record-copy", r.recordUrl, "コピーしました");
  } else if (r.recordError) {
    $("record-msg").textContent = "Notionへの記録に失敗しました（" + r.recordError + "）。代わりに会話ログをコピーして、Slackで田村さんに送ってください。";
  } else {
    $("record-msg").textContent = "Notion連携が未設定のため自動記録はできません。会話ログをコピーして、Slackで田村さんに送ってください（行番号付きなので「◯番がズレている」と返してもらえます）。";
  }
  copyBtn("log-copy", logText(r), "コピーしました");
}

/* ---------- ④ 問3 採算の検算 ---------- */
function resetCalc() {
  const c = co(); const sel = $("c-plan"); sel.textContent = "";
  (c.plans || []).forEach((pl, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = pl.name + "（月" + pl.monthly + "万）"; sel.appendChild(o); });
  $("c-months").value = c.months ?? 6; $("c-prep").value = c.prep ?? 0;
  applyChannel();
  $("c-revenue").value = ""; guess = null;
  ["g-invest", "g-wins", "g-recover"].forEach(id => { $(id).value = ""; }); $("g-judge").value = "";
  $("guess").hidden = false; $("calc").hidden = true; $("calc-mental").hidden = true; $("g-check").disabled = false;
  calc();
}
function applyChannel() {
  const c = co(); const inb = $("c-channel").value === "in";
  $("c-calls-label").textContent = inb ? "月の対応リード数" : "稼働量（月のコール数）";
  $("c-apo").previousSibling.textContent = inb ? "商談化率（%）" : "アポ率（%）";
  $("c-calls").value = (inb ? c.in_calls : c.calls) ?? ""; $("c-apo").value = (inb ? c.in_apo_rate : c.apo_rate) ?? ""; $("c-win").value = (inb ? c.in_win_rate : c.win_rate) ?? "";
}
$("c-channel").addEventListener("change", () => { applyChannel(); if (guess) { guess = null; $("calc").hidden = true; $("calc-mental").hidden = true; $("g-check").disabled = false; } calc(); });
let guess = null; // 答え合わせ前の暗算 {invest, wins, recover, judge, ok}
function mentalTips(k) {
  const L = [];
  const m = k.months, pl = k.monthly, calls = k.calls, apo = k.apo_rate, win = k.win_rate, rev = k.revenue;
  L.push(`投資：${pl}万×${m}ヶ月は「${pl}×${m}」。${pl}×${m}＝${fmt(pl * m)}、＋準備費${k.prep}万＝${fmt(k.invest)}万`);
  const apos = m * calls * apo / 100;
  if (apo > 0 && calls > 0) L.push(`アポ：${calls}コールの${apo}%は${apo === 1 ? "二桁ずらして" : apo === 10 ? "一桁ずらして" : apo === 5 ? "10%＝" + fmt(calls / 10) + "の半分で" : apo + "%＝1%（" + fmt(calls / 100) + "）×" + apo + "で"}${fmt(calls * apo / 100)}件／月 → ${m}ヶ月で${fmt(apos)}件`);
  if (win > 0) L.push(`受注：${fmt(apos)}件の${win}%は${win === 10 ? "一桁ずらして" : win === 5 ? "10%＝" + fmt(apos / 10) + "の半分で" : win === 20 ? "10%の2倍で" : win + "%で"}${fmt(k.wins)}件`);
  if (rev > 0) { const need = Math.ceil(k.invest / rev); L.push(`回収：${fmt(k.wins)}件×${rev}万＝${fmt(k.recover)}万。逆に「${fmt(k.invest)}万の中に${rev}万がいくつ？」＝必要${need}件、と先に出す方が速い`); }
  return L;
}
function checkGuess() {
  const k = calc();
  if (!k) { status("grade-status", "問3の変数（1受注の売上まで）を先に入れてください", true); return; }
  const gi = numOr($("g-invest").value, NaN), gw = numOr($("g-wins").value, NaN), gr = numOr($("g-recover").value, NaN), gj = $("g-judge").value;
  const near = (a, b) => isFinite(a) && Math.abs(a - b) <= Math.max(Math.abs(b) * 0.05, 0.5);
  guess = { invest: isFinite(gi) ? gi : null, wins: isFinite(gw) ? gw : null, recover: isFinite(gr) ? gr : null, judge: gj, ok: gj === (k.ok ? "成立" : "不成立"), okInvest: near(gi, k.invest), okWins: near(gw, k.wins), okRecover: near(gr, k.recover) };
  $("g-check").disabled = true; $("calc").hidden = false; status("grade-status", "");
  const body = $("calc-body");
  const wrap = document.createElement("div"); wrap.style.marginBottom = "8px";
  const mark = (ok, label, mine, truth) => { const d = document.createElement("div"); d.className = "chk"; const s = document.createElement("span"); s.className = "mark " + (ok ? "ok" : "ng"); s.textContent = ok ? "○" : "×"; d.appendChild(s); d.appendChild(document.createTextNode(`${label}：あなた ${mine} ／ 正しくは ${truth}`)); wrap.appendChild(d); };
  mark(guess.okInvest, "投資額", guess.invest === null ? "—" : fmt(guess.invest) + "万", fmt(k.invest) + "万");
  mark(guess.okWins, "受注数", guess.wins === null ? "—" : fmt(guess.wins) + "件", fmt(k.wins) + "件");
  mark(guess.okRecover, "回収額", guess.recover === null ? "—" : fmt(guess.recover) + "万", fmt(k.recover) + "万");
  mark(guess.ok, "判定", gj || "未選択", k.ok ? "成立" : "不成立");
  body.insertBefore(wrap, body.firstChild);
  const mt = $("calc-mental"); mt.hidden = false; mt.textContent = ""; const l = document.createElement("span"); l.className = "lab"; l.textContent = "暗算のコツ"; mt.appendChild(l); mt.appendChild(document.createTextNode(mentalTips(k).join("\n")));
  $("calc").scrollIntoView({ block: "nearest" });
}
$("g-check").addEventListener("click", checkGuess);
function calcForGrade() { const k = calc(false); if (!k) return null; k.mine = guess; return k; }
const fmt = n => (Math.round(n * 10) / 10).toLocaleString("ja-JP");
function calc(render = true) {
  const c = co(); const pl = (c.plans || [])[Number($("c-plan").value)] || { name: "", monthly: 0 };
  const m = numOr($("c-months").value, 0), prep = numOr($("c-prep").value, 0), calls = numOr($("c-calls").value, 0);
  const apo = numOr($("c-apo").value, 0), win = numOr($("c-win").value, 0), rev = numOr($("c-revenue").value, NaN);
  const invest = m * pl.monthly + prep;
  const apos = m * calls * apo / 100, wins = apos * win / 100;
  const box = $("calc"), body = $("calc-body");
  if (isNaN(rev) || $("c-revenue").value === "") { if (render) { box.className = "calc"; body.textContent = "投資額 " + fmt(invest) + "万円（" + m + "ヶ月×" + pl.monthly + "万＋" + prep + "万）。1受注の売上を入れると回収額を計算します。"; } return null; }
  const recover = wins * rev, ok = recover >= invest;
  const need = rev > 0 ? Math.ceil(invest / rev) : Infinity;
  const out = { channel: $("c-channel").value === "in" ? "インバウンド" : "アウトバウンド", plan: pl.name, monthly: pl.monthly, months: m, prep, calls, apo_rate: apo, win_rate: win, revenue: rev, invest: Math.round(invest * 10) / 10, wins: Math.round(wins * 10) / 10, recover: Math.round(recover * 10) / 10, ok };
  if (!render) return out;
  box.className = "calc " + (ok ? "ok" : "ng");
  body.innerHTML = "";
  const line = (t) => { const d = document.createElement("div"); d.textContent = t; body.appendChild(d); };
  line("投資額：" + m + "ヶ月 × " + pl.monthly + "万 ＋ " + prep + "万 ＝ " + fmt(invest) + "万円");
  line("受注数：" + m + "ヶ月 × " + calls + "コール × " + apo + "% × " + win + "% ＝ アポ" + fmt(apos) + "件 → 受注" + fmt(wins) + "件");
  line("回収額：" + fmt(wins) + "件 × " + rev + "万 ＝ " + fmt(recover) + "万円（回収に必要な受注は " + (isFinite(need) ? need + "件" : "—") + "）");
  const r = document.createElement("div"); r.className = "res";
  r.textContent = ok ? "回収額 ≧ 投資額 → 成立 → フルで提案" : "回収額 ＜ 投資額 → 不成立 → 絞る、または座組みを変える";
  body.appendChild(r);
  return out;
}
["c-plan", "c-months", "c-prep", "c-calls", "c-apo", "c-win", "c-revenue"].forEach(id => $(id).addEventListener("input", () => { if (guess) { guess = null; $("calc").hidden = true; $("calc-mental").hidden = true; $("g-check").disabled = false; } calc(); }));
$("c-plan").addEventListener("change", calc);
resetCalc();

/* ---------- ④ 判定 ---------- */
document.querySelectorAll("#opts .opt").forEach(b => b.addEventListener("click", () => {
  if (b.disabled) return;
  document.querySelectorAll("#opts .opt").forEach(x => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); picked = b.dataset.k;
}));
$("grade").addEventListener("click", async () => {
  if (!picked) { status("grade-status", "A〜Dを選んでから", true); return; }
  $("grade").disabled = true; status("grade-status", "コーチが会話を振り返っています…");
  try {
    const r = await api("grade", { persona, transcript, picked, rephrase: $("rephrase").value.trim(), mode, premise: { value: $("premise-value").value.trim(), target: $("premise-target").value.trim(), person: $("premise-person").value.trim() }, overview: $("overview").value.trim(), calc: calcForGrade(), proposal: $("proposal").value.trim(), company: coForApi(), quizzes, checks: checksForApi() });
    document.querySelectorAll("#opts .opt").forEach(b => { b.disabled = true; if (b.dataset.k === r.answer) b.classList.add("correct"); else if (b.dataset.k === picked) b.classList.add("wrong"); });
    const v = $("verdict"); v.hidden = false; v.className = "verdict" + (r.correct ? "" : " ng"); v.textContent = "";
    const lab = document.createElement("span"); lab.className = "lab"; lab.textContent = (r.correct ? "正解" : "不正解") + " ／ 答え：" + r.answer + " " + r.answerLabel; v.appendChild(lab);
    v.appendChild(document.createTextNode("相手：" + persona.name + "（" + persona.role + "）決裁権：" + (persona.authority || "") + "\n\n"));
    v.appendChild(document.createTextNode(r.exp + "\n\n言い直しの模範例：" + r.rephrase_example));
    const f = $("feedback"); f.hidden = false; f.textContent = ""; const l2 = document.createElement("span"); l2.className = "lab"; l2.textContent = "COACH（全文）"; f.appendChild(l2); f.appendChild(document.createTextNode(r.feedback));
    const fillPts = (id, arr, fallback) => { const ul = $(id); ul.textContent = ""; (arr && arr.length ? arr : [fallback]).forEach(t => { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); }); };
    fillPts("res-good", r.good, "（コーチの全文を参照）"); fillPts("res-improve", r.improve, "（コーチの全文を参照）");
    coachSayRes(String(r.feedback || "").slice(0, 240) + (r.nextAction ? "\n次の一手：" + r.nextAction : ""));
    gofastSay(r.secondOpinion || "（指摘なし）");
    $("res-company").textContent = persona.company + " ／ " + persona.name + "（" + persona.role + "）";
    renderResInfo(true);
    if (r.premiseReview) f.appendChild(document.createTextNode("\n\n【前提のすり合わせ】" + r.premiseReview));
    if (r.overviewReview) f.appendChild(document.createTextNode("\n\n【問1 全体像】" + r.overviewReview));
    if (r.calcReview) f.appendChild(document.createTextNode("\n\n【問3 検算】" + r.calcReview));
    if (r.numbersReview) f.appendChild(document.createTextNode("\n\n【数字】" + r.numbersReview));
    renderCounts(r.counts, r.countsError);
    const ent = recordHistory(r);
    if (ent) { const L = ent.total >= 4.5 ? "S" : ent.total >= 4 ? "A" : ent.total >= 3.5 ? "B" : ent.total >= 3 ? "C" : ent.total >= 2.5 ? "D" : "E"; $("res-grade").textContent = L; $("res-total").textContent = ent.total.toFixed(1) + " / 5"; drawRadarInto($("res-radar"), { scores: skillScores(ent.scores) }, history.length > 1 ? skillScores(avgScores(history.slice(0, -1))) : null, SKILLS); renderSkillList($("res-axes"), skillScores(ent.scores), null); }
    rtab("eval"); window.scrollTo(0, 0);
    const strip = $("score-strip"); strip.hidden = !ent; if (ent) { strip.innerHTML = (ent.custom && Object.keys(ent.custom).length ? `<span style="border:0;background:none;padding-left:0;color:var(--ink-2)">上司FBの観点：</span>` + Object.values(ent.custom).map(c => `<span style="background:#E0F5EF;border-color:#B5E3E8" title="${c.why.replace(/"/g, "&quot;")}">${c.title} <b>${c.score}</b></span>`).join("") : ""); strip.hidden = !strip.innerHTML; if (ent.next) f.appendChild(document.createTextNode("\n\n【次の一手】" + ent.next)); }
    status("grade-status", r.saved ? "この回の気づきを知見に追記しました" : ""); $("again").hidden = false; if (r.saved) loadKnow();
    showRecord(r);
  } catch (e) { status("grade-status", e.message, true); $("grade").disabled = false; }
});
$("again").addEventListener("click", () => { $("record").hidden = true; $("counts-panel").hidden = true; $("playback").hidden = true; $("score-strip").hidden = true; step(1); lockStart(false); window.scrollTo(0, 0); });

/* ---------- 起動 ---------- */
loadUser();
if (pw() && user) { hideLogin(); $("logout").hidden = false; renderUserChip(); api("me", { email: user.email }).then(j => { user = j.user; members = j.members || []; shared = !!j.shared; try { sessionStorage.setItem("user", JSON.stringify(user)); } catch (_) {} afterLogin(); }).catch(() => {}); }
else showLogin();
