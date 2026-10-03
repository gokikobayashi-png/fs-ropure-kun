import { GoogleGenAI } from "https://esm.sh/@google/genai";
import { renderAvatar } from "/avatar.js";

const $ = id => document.getElementById(id);
const CAT = { A: "戦略", B: "手法", C: "量", D: "質" };
let persona = null, session = null, transcript = [], picked = null;
let history = [];
let micCtx = null, micStream = null, micNode = null, playCtx = null, nextPlay = 0, sources = [];
let camStream = null, recorder = null, recChunks = [], recDest = null, recUrl = "";
let timerId = null, startedAt = 0, curIn = "", curOut = "", inEl = null, outEl = null, mode = "voice", chatBusy = false;

/* ---------- 認証（共有パスワード） ---------- */
function pw() { try { return (sessionStorage.getItem("pw") || "").normalize("NFKC").replace(/[^\x20-\x7E]/g, ""); } catch (_) { return ""; } }
async function api(path, body) {
  const r = await fetch("/api/" + path, { method: "POST", headers: { "content-type": "application/json", "x-app-password": pw() }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { status("pw-status", j.error || "パスワードが違います"); showLogin(); throw new Error(j.error || "ログインが必要"); }
  if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
  return j;
}
function showLogin() { $("login").hidden = false; $("app").hidden = true; document.body.style.overflow = "hidden"; setTimeout(() => $("pw").focus(), 50); }
function hideLogin() { $("login").hidden = true; $("app").hidden = false; document.body.style.overflow = ""; }
$("pw-ok").addEventListener("click", () => { try { sessionStorage.setItem("pw", $("pw").value.normalize("NFKC").trim()); } catch (_) {} if (!$("pw").value.trim()) { status("pw-status", "パスワードを入れてください", true); return; } hideLogin(); $("logout").hidden = false; status("pw-status", ""); loadKnow(); });
$("pw").addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); $("pw-ok").click(); } });
$("pw-eye").addEventListener("click", () => { const i = $("pw"); i.type = i.type === "password" ? "text" : "password"; });
if (!pw()) showLogin();
$("logout").addEventListener("click", () => { try { sessionStorage.removeItem("pw"); } catch (_) {} location.reload(); });
if (pw()) $("logout").hidden = false;


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
});
$("co-reset").addEventListener("click", () => {
  company = null; try { localStorage.removeItem(CO_KEY); } catch (_) {}
  fillCompany(CO_DEFAULT); showCoState(); status("co-status", "既定（ゼンテクト）に戻しました");
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
loadKnow();

/* ---------- 画面遷移 ---------- */
function view(name) {
  ["play", "dash", "history", "settings"].forEach(v => { $("view-" + v).hidden = v !== name; });
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.view === name));
  if (name === "dash") renderDash();
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
  const data = {}; ["ropure-company-v1", "ropure-boss-fb-v1", "ropure-missed-quiz-v1", "ropure-history-v1", "ropure-templates-v1"].forEach(k => { try { data[k] = JSON.parse(localStorage.getItem(k) || "null"); } catch (_) {} });
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
function caseSettings() { return { industry: $("industry").value.trim(), product: $("product").value.trim(), size: $("size").value.trim(), sales_team: $("sales-team").value.trim(), difficulty: $("difficulty").value, layer: $("layer").value, answer: $("answer").value, style: styleKey }; }
function applyCase(c) { $("industry").value = c.industry || ""; $("product").value = c.product || ""; $("size").value = c.size || ""; $("sales-team").value = c.sales_team || ""; $("difficulty").value = c.difficulty || "normal"; $("layer").value = c.layer || ""; $("answer").value = c.answer || ""; styleKey = c.style || ""; document.querySelectorAll("#styles .stylecard").forEach(x => x.classList.toggle("on", (x.dataset.style || "") === styleKey)); }
const TPL_KEY = "ropure-templates-v1";
let templates = [];
function loadTemplates() { try { templates = JSON.parse(localStorage.getItem(TPL_KEY) || "[]"); if (!Array.isArray(templates)) templates = []; } catch (_) { templates = []; } }
function saveTemplates() { try { localStorage.setItem(TPL_KEY, JSON.stringify(templates.slice(0, 30))); } catch (_) {} renderTemplates(); }
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
  const name = [c.industry, c.product, c.layer ? LAYER_NAME[c.layer] : ""].filter(Boolean).join("・") || "名前なしの相手";
  const t = { id: Date.now().toString(36), name, ...c }; templates.unshift(t); currentTpl = t.id; saveTemplates(); status("gen-status", "保存しました：" + name);
});
["industry", "product", "size", "sales-team", "layer", "difficulty", "answer"].forEach(id => $(id).addEventListener("input", () => { currentTpl = null; }));

/* ---------- ① → ② ペルソナ生成 ---------- */
async function generate() {
  $("gen").disabled = true; lockStart(true); status("gen-status", "相手を用意しています（10〜20秒）…");
  try {
    persona = await api("persona", { ...caseSettings(), company: coForApi() }); persona.tpl = currentTpl;
    $("p-company").textContent = persona.company;
    $("p-brief").textContent = persona.brief;
    $("p-name").textContent = persona.name + "（役職は商談で確認）";
    $("p-opening").textContent = persona.opening_line;
    renderAvatar($("p-avatar"), persona); renderAvatar($("call-avatar"), persona);
    $("call-name").textContent = persona.name; $("call-company").textContent = persona.company;
    $("call-brief").textContent = persona.brief; $("call-opening").textContent = "冒頭のひとこと「" + persona.opening_line + "」"; $("call-role").textContent = "役職は商談で確認";
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
function flushOut() { if (curOut.trim()) transcript.push({ who: "them", text: curOut.trim() }); curOut = ""; outEl = null; }

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
    const name = "ropure_" + jst() + "_" + (persona ? persona.company : "") + (isVideo ? ".webm" : ".weba");
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
  flushIn(); flushOut();
  try { session && session.close(); } catch (_) {} session = null;
  cleanupAudio();
  $("dot").classList.remove("live"); $("hangup").disabled = true;
  $("chat-input").disabled = true; $("chat-send").disabled = true;
  if (note) addMsg("sys", note);
  picked = null; document.querySelectorAll("#opts .opt").forEach(b => { b.setAttribute("aria-pressed", "false"); b.classList.remove("correct", "wrong"); b.disabled = false; });
  $("rephrase").value = ""; $("overview").value = ""; $("proposal").value = ""; resetCalc(); $("verdict").hidden = true; $("feedback").hidden = true; $("again").hidden = true; $("grade").disabled = false; status("grade-status", "");
  resetResult();
  if (mode === "voice" && transcript.length) voiceQuiz().then(() => showResult()); else showResult();
}
function resetResult() {
  $("res-date").textContent = new Date().toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  $("res-company").textContent = persona.company + " ／ " + persona.name + "（役職は判定後に表示）";
  $("res-mode").textContent = (mode === "chat" ? "チャット" : "音声") + " ・ " + $("timer").textContent;
  $("res-good").textContent = ""; $("res-improve").textContent = ""; $("res-radar").innerHTML = ""; $("res-axes").textContent = "";
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
  row("会社", persona.company); row("会社概要", persona.brief); row("相手", persona.name); row("冒頭のひとこと", persona.opening_line);
  if (graded) { row("役職", persona.role); row("決裁権", persona.authority); row("タイプ（ソーシャルスタイル）", (persona.style_name || "—") + (persona.style_hidden ? "（伏せていました）" : "")); row("正解", CAT[persona.answer] + "：" + (persona.exp || "")); row("言い直しの模範例", persona.rephrase_example); }
  else row("役職・決裁権・タイプ・相手の事実", "判定後に表示");
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
function loadChecks() { try { const v = JSON.parse(localStorage.getItem(FB_KEY) || "null"); checks = Array.isArray(v) ? v : FB_SEED.map(x => ({ ...x, at: Date.now() })); } catch (_) { checks = FB_SEED.map(x => ({ ...x, at: Date.now() })); } if (!localStorage.getItem(FB_KEY)) saveChecks(); }
function saveChecks() { try { localStorage.setItem(FB_KEY, JSON.stringify(checks.slice(0, 12))); } catch (_) {} renderChecks(); }
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

/* ---------- スコア履歴とダッシュボード（このブラウザに保存） ---------- */
const HIST_KEY = "ropure-history-v1";
const AXES = [["counterpart", "相手の把握"], ["widen", "広げる"], ["classify", "深掘る"], ["rephrase", "言い直し"], ["converge", "狭める"], ["roi", "検算"], ["numbers", "数字"]];
function loadHistory() { try { history = JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); if (!Array.isArray(history)) history = []; } catch (_) { history = []; } }
function saveHistory() { try { localStorage.setItem(HIST_KEY, JSON.stringify(history.slice(-200))); } catch (_) {} }
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
function recordHistory(r) {
  if (!r.scores) return null;
  const sc = { ...r.scores }; const ns = numbersScore(); if (ns) sc.numbers = ns;
  const keys = AXES.map(a => a[0]).filter(k => sc[k]);
  const total = keys.reduce((s, k) => s + sc[k].score, 0) / keys.length;
  const e = { at: Date.now(), company: persona.company, role: persona.role, mode, correct: !!r.correct, answer: r.answer, picked, scores: sc, custom: r.custom || null, tpl: persona.tpl || null, style: persona.style || "", quiz: quizzes.map(q => ({ kind: q.kind, ok: q.ok })), total: Math.round(total * 10) / 10, next: r.nextAction || "", feedback: String(r.feedback || "").slice(0, 600), sec: Math.round((Date.now() - startedAt) / 1000) };
  history.push(e); saveHistory(); return e;
}
function avgScores(list) { const out = {}; AXES.forEach(([k]) => { const v = list.map(e => e.scores[k] && e.scores[k].score).filter(x => x); out[k] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }); return out; }
function polar(cx, cy, r, i, n) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
function drawRadar(latest, avg) { drawRadarInto($("radar"), latest, avg); }
function renderAxList(ent) {
  const avg = avgScores(history); const box = $("res-axes"); box.textContent = "";
  const weakK = AXES.map(([k]) => k).filter(k => avg[k] !== null).sort((a, b) => avg[a] - avg[b])[0];
  AXES.forEach(([k, label]) => { const s = ent.scores[k]; const d = document.createElement("div"); if (k === weakK) d.className = "weak"; const l = document.createElement("span"); l.textContent = label + (k === weakK ? "（弱点）" : ""); const v = document.createElement("span"); const b = document.createElement("b"); b.textContent = s ? s.score : "—"; b.style.color = s && s.score <= 2 ? "var(--bad)" : s && s.score >= 5 ? "#059669" : ""; v.appendChild(b); const a = document.createElement("span"); a.className = "avg"; a.textContent = " / " + (avg[k] !== null ? avg[k].toFixed(1) : "—"); v.appendChild(a); d.appendChild(l); d.appendChild(v); d.title = s ? s.why : ""; box.appendChild(d); });
}
function drawRadarInto(svg, latest, avg) {
  const n = AXES.length, cx = 160, cy = 150, R = 100; let h = "";
  for (let g = 1; g <= 5; g++) { const pts = AXES.map((_, i) => polar(cx, cy, R * g / 5, i, n).map(v => v.toFixed(1)).join(",")).join(" "); h += `<polygon points="${pts}" fill="none" stroke="#E2E8F0" stroke-width="${g === 5 ? 1.2 : .6}"/>`; }
  AXES.forEach(([k, label], i) => { const [x, y] = polar(cx, cy, R, i, n); const [lx, ly] = polar(cx, cy, R + 22, i, n); h += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#E2E8F0" stroke-width=".6"/><text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="11" fill="#6B7280" text-anchor="middle" dominant-baseline="middle">${label}</text>`; });
  const poly = (sc, fill, stroke, op) => { const pts = AXES.map(([k], i) => polar(cx, cy, R * ((sc[k] && (sc[k].score ?? sc[k])) || 0) / 5, i, n).map(v => v.toFixed(1)).join(",")).join(" "); return `<polygon points="${pts}" fill="${fill}" fill-opacity="${op}" stroke="${stroke}" stroke-width="1.5"/>`; };
  if (avg) h += poly(avg, "#6B7280", "#6B7280", .12);
  if (latest) h += poly(latest.scores, "#05AABA", "#05AABA", .3) + AXES.map(([k], i) => { const s = latest.scores[k] ? latest.scores[k].score : 0; const [x, y] = polar(cx, cy, R * s / 5, i, n); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#05AABA"/>`; }).join("");
  svg.innerHTML = h;
}
function drawTrend(list) {
  const svg = $("trend"); const L = list.slice(-20); const W = 320, H = 180, px = 28, py = 14; let h = "";
  for (let g = 1; g <= 5; g++) { const y = py + (H - 2 * py) * (1 - (g - 1) / 4); h += `<line x1="${px}" y1="${y.toFixed(1)}" x2="${W - 8}" y2="${y.toFixed(1)}" stroke="#E2E8F0" stroke-width=".6"/><text x="${px - 6}" y="${y.toFixed(1)}" font-size="10" fill="#6B7280" text-anchor="end" dominant-baseline="middle">${g}</text>`; }
  if (!L.length) { svg.innerHTML = h; return; }
  const xs = i => L.length === 1 ? (px + W - 8) / 2 : px + (W - 8 - px) * i / (L.length - 1);
  const ys = v => py + (H - 2 * py) * (1 - (v - 1) / 4);
  h += `<polyline points="${L.map((e, i) => xs(i).toFixed(1) + "," + ys(e.total).toFixed(1)).join(" ")}" fill="none" stroke="#05AABA" stroke-width="2"/>`;
  L.forEach((e, i) => { h += `<circle cx="${xs(i).toFixed(1)}" cy="${ys(e.total).toFixed(1)}" r="3.5" fill="${e.correct ? "#05AABA" : "#EF4444"}"><title>${new Date(e.at).toLocaleDateString("ja-JP")} ${e.company} 総合${e.total}（判定${e.correct ? "○" : "×"}）</title></circle>`; });
  svg.innerHTML = h;
}
function donut(label, score, why, weak) {
  const r = 34, c = 2 * Math.PI * r, p = score ? score / 5 : 0;
  return `<div class="donut${weak ? " weak" : ""}" title="${(why || "").replace(/"/g, "&quot;")}"><svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="${r}" fill="none" stroke="#E2E8F0" stroke-width="10"/><circle cx="42" cy="42" r="${r}" fill="none" stroke="${weak ? "#EF4444" : "#05AABA"}" stroke-width="10" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" stroke-linecap="round" transform="rotate(-90 42 42)"/><text x="42" y="47" text-anchor="middle" class="dv">${score ? score : "—"}</text></svg><span class="dl">${label}</span>${why ? `<span class="dw">${why}</span>` : ""}</div>`;
}
function coachSay(text) { const b = $("coach-say"); b.textContent = ""; const n = document.createElement("span"); n.className = "nm"; n.textContent = "Mr. KOHEI"; b.appendChild(n); b.appendChild(document.createTextNode(text)); }
function renderHistory() {
  const t = $("hist-table"); t.innerHTML = `<tr><th>日時</th><th>相手</th><th>方式</th><th>4分類</th><th>総合</th><th>次の一手</th></tr>` + (history.length ? history.slice().reverse().map(e => `<tr><td class="n">${new Date(e.at).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</td><td>${e.company}<span class="why">（${e.role || ""}）</span></td><td>${e.mode === "chat" ? "チャット" : "音声"}</td><td class="n">${e.correct ? "○" : "×"}</td><td class="n"><b>${e.total.toFixed(1)}</b></td><td class="why">${e.next || ""}</td></tr>`).join("") : `<tr><td colspan="6" class="why">まだありません。</td></tr>`);
}
function gofastVolume() {
  const now = Date.now(), day = 86400000;
  const n = history.length, today = history.filter(e => now - e.at < day).length, week = history.filter(e => now - e.at < 7 * day).length, month = history.filter(e => now - e.at < 30 * day).length;
  const days = new Set(history.map(e => new Date(e.at).toDateString())).size;
  const last = n ? Math.floor((now - history[n - 1].at) / day) : null;
  const avgMin = n ? Math.round(history.reduce((a, e) => a + (e.sec || 0), 0) / n / 60) : 0;
  const L = [];
  if (!n) return "記録ゼロ。話にならない。今日中に3本。量をやらない人間に質は来ない。";
  L.push(`今日${today}本、今週${week}本、累計${n}本（${days}日）。`);
  if (today === 0) L.push("今日はまだゼロ。これを読んでいる暇があったら1本やれ。");
  else if (today < 3) L.push(`今日${today}本で終わる気か。最低3本。`);
  else L.push(`今日${today}本。やっと普通。`);
  if (week < 5) L.push(`週${week}本は少ない。週5本が下限、週10本で初めて伸びる。`);
  else if (week < 10) L.push(`週${week}本。下限はクリア。週10本に上げろ。`);
  else L.push(`週${week}本。量は合格。次は1本あたりの時間を短く、同じ結論に速く辿り着け。`);
  if (last !== null && last >= 2) L.push(`最後にやったのは${last}日前。空けた分だけ戻る。`);
  if (avgMin && avgMin > 20) L.push(`1本平均${avgMin}分。長い。15分で全体像を掴めるようにしろ。`);
  const correct = history.filter(e => e.correct).length;
  if (n >= 5 && correct / n < 0.5) L.push(`4分類の正解率${Math.round(correct / n * 100)}%。考えてから打つな、打ってから考えろ。数をこなせば判定順序が体に入る。`);
  return L.join("");
}
function gofastDashSay(text) { const b = $("dash-gofast"); b.textContent = ""; const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = "Mr. Go fast ／ 量"; b.appendChild(nm); b.appendChild(document.createTextNode(text)); }
function renderDash() {
  gofastDashSay(gofastVolume());
  const n = history.length;
  if ($("dash-state")) $("dash-state").textContent = n ? `${n}回分の記録` : "まだロープレがありません";
  if (!n) { $("kpis").innerHTML = ""; $("axes").innerHTML = ""; $("donuts").innerHTML = ""; $("donuts-fb").innerHTML = ""; $("fb-none").hidden = false; drawRadar(null, null); drawTrend([]); $("hist").textContent = ""; coachSay("まだロープレの記録がありません。1回やると、ここで所見を話します。"); return; }
  const latest = history[n - 1], avg = avgScores(history), prev = history.slice(0, -1);
  const avgTotal = history.reduce((s, e) => s + e.total, 0) / n;
  const correct = history.filter(e => e.correct).length;
  const kpi = (k, v, sub) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}${sub ? `<small> ${sub}</small>` : ""}</div></div>`;
  $("kpis").innerHTML = kpi("直近の総合", latest.total.toFixed(1), "/5") + kpi("平均", avgTotal.toFixed(1), "/5") + kpi("4分類の正解率", Math.round(correct / n * 100) + "%", `${correct}/${n}`) + kpi("ロープレ回数", n, "回");
  drawRadar(latest, prev.length ? avgScores(prev) : null); drawTrend(history);
  $("hist").textContent = "● 緑＝4分類が正解、赤＝不正解。点にカーソルを合わせると会社名が出ます";
  const weakK = AXES.map(([k]) => k).filter(k => avg[k] !== null).sort((a, b) => avg[a] - avg[b])[0];
  $("axes").innerHTML = `<tr><th>軸</th><th>直近</th><th style="width:30%">平均</th><th>直近の根拠</th></tr>` + AXES.map(([k, label]) => { const s = latest.scores[k]; const a = avg[k]; return `<tr class="${k === weakK ? "weak" : ""}"><td>${label}${k === weakK ? "（弱点）" : ""}</td><td class="n">${s ? s.score : "—"}</td><td><div class="bar"><i style="width:${a ? a / 5 * 100 : 0}%"></i></div><span class="why">${a ? a.toFixed(1) : "—"}</span></td><td class="why">${s ? s.why : "記録なし"}</td></tr>`; }).join("");
  $("donuts").innerHTML = AXES.map(([k, label]) => { const s = latest.scores[k]; return donut(label, s ? s.score : 0, s ? s.why : "", k === weakK); }).join("");
  const cu = latest.custom ? Object.values(latest.custom) : [];
  const cuWeak = cu.length ? Math.min(...cu.map(c => c.score)) : 0;
  $("donuts-fb").innerHTML = cu.map(c => donut(c.title, c.score, c.why, c.score === cuWeak && c.score <= 3)).join("");
  $("fb-none").hidden = !!cu.length;
  const weakLabel = (AXES.find(a => a[0] === weakK) || [])[1] || "";
  const trend = prev.length ? (latest.total - prev[prev.length - 1].total) : 0;
  const fbWeak = cu.filter(c => c.score <= 2);
  coachSay([
    `直近は ${latest.company} との商談で、総合 ${latest.total.toFixed(1)}／5${prev.length ? `（前回比 ${trend >= 0 ? "+" : ""}${trend.toFixed(1)}）` : ""}。4分類は${latest.correct ? "正解" : "不正解"}でした。`,
    weakLabel ? `平均で一番低いのは「${weakLabel}」（${avg[weakK].toFixed(1)}）。${latest.scores[weakK] ? latest.scores[weakK].why : ""}` : "",
    fbWeak.length ? `上司のFBの観点では「${fbWeak.map(c => c.title).join("」「")}」ができていません。${fbWeak[0].why}` : (cu.length ? "上司のFBの観点は、おおむね守れています。" : ""),
    latest.next ? `次の一手：${latest.next}` : "",
  ].filter(Boolean).join("\n"));
}
$("dash-clear").addEventListener("click", () => { history = []; saveHistory(); renderDash(); });
loadHistory(); renderDash(); loadTemplates(); renderTemplates();

/* ---------- 間違えた暗算チェック（このブラウザに貯める） ---------- */
const MISS_KEY = "ropure-missed-quiz-v1";
let missed = [];
function loadMissed() { try { missed = JSON.parse(localStorage.getItem(MISS_KEY) || "[]"); if (!Array.isArray(missed)) missed = []; } catch (_) { missed = []; } }
function saveMissed() { try { localStorage.setItem(MISS_KEY, JSON.stringify(missed.slice(-100))); } catch (_) {} renderMissed(); }
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
      if (ok) { missed = missed.filter(x => x !== m); try { localStorage.setItem(MISS_KEY, JSON.stringify(missed)); } catch (_) {} $("miss-state").textContent = "間違えた問題 " + missed.length + "件"; }
      else { m.miss++; m.mine = v; m.at = Date.now(); try { localStorage.setItem(MISS_KEY, JSON.stringify(missed)); } catch (_) {} }
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
    "問1 相手の営業の説明：" + ($("overview").value.trim() || "（なし）"),
    "問2 自分の言い直し：" + ($("rephrase").value.trim() || "（なし）"),
    "問3 検算：" + calcLine() + "／こういうやり方なら：" + ($("proposal").value.trim() || "（なし）"),
    "", "■ 会話ログ", ...lines, "", "■ 暗算チェック", ...(quizzes.length ? quizzes.map((q, i) => (i + 1) + ". " + q.question + " → 正解" + q.answer + q.unit + "／自分" + (q.mine === null ? "未回答" : q.mine + q.unit) + "（" + (q.ok ? "○" : "×") + "、" + q.sec.toFixed(1) + "秒）") : ["（なし）"]),
    "", "■ コーチ（AI）の振り返り", r.feedback, r.overviewReview ? "【問1 全体像】" + r.overviewReview : "", r.calcReview ? "【問3 検算】" + r.calcReview : "", r.numbersReview ? "【数字】" + r.numbersReview : "",
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
    const r = await api("grade", { persona, transcript, picked, rephrase: $("rephrase").value.trim(), mode, overview: $("overview").value.trim(), calc: calcForGrade(), proposal: $("proposal").value.trim(), company: coForApi(), quizzes, checks: checksForApi() });
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
    if (r.overviewReview) f.appendChild(document.createTextNode("\n\n【問1 全体像】" + r.overviewReview));
    if (r.calcReview) f.appendChild(document.createTextNode("\n\n【問3 検算】" + r.calcReview));
    if (r.numbersReview) f.appendChild(document.createTextNode("\n\n【数字】" + r.numbersReview));
    const ent = recordHistory(r);
    if (ent) { const L = ent.total >= 4.5 ? "S" : ent.total >= 4 ? "A" : ent.total >= 3.5 ? "B" : ent.total >= 3 ? "C" : ent.total >= 2.5 ? "D" : "E"; $("res-grade").textContent = L; $("res-total").textContent = ent.total.toFixed(1) + " / 5"; drawRadarInto($("res-radar"), ent, history.length > 1 ? avgScores(history.slice(0, -1)) : null); renderAxList(ent); }
    rtab("eval"); window.scrollTo(0, 0);
    const strip = $("score-strip"); strip.hidden = !ent; if (ent) { strip.innerHTML = (ent.custom && Object.keys(ent.custom).length ? `<span style="border:0;background:none;padding-left:0;color:var(--ink-2)">上司FBの観点：</span>` + Object.values(ent.custom).map(c => `<span style="background:#E0F5EF;border-color:#B5E3E8" title="${c.why.replace(/"/g, "&quot;")}">${c.title} <b>${c.score}</b></span>`).join("") : ""); strip.hidden = !strip.innerHTML; if (ent.next) f.appendChild(document.createTextNode("\n\n【次の一手】" + ent.next)); }
    status("grade-status", r.saved ? "この回の気づきを知見に追記しました" : ""); $("again").hidden = false; if (r.saved) loadKnow();
    showRecord(r);
  } catch (e) { status("grade-status", e.message, true); $("grade").disabled = false; }
});
$("again").addEventListener("click", () => { $("record").hidden = true; $("playback").hidden = true; $("score-strip").hidden = true; step(1); lockStart(false); window.scrollTo(0, 0); });
