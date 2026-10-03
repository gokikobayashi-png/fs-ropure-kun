import { GoogleGenAI } from "https://esm.sh/@google/genai";
import { renderAvatar } from "/avatar.js";

const $ = id => document.getElementById(id);
const CAT = { A: "戦略", B: "手法", C: "量", D: "質" };
let persona = null, session = null, transcript = [], picked = null;
let micCtx = null, micStream = null, micNode = null, playCtx = null, nextPlay = 0, sources = [];
let timerId = null, startedAt = 0, curIn = "", curOut = "", inEl = null, outEl = null, mode = "voice", chatBusy = false;

/* ---------- 認証（共有パスワード） ---------- */
function pw() { try { return (sessionStorage.getItem("pw") || "").normalize("NFKC").replace(/[^\x20-\x7E]/g, ""); } catch (_) { return ""; } }
async function api(path, body) {
  const r = await fetch("/api/" + path, { method: "POST", headers: { "content-type": "application/json", "x-app-password": pw() }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { showLogin(); throw new Error(j.error || "ログインが必要"); }
  if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
  return j;
}
function showLogin() { $("login").hidden = false; $("step1").hidden = true; $("co").hidden = true; }
$("pw-ok").addEventListener("click", () => { try { sessionStorage.setItem("pw", $("pw").value.normalize("NFKC").trim()); } catch (_) {} $("login").hidden = true; $("step1").hidden = false; $("co").hidden = false; $("logout").hidden = false; loadKnow(); });
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
  prep: 20, months: 6, trial_months: 3, calls: 1000, apo_rate: 1, win_rate: 5,
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
    objections: [...$("co-objs").querySelectorAll("input")].map(i => i.value.trim()).filter(Boolean),
  };
}
function showCoState() { $("co-state").textContent = company ? "保存済み：" + company.company + "／" + company.product : "既定（ゼンテクト）"; }
$("co-toggle").addEventListener("click", () => {
  const open = $("co-body").hidden; $("co-body").hidden = !open;
  $("co-toggle").textContent = open ? "閉じる" : "編集する"; $("co-toggle").setAttribute("aria-expanded", String(open));
  if (open) fillCompany(co());
});
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
    if (r.status === 401) { $("know-status").textContent = "ログイン後に表示"; showLogin(); return; }
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
function step(n) {
  [1, 2, 3, 4].forEach(i => { $("s" + i).classList.toggle("on", i === n); });
  $("step1").hidden = n !== 1; $("step2").hidden = n < 2 || n > 3; $("step3").hidden = n !== 3; $("step4").hidden = n !== 4;
  if (n === 3) $("step2").hidden = true;
}
function status(id, text, err) { const e = $(id); e.textContent = text || ""; e.classList.toggle("err", !!err); }

/* ---------- ① → ② ペルソナ生成 ---------- */
async function generate() {
  $("gen").disabled = true; lockStart(true); status("gen-status", "相手を用意しています（10〜20秒）…");
  try {
    persona = await api("persona", { industry: $("industry").value.trim(), product: $("product").value.trim(), size: $("size").value.trim(), difficulty: $("difficulty").value, layer: $("layer").value, company: coForApi() });
    $("p-company").textContent = persona.company;
    $("p-brief").textContent = persona.brief;
    $("p-name").textContent = persona.name + "（役職は商談で確認）";
    $("p-opening").textContent = persona.opening_line;
    renderAvatar($("p-avatar"), persona); renderAvatar($("call-avatar"), persona);
    $("call-name").textContent = persona.name; $("call-company").textContent = persona.company;
    status("gen-status", ""); status("call-status", "");
    $("co-body").hidden = true; $("co-toggle").textContent = "編集する"; $("co").hidden = true;
    step(2);
  } catch (e) { status("gen-status", e.message, true); }
  finally { $("gen").disabled = false; lockStart(false); }
}
$("gen").addEventListener("click", generate);
$("regen").addEventListener("click", generate);

/* ---------- ③ 音声ロープレ ---------- */
function addMsg(who, text) {
  const d = document.createElement("div"); d.className = "msg " + who;
  if (who !== "sys") { const w = document.createElement("span"); w.className = "who"; w.textContent = who === "me" ? "あなた" : persona.name; d.appendChild(w); }
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
  const src = playCtx.createBufferSource(); src.buffer = buf; src.connect(playCtx.destination);
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
  $("chatbox").hidden = !chat; $("chat-hint").hidden = !chat; $("voice-hint").hidden = chat;
  $("meter").parentElement.hidden = chat;
  status("chat-status", "");
}
function startTimer() {
  startedAt = Date.now(); $("timer").textContent = "00:00";
  timerId = setInterval(() => { const s = Math.floor((Date.now() - startedAt) / 1000); $("timer").textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }, 500);
}
function lockStart(on) { $("call").disabled = on; $("chat-start").disabled = on; $("regen").disabled = on; }

async function startCall() {
  lockStart(true); setMode("voice"); status("call-status", "マイクの許可 → 接続中…");
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const { token, model, config } = await api("token", { persona, company: coForApi() });

    playCtx = new AudioContext({ sampleRate: 24000 }); await playCtx.resume();
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
function cleanupAudio() {
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
  $("step3").hidden = false; step(4); $("step3").hidden = false;
}
$("call").addEventListener("click", startCall);

/* ---------- ③ チャットロープレ ---------- */
async function askPersona() {
  chatBusy = true; $("chat-send").disabled = true;
  const typing = addMsg("sys", persona.name + "が入力中…");
  try {
    const { reply } = await api("chat", { persona, history: transcript, company: coForApi() });
    typing.remove();
    if (!timerId) return; // 待っている間に商談を終えた
    transcript.push({ who: "them", text: reply }); addMsg("them", reply);
    talking(true, Math.min(5000, 600 + reply.length * 70));
    status("chat-status", "");
  } catch (e) {
    typing.remove(); status("chat-status", e.message + "（もう一度「送る」で再送できます）", true);
  } finally {
    chatBusy = false; if (timerId) { $("chat-send").disabled = false; $("chat-input").focus(); }
  }
}
async function startChat() {
  lockStart(true); setMode("chat");
  transcript = []; $("transcript").textContent = ""; curIn = curOut = ""; inEl = outEl = null;
  addMsg("sys", persona.company + " " + persona.name + "との商談（チャット）。ゴール：課題を言い直して合意を取る");
  step(3); $("dot").classList.add("live"); $("hangup").disabled = false; status("call-status", "");
  $("chat-input").disabled = false; $("chat-input").value = "";
  startTimer();
  addMsg("sys", "あなたから話しかけてください（例：本日はお時間ありがとうございます。今回どのあたりにご興味を持っていただけたんでしょうか）");
  $("chat-send").disabled = false; $("chat-input").focus();
}
async function sendChat() {
  if (chatBusy || !timerId) return;
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
  return ["【FS商談ロープレ記録】" + persona.company + " " + persona.name + "（" + (mode === "chat" ? "チャット" : "音声") + "）",
    "会社概要：" + persona.brief,
    "相手の役職：" + persona.role + "（決裁権：" + (persona.authority || "") + "）",
    "判定：" + picked + " " + CAT[picked] + "（" + (r.correct ? "正解" : "不正解") + "）／正解：" + r.answer + " " + r.answerLabel,
    "問1 相手の営業の説明：" + ($("overview").value.trim() || "（なし）"),
    "問2 自分の言い直し：" + ($("rephrase").value.trim() || "（なし）"),
    "問3 検算：" + calcLine() + "／こういうやり方なら：" + ($("proposal").value.trim() || "（なし）"),
    "", "■ 会話ログ", ...lines, "", "■ コーチ（AI）の振り返り", r.feedback, r.overviewReview ? "【問1 全体像】" + r.overviewReview : "", r.calcReview ? "【問3 検算】" + r.calcReview : "",
    "", "田村さん、ズレていたと思う行番号とアドバイスをお願いします。"].join("\n");
}
function calcLine() {
  const k = calc(); if (!k) return "（1受注の売上が未入力）";
  return k.plan + " 月" + k.monthly + "万×" + k.months + "ヶ月＋準備費" + k.prep + "万＝投資" + k.invest + "万／" + k.calls + "コール×アポ率" + k.apo_rate + "%×受注率" + k.win_rate + "%→受注" + k.wins + "件×" + k.revenue + "万＝回収" + k.recover + "万 → " + (k.ok ? "成立" : "不成立");
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
  $("c-calls").value = c.calls ?? ""; $("c-apo").value = c.apo_rate ?? ""; $("c-win").value = c.win_rate ?? "";
  $("c-revenue").value = ""; calc();
}
const fmt = n => (Math.round(n * 10) / 10).toLocaleString("ja-JP");
function calc() {
  const c = co(); const pl = (c.plans || [])[Number($("c-plan").value)] || { name: "", monthly: 0 };
  const m = numOr($("c-months").value, 0), prep = numOr($("c-prep").value, 0), calls = numOr($("c-calls").value, 0);
  const apo = numOr($("c-apo").value, 0), win = numOr($("c-win").value, 0), rev = numOr($("c-revenue").value, NaN);
  const invest = m * pl.monthly + prep;
  const apos = m * calls * apo / 100, wins = apos * win / 100;
  const box = $("calc"), body = $("calc-body");
  if (isNaN(rev) || $("c-revenue").value === "") { box.className = "calc"; body.textContent = "投資額 " + fmt(invest) + "万円（" + m + "ヶ月×" + pl.monthly + "万＋" + prep + "万）。1受注の売上を入れると回収額を計算します。"; return null; }
  const recover = wins * rev, ok = recover >= invest;
  const need = rev > 0 ? Math.ceil(invest / rev) : Infinity;
  box.className = "calc " + (ok ? "ok" : "ng");
  body.innerHTML = "";
  const line = (t) => { const d = document.createElement("div"); d.textContent = t; body.appendChild(d); };
  line("投資額：" + m + "ヶ月 × " + pl.monthly + "万 ＋ " + prep + "万 ＝ " + fmt(invest) + "万円");
  line("受注数：" + m + "ヶ月 × " + calls + "コール × " + apo + "% × " + win + "% ＝ アポ" + fmt(apos) + "件 → 受注" + fmt(wins) + "件");
  line("回収額：" + fmt(wins) + "件 × " + rev + "万 ＝ " + fmt(recover) + "万円（回収に必要な受注は " + (isFinite(need) ? need + "件" : "—") + "）");
  const r = document.createElement("div"); r.className = "res";
  r.textContent = ok ? "回収額 ≧ 投資額 → 成立 → フルで提案" : "回収額 ＜ 投資額 → 不成立 → 絞る、または座組みを変える";
  body.appendChild(r);
  return { plan: pl.name, monthly: pl.monthly, months: m, prep, calls, apo_rate: apo, win_rate: win, revenue: rev, invest: Math.round(invest * 10) / 10, wins: Math.round(wins * 10) / 10, recover: Math.round(recover * 10) / 10, ok };
}
["c-plan", "c-months", "c-prep", "c-calls", "c-apo", "c-win", "c-revenue"].forEach(id => $(id).addEventListener("input", calc));
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
    const r = await api("grade", { persona, transcript, picked, rephrase: $("rephrase").value.trim(), mode, overview: $("overview").value.trim(), calc: calc(), proposal: $("proposal").value.trim(), company: coForApi() });
    document.querySelectorAll("#opts .opt").forEach(b => { b.disabled = true; if (b.dataset.k === r.answer) b.classList.add("correct"); else if (b.dataset.k === picked) b.classList.add("wrong"); });
    const v = $("verdict"); v.hidden = false; v.className = "verdict" + (r.correct ? "" : " ng"); v.textContent = "";
    const lab = document.createElement("span"); lab.className = "lab"; lab.textContent = (r.correct ? "正解" : "不正解") + " ／ 答え：" + r.answer + " " + r.answerLabel; v.appendChild(lab);
    v.appendChild(document.createTextNode("相手：" + persona.name + "（" + persona.role + "）決裁権：" + (persona.authority || "") + "\n\n"));
    v.appendChild(document.createTextNode(r.exp + "\n\n言い直しの模範例：" + r.rephrase_example));
    const f = $("feedback"); f.hidden = false; f.textContent = ""; const l2 = document.createElement("span"); l2.className = "lab"; l2.textContent = "COACH"; f.appendChild(l2); f.appendChild(document.createTextNode(r.feedback));
    if (r.overviewReview) f.appendChild(document.createTextNode("\n\n【問1 全体像】" + r.overviewReview));
    if (r.calcReview) f.appendChild(document.createTextNode("\n\n【問3 検算】" + r.calcReview));
    status("grade-status", r.saved ? "この回の気づきを知見に追記しました" : ""); $("again").hidden = false; if (r.saved) loadKnow();
    showRecord(r);
  } catch (e) { status("grade-status", e.message, true); $("grade").disabled = false; }
});
$("again").addEventListener("click", () => { $("record").hidden = true; $("co").hidden = false; step(1); lockStart(false); window.scrollTo(0, 0); });
