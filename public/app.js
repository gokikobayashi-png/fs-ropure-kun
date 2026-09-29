import { GoogleGenAI } from "https://esm.sh/@google/genai";

const $ = id => document.getElementById(id);
const CAT = { A: "戦略", B: "手法", C: "量", D: "質" };
let persona = null, session = null, transcript = [], picked = null;
let micCtx = null, micStream = null, micNode = null, playCtx = null, nextPlay = 0, sources = [];
let timerId = null, startedAt = 0, curIn = "", curOut = "", inEl = null, outEl = null;

/* ---------- 認証（共有パスワード） ---------- */
function pw() { try { return sessionStorage.getItem("pw") || ""; } catch (_) { return ""; } }
async function api(path, body) {
  const r = await fetch("/api/" + path, { method: "POST", headers: { "content-type": "application/json", "x-app-password": pw() }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { showLogin(); throw new Error(j.error || "ログインが必要"); }
  if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
  return j;
}
function showLogin() { $("login").hidden = false; $("step1").hidden = true; }
$("pw-ok").addEventListener("click", () => { try { sessionStorage.setItem("pw", $("pw").value.trim()); } catch (_) {} $("login").hidden = true; $("step1").hidden = false; $("logout").hidden = false; loadKnow(); });
$("logout").addEventListener("click", () => { try { sessionStorage.removeItem("pw"); } catch (_) {} location.reload(); });
if (pw()) $("logout").hidden = false;


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
    const j = await api("knowledge", { text, title: $("know-title").value.trim() });
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
  $("gen").disabled = true; $("regen").disabled = true; status("gen-status", "相手を用意しています（10〜20秒）…");
  try {
    persona = await api("persona", { industry: $("industry").value.trim(), product: $("product").value.trim(), size: $("size").value.trim(), difficulty: $("difficulty").value });
    $("p-company").textContent = persona.company;
    $("p-brief").textContent = persona.brief;
    $("p-name").textContent = persona.name;
    $("p-opening").textContent = persona.opening_line;
    status("gen-status", ""); status("call-status", "");
    step(2);
  } catch (e) { status("gen-status", e.message, true); }
  finally { $("gen").disabled = false; $("regen").disabled = false; }
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
  sources.push(src); src.onended = () => { sources = sources.filter(s => s !== src); };
}
function stopPlayback() { sources.forEach(s => { try { s.stop(); } catch (_) {} }); sources = []; nextPlay = 0; }

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

async function startCall() {
  $("call").disabled = true; $("regen").disabled = true; status("call-status", "マイクの許可 → 接続中…");
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const { token, model, config } = await api("token", { persona });

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
    startedAt = Date.now(); timerId = setInterval(() => { const s = Math.floor((Date.now() - startedAt) / 1000); $("timer").textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }, 500);

    // 相手から話し始めさせる
    session.sendClientContent({ turns: [{ role: "user", parts: [{ text: "（商談が始まった。営業担当が着席した。あなたから「本日はよろしくお願いします」と軽く挨拶し、続けて自分の課題認識をひとことで話して、相手の出方を待つ）" }] }], turnComplete: true });
  } catch (e) {
    status("call-status", "開始できませんでした：" + (e.message || e), true); cleanupAudio();
    $("call").disabled = false; $("regen").disabled = false;
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
  if (note) addMsg("sys", note);
  picked = null; document.querySelectorAll("#opts .opt").forEach(b => { b.setAttribute("aria-pressed", "false"); b.classList.remove("correct", "wrong"); b.disabled = false; });
  $("rephrase").value = ""; $("verdict").hidden = true; $("feedback").hidden = true; $("again").hidden = true; $("grade").disabled = false; status("grade-status", "");
  $("step3").hidden = false; step(4); $("step3").hidden = false;
}
$("call").addEventListener("click", startCall);
$("hangup").addEventListener("click", () => endCall("商談終了 " + $("timer").textContent));

/* ---------- ④ 判定 ---------- */
document.querySelectorAll("#opts .opt").forEach(b => b.addEventListener("click", () => {
  if (b.disabled) return;
  document.querySelectorAll("#opts .opt").forEach(x => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); picked = b.dataset.k;
}));
$("grade").addEventListener("click", async () => {
  if (!picked) { status("grade-status", "A〜Dを選んでから", true); return; }
  $("grade").disabled = true; status("grade-status", "コーチが会話を振り返っています…");
  try {
    const r = await api("grade", { persona, transcript, picked, rephrase: $("rephrase").value.trim() });
    document.querySelectorAll("#opts .opt").forEach(b => { b.disabled = true; if (b.dataset.k === r.answer) b.classList.add("correct"); else if (b.dataset.k === picked) b.classList.add("wrong"); });
    const v = $("verdict"); v.hidden = false; v.className = "verdict" + (r.correct ? "" : " ng"); v.textContent = "";
    const lab = document.createElement("span"); lab.className = "lab"; lab.textContent = (r.correct ? "正解" : "不正解") + " ／ 答え：" + r.answer + " " + r.answerLabel; v.appendChild(lab);
    v.appendChild(document.createTextNode(r.exp + "\n\n言い直しの模範例：" + r.rephrase_example));
    const f = $("feedback"); f.hidden = false; f.textContent = ""; const l2 = document.createElement("span"); l2.className = "lab"; l2.textContent = "COACH"; f.appendChild(l2); f.appendChild(document.createTextNode(r.feedback));
    status("grade-status", r.saved ? "この回の気づきを知見に追記しました" : ""); $("again").hidden = false; if (r.saved) loadKnow();
  } catch (e) { status("grade-status", e.message, true); $("grade").disabled = false; }
});
$("again").addEventListener("click", () => { step(1); $("call").disabled = false; $("regen").disabled = false; window.scrollTo(0, 0); });
