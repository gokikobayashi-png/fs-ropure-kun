// シナリオ企業のカードに出すイラスト（自作のSVG。画像ファイルを読み込まないので軽い）。
// カテゴリーと事業内容の言葉から、近い絵を1つ選ぶ。
const SKIN = "#F4C9A8", HAIR = "#4A3728";
const person = (x, y, s, body, extra = "") => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-20 44c0-14 9-22 20-22s20 8 20 22z" fill="${body}"/><circle cx="0" cy="6" r="13" fill="${SKIN}"/>${extra}</g>`;
const face = `<circle cx="-4.5" cy="7" r="1.5" fill="#3B2A20"/><circle cx="4.5" cy="7" r="1.5" fill="#3B2A20"/><path d="M-4 12.5q4 3 8 0" fill="none" stroke="#B5694A" stroke-width="1.6" stroke-linecap="round"/>`;
const helmet = c => `<path d="M-15 3a15 14 0 0 1 30 0z" fill="${c}"/><rect x="-17.5" y="1.5" width="35" height="4.5" rx="2.2" fill="${c}"/><rect x="-2.2" y="-11" width="4.4" height="13" rx="2" fill="#fff" opacity=".55"/>`;
const hair = `<path d="M-13 4c-1-11 6-15 13-15s14 4 13 15c-3-6-7-8-13-8s-10 2-13 8z" fill="${HAIR}"/>`;
const spark = (x, y, c = "#38BDF8") => `<g transform="translate(${x} ${y})" stroke="${c}" stroke-width="2" stroke-linecap="round"><path d="M0-9V9M-9 0H9M-6.4-6.4 6.4 6.4M-6.4 6.4 6.4-6.4"/><circle r="3" fill="#fff" stroke="none"/></g>`;

const ART = {
  // 製造業：ヘルメットの作業者と溶接の火花、奥に工場
  factory: ["#E6F4F1", `<path d="M6 80V52l14 8V52l14 8V52l14 8V40h10v40z" fill="#C9DEDA"/><rect x="50" y="26" width="8" height="16" fill="#B5CFCA"/><circle cx="56" cy="20" r="4" fill="#D9E8E5"/><circle cx="62" cy="14" r="5" fill="#E3EFED"/>${person(40, 44, 1.05, "#5FB3A8", face + helmet("#F5C518"))}<path d="M56 78l14-8" stroke="#64748B" stroke-width="3" stroke-linecap="round"/>${spark(76, 66)}`],
  // 現場：ヘルメットの作業者とタブレット
  field: ["#FFF4D6", `<path d="M0 84h96" stroke="#E7D29A" stroke-width="3"/><path d="M68 84V46l-8 4v34z" fill="#F0DFAE"/><path d="M82 84V38l-10 5v41z" fill="#E7D29A"/>${person(42, 44, 1.05, "#F28C38", face + helmet("#FFFFFF") + `<path d="M-20 34h40" stroke="#FDE68A" stroke-width="4"/>`)}<rect x="52" y="62" width="20" height="15" rx="2.5" fill="#1E293B"/><rect x="54.5" y="64.5" width="15" height="10" rx="1" fill="#7DD3FC"/><path d="M57 72l3-3 3 2 4-5" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`],
  // 物流：トラック
  truck: ["#E3F0FF", `<path d="M0 76h96" stroke="#BFD6F2" stroke-width="3"/><rect x="10" y="38" width="46" height="30" rx="3" fill="#3B82F6"/><path d="M14 46h38M14 54h38" stroke="#93C5FD" stroke-width="2"/><path d="M56 48h16l12 12v8H56z" fill="#F59E0B"/><path d="M61 52h9l8 8H61z" fill="#DBEAFE"/><circle cx="26" cy="70" r="7.5" fill="#1E293B"/><circle cx="26" cy="70" r="3" fill="#CBD5E1"/><circle cx="70" cy="70" r="7.5" fill="#1E293B"/><circle cx="70" cy="70" r="3" fill="#CBD5E1"/><path d="M12 24h18M6 30h14" stroke="#BFD6F2" stroke-width="3" stroke-linecap="round"/>`],
  // 建設：クレーンと建物
  build: ["#FFEFE2", `<path d="M0 84h96" stroke="#F3CDAE" stroke-width="3"/><rect x="46" y="44" width="34" height="40" fill="#94A3B8"/><g fill="#E2E8F0"><rect x="51" y="50" width="7" height="7"/><rect x="62" y="50" width="7" height="7"/><rect x="51" y="62" width="7" height="7"/><rect x="62" y="62" width="7" height="7"/></g><path d="M22 84V20M22 20h44M22 20l-10 10M22 32l12-12M22 44l8-8-8-8" fill="none" stroke="#F59E0B" stroke-width="3.2" stroke-linejoin="round"/><path d="M58 20v14" stroke="#64748B" stroke-width="1.8"/><rect x="53" y="34" width="10" height="7" rx="1" fill="#EF4444"/><rect x="14" y="78" width="16" height="6" fill="#B45309"/>`],
  // 人事・人材：3人
  people: ["#F3E8FF", `${person(22, 46, .8, "#A78BFA", hair + face)}${person(74, 46, .8, "#F472B6", `<path d="M-14 8c-2-14 6-19 14-19s16 5 14 19c-2-7-6-11-14-11s-12 4-14 11z" fill="#7A4A2B"/>` + face)}${person(48, 40, 1.02, "#6366F1", hair + face)}`],
  // 営業・マーケ：右肩上がりのグラフ
  sales: ["#E8F7EE", `<path d="M12 80h74" stroke="#9BD3B0" stroke-width="3" stroke-linecap="round"/><rect x="18" y="58" width="12" height="22" rx="2" fill="#86EFAC"/><rect x="36" y="48" width="12" height="32" rx="2" fill="#4ADE80"/><rect x="54" y="38" width="12" height="42" rx="2" fill="#22C55E"/><rect x="72" y="26" width="12" height="54" rx="2" fill="#16A34A"/><path d="M14 46l20-12 16 6 30-22" fill="none" stroke="#F59E0B" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M70 16h12v12" fill="none" stroke="#F59E0B" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`],
  // IT・SaaS：ノートPCとクラウド
  cloud: ["#E0F5F7", `<path d="M30 40a12 12 0 0 1 23-4 9 9 0 0 1 15 6 8 8 0 0 1-2 16H32a9 9 0 0 1-2-18z" fill="#fff"/><path d="M48 46v-14M42 37l6-6 6 6" fill="none" stroke="#05AABA" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="24" y="56" width="48" height="24" rx="3" fill="#1A3A5C"/><rect x="28" y="60" width="40" height="16" rx="1.5" fill="#7DD3FC"/><path d="M33 71l6-5 5 3 8-7 8 5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 82h64l-3 5H19z" fill="#94A3B8"/>`],
  // 医療・介護
  medical: ["#FFE8EC", `<rect x="22" y="24" width="52" height="56" rx="8" fill="#fff"/><path d="M42 36h12v12h12v12H54v12H42V60H30V48h12z" fill="#EF4444"/><path d="M70 70c-4-5-10-2-8 3 1 3 5 6 8 8 3-2 7-5 8-8 2-5-4-8-8-3z" fill="#FB7185"/>`],
  // 小売・飲食：店
  shop: ["#FFF1E0", `<path d="M0 84h96" stroke="#F2D5A8" stroke-width="3"/><rect x="18" y="44" width="60" height="40" fill="#FDE9C8"/><path d="M14 30h68l4 14a8.5 8.5 0 0 1-17 0 8.5 8.5 0 0 1-17 0 8.5 8.5 0 0 1-17 0 8.5 8.5 0 0 1-17 0 8.5 8.5 0 0 1-8 0z" fill="#EF4444"/><path d="M31 30l-3 14M48 30v14M65 30l3 14" stroke="#fff" stroke-width="5"/><rect x="26" y="58" width="18" height="26" rx="1.5" fill="#92400E"/><circle cx="40" cy="72" r="1.5" fill="#FDE68A"/><rect x="50" y="58" width="22" height="14" rx="1.5" fill="#BAE6FD"/>`],
  // 金融・保険
  money: ["#FFF7D6", `<g fill="#F59E0B" stroke="#D97706" stroke-width="1.5"><ellipse cx="34" cy="76" rx="18" ry="6"/><ellipse cx="34" cy="68" rx="18" ry="6"/><ellipse cx="34" cy="60" rx="18" ry="6"/></g><circle cx="62" cy="44" r="20" fill="#FBBF24" stroke="#D97706" stroke-width="2"/><path d="M54 34l8 11 8-11M62 45v12M55 47h14M55 52h14" fill="none" stroke="#92400E" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`],
  // 不動産
  house: ["#E8F3E4", `<path d="M0 84h96" stroke="#BFDDB5" stroke-width="3"/><path d="M12 54l24-22 24 22z" fill="#EF4444"/><rect x="18" y="54" width="36" height="30" fill="#FEF3C7"/><rect x="30" y="64" width="12" height="20" fill="#92400E"/><rect x="62" y="34" width="22" height="50" fill="#94A3B8"/><g fill="#E2E8F0"><rect x="66" y="40" width="5" height="6"/><rect x="75" y="40" width="5" height="6"/><rect x="66" y="52" width="5" height="6"/><rect x="75" y="52" width="5" height="6"/><rect x="66" y="64" width="5" height="6"/><rect x="75" y="64" width="5" height="6"/></g>`],
  // 教育・研修
  book: ["#E7ECFF", `<path d="M48 40c-10-8-24-8-34-4v38c10-4 24-4 34 4z" fill="#fff" stroke="#6366F1" stroke-width="2.5" stroke-linejoin="round"/><path d="M48 40c10-8 24-8 34-4v38c-10-4-24-4-34 4z" fill="#fff" stroke="#6366F1" stroke-width="2.5" stroke-linejoin="round"/><path d="M22 48c6-2 13-2 19 1M22 57c6-2 13-2 19 1M55 49c6-3 13-3 19-1M55 58c6-3 13-3 19-1" fill="none" stroke="#C7D2FE" stroke-width="2.5" stroke-linecap="round"/><path d="M48 12l22 9-22 9-22-9z" fill="#1E293B"/><path d="M66 23v10" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round"/>`],
  // その他：オフィスビル
  office: ["#E9EEF5", `<path d="M0 84h96" stroke="#C5D1E0" stroke-width="3"/><rect x="28" y="20" width="36" height="64" rx="2" fill="#1A3A5C"/><g fill="#7DD3FC"><rect x="34" y="27" width="7" height="8"/><rect x="45" y="27" width="7" height="8"/><rect x="56" y="27" width="4" height="8"/><rect x="34" y="41" width="7" height="8"/><rect x="45" y="41" width="7" height="8"/><rect x="56" y="41" width="4" height="8"/><rect x="34" y="55" width="7" height="8"/><rect x="45" y="55" width="7" height="8"/><rect x="56" y="55" width="4" height="8"/></g><rect x="41" y="70" width="10" height="14" fill="#F8FAFC"/><rect x="74" y="66" width="4" height="18" fill="#92400E"/><circle cx="76" cy="60" r="10" fill="#4ADE80"/><circle cx="16" cy="70" r="8" fill="#86EFAC"/><rect x="14.5" y="74" width="3" height="10" fill="#92400E"/>`],
};

// 上から順に当てはまったものを使う（カテゴリーを先に見て、無ければ事業内容・商材を見る）
const RULES = [
  ["truck", /物流|運送|配送|倉庫|運輸|ロジ|輸送|配車/],
  ["build", /建設|建築|土木|ゼネコン|工務店|施工|設備工事|リフォーム/],
  ["field", /現場|フィールド|保守|点検|メンテ|施設管理|警備|清掃/],
  ["factory", /製造|工場|メーカー|生産|加工|部品|機械|金属|溶接|カイゼン|IoT/i],
  ["medical", /医療|病院|クリニック|介護|福祉|看護|薬局|ヘルスケア|歯科/],
  ["people", /人事|労務|採用|人材|HR|派遣|求人|組織|研修(?!施設)/i],
  ["book", /教育|学校|塾|スクール|学習|eラーニング|研修/i],
  ["money", /金融|銀行|保険|証券|決済|会計|経理|請求|ファイナンス|フィンテック/],
  ["house", /不動産|住宅|賃貸|マンション|ビル管理/],
  ["shop", /小売|店舗|飲食|外食|EC|通販|アパレル|食品|宿泊|ホテル/i],
  ["sales", /営業|マーケ|広告|集客|販促|セールス|CRM|SFA|リード/i],
  ["cloud", /SaaS|クラウド|ソフトウェア|システム|アプリ|IT|DX|AI|データ/i],
];
export function scenarioArtKey(item) {
  const cat = String((item && item.category) || ""), pf = (item && item.profile) || {};
  const rest = [pf.business, pf.product, pf.target].join(" ");
  for (const text of [cat, rest]) for (const [key, re] of RULES) if (re.test(text)) return key;
  return "office";
}
export function scenarioArt(item) {
  const [bg, body] = ART[scenarioArtKey(item)] || ART.office;
  return `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet"><rect width="96" height="96" fill="${bg}"/>${body}</svg>`;
}
export const SCENARIO_ART_BG = Object.fromEntries(Object.entries(ART).map(([k, v]) => [k, v[0]]));
