// 相手役のイラスト（SVG）。ペルソナ（会社名・名前・性別・年齢）から毎回同じ顔を決める。
// 外部の画像生成は使わない（無料・一瞬・オフラインでも出る）。
// setTalking(true) の間だけ口が動く。

function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

const SKIN = ["#F6D7BE", "#EFC9A8", "#E8BD98", "#F3CFB0"];
const BG = ["#E1EFE8", "#E8F0F8", "#F4EBDD", "#EDE7F3", "#F8E6E3"];
const SUIT = ["#26324A", "#2F3136", "#4A4F57", "#3B3A36", "#1F3B4D"];
const TIE = ["#8C2F39", "#1F4E79", "#556B2F", "#6B4E9B", "#B5893C"];
const BLOUSE = ["#FFFFFF", "#F1E6D8", "#DDE8F2", "#EBDDE6"];

export function guessAge(role = "") {
  if (/社長|取締役/.test(role)) return 55;
  if (/部長|事業部長/.test(role)) return 48;
  if (/課長|マーケ/.test(role)) return 40;
  return 33;
}

export function avatarSvg(p) {
  const r = seeded((p.company || "") + "|" + (p.name || ""));
  const female = p.gender === "female";
  const age = Number(p.age) || guessAge(p.role);
  const skin = pick(r, SKIN), bg = pick(r, BG);
  const hairColor = age >= 58 ? pick(r, ["#9A9A9A", "#B8B8B8", "#7E7E7E"]) : age >= 50 ? pick(r, ["#4A4A4A", "#5C5C5C", "#2B2522"]) : pick(r, ["#2B2522", "#3A2C24", "#1E1B1A", "#4B3427"]);
  const glasses = r() < (age >= 45 ? 0.55 : 0.3);
  const casual = /マーケ|新規事業|インサイド/.test(p.role || "") && r() < 0.6;
  const suit = pick(r, SUIT);
  const ink = "#3A2E2A";

  // 体（肩・服）
  let body = `<path d="M30 200 Q32 152 72 142 L128 142 Q168 152 170 200 Z" fill="${casual ? pick(r, ["#5B6B7A", "#7A6A5B", "#3F5E5A"]) : suit}"/>`;
  if (female) {
    body += `<path d="M84 142 L100 172 L116 142 Z" fill="${pick(r, BLOUSE)}"/>`;
  } else if (casual) {
    body += `<path d="M86 142 L100 160 L114 142 Z" fill="#FFFFFF"/>`;
  } else {
    body += `<path d="M84 142 L100 176 L116 142 Z" fill="#FFFFFF"/><path d="M96 148 L104 148 L106 176 L100 186 L94 176 Z" fill="${pick(r, TIE)}"/>`;
  }
  const neck = `<rect x="88" y="120" width="24" height="26" rx="8" fill="${skin}"/>`;

  // 髪（後ろ／前）
  let back = "", front = "";
  if (female) {
    const style = pick(r, ["bob", "long", "bun"]);
    if (style === "bob") back = `<path d="M56 104 Q50 40 100 40 Q150 40 144 104 L146 130 Q132 138 126 122 L74 122 Q68 138 54 130 Z" fill="${hairColor}"/>`;
    if (style === "long") back = `<path d="M54 110 Q48 38 100 38 Q152 38 146 110 L150 170 Q128 176 124 150 L76 150 Q72 176 50 170 Z" fill="${hairColor}"/>`;
    if (style === "bun") back = `<circle cx="100" cy="40" r="17" fill="${hairColor}"/>`;
    front = `<path d="M60 98 Q56 48 100 48 Q144 48 140 98 Q132 70 112 64 Q96 78 70 80 Q64 86 60 98 Z" fill="${hairColor}"/>`;
  } else {
    const style = age >= 55 ? pick(r, ["receding", "short", "side"]) : pick(r, ["short", "side", "crop"]);
    if (style === "short") front = `<path d="M60 96 Q56 46 100 46 Q144 46 140 96 Q136 70 100 66 Q64 70 60 96 Z" fill="${hairColor}"/>`;
    if (style === "side") front = `<path d="M60 96 Q56 46 100 46 Q144 46 140 96 Q138 72 126 64 Q104 74 72 70 Q62 78 60 96 Z" fill="${hairColor}"/>`;
    if (style === "crop") front = `<path d="M61 92 Q60 52 100 52 Q140 52 139 92 Q134 72 100 70 Q66 72 61 92 Z" fill="${hairColor}"/>`;
    if (style === "receding") front = `<path d="M60 102 Q56 72 70 60 Q66 80 68 98 Z M140 102 Q144 72 130 60 Q134 80 132 98 Z" fill="${hairColor}"/><path d="M78 56 Q100 50 122 56" stroke="${hairColor}" stroke-width="3" fill="none" opacity=".6"/>`;
  }

  // 顔
  const face = `<ellipse cx="62" cy="98" rx="7" ry="10" fill="${skin}"/><ellipse cx="138" cy="98" rx="7" ry="10" fill="${skin}"/>
    <ellipse cx="100" cy="92" rx="38" ry="44" fill="${skin}"/>`;
  const browY = 82 + (r() < 0.5 ? 0 : 1);
  const eyes = `<path d="M78 ${browY} Q86 ${browY - 3} 93 ${browY}" stroke="${ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M107 ${browY} Q114 ${browY - 3} 122 ${browY}" stroke="${ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <ellipse cx="86" cy="94" rx="3.6" ry="4.2" fill="${ink}"/><ellipse cx="114" cy="94" rx="3.6" ry="4.2" fill="${ink}"/>`;
  const wrinkles = age >= 50 ? `<path d="M74 98 l-4 2 M126 98 l4 2" stroke="${ink}" stroke-width="1.2" opacity=".35" stroke-linecap="round"/>` : "";
  const nose = `<path d="M100 98 Q97 108 101 110" stroke="#C99A7A" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  const glassesSvg = glasses ? `<g fill="none" stroke="#2E2E2E" stroke-width="2.2"><rect x="74" y="86" width="24" height="17" rx="6"/><rect x="102" y="86" width="24" height="17" rx="6"/><path d="M98 93 L102 93"/></g>` : "";
  const cheeks = female ? `<ellipse cx="78" cy="108" rx="6" ry="3" fill="#E9A1A1" opacity=".35"/><ellipse cx="122" cy="108" rx="6" ry="3" fill="#E9A1A1" opacity=".35"/>` : "";
  const lip = female ? "#B85C5C" : "#8E5A4A";
  const mouth = `<path class="m-closed" d="M91 118 Q100 122 109 118" stroke="${lip}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <ellipse class="m-open" cx="100" cy="119" rx="7" ry="5" fill="#6B2E2E"/>`;

  return `<svg viewBox="0 0 200 200" role="img" aria-label="${(p.name || "相手").replace(/"/g, "")}のイラスト" xmlns="http://www.w3.org/2000/svg">
    <circle cx="100" cy="100" r="100" fill="${bg}"/>
    <clipPath id="avclip"><circle cx="100" cy="100" r="100"/></clipPath>
    <g clip-path="url(#avclip)">${back}${body}${neck}${face}${front}${wrinkles}${eyes}${glassesSvg}${nose}${cheeks}${mouth}</g>
  </svg>`;
}

// 用意したイラスト（public/faces）。性別と年齢が近いものから選ぶ。合うものが無ければSVGの絵を使う
const FACES = [
  { f: "m25_work", g: "male", age: 26 }, { f: "m25_suit", g: "male", age: 27 },
  { f: "m30_hoodie", g: "male", age: 34 },
  { f: "m45_ceo", g: "male", age: 48 }, { f: "m45_glasses", g: "male", age: 46 },
  { f: "m55_cap", g: "male", age: 58 }, { f: "m55_suit", g: "male", age: 57 },
  { f: "f30_beige", g: "female", age: 30 }, { f: "f30_bob", g: "female", age: 29 },
  { f: "f45_glasses", g: "female", age: 47 },
];
export function pickFace(p) {
  const g = p.gender === "female" ? "female" : "male";
  const age = Number(p.age) || guessAge(p.role);
  const list = FACES.filter(x => x.g === g);
  if (!list.length) return null;
  const best = Math.min(...list.map(x => Math.abs(x.age - age)));
  const near = list.filter(x => Math.abs(x.age - age) <= best + 6);
  const r = seeded((p.company || "") + "|" + (p.name || ""));
  return pick(r, near).f;
}

export function renderAvatar(el, p) {
  const f = pickFace(p);
  if (!f) { el.innerHTML = avatarSvg(p); return; }
  const img = new Image();
  img.alt = (p.name || "相手") + "のイラスト"; img.src = "/faces/" + f + ".jpg";
  img.onerror = () => { el.innerHTML = avatarSvg(p); };
  el.textContent = ""; el.appendChild(img);
}
