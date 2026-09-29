// 共通：Geminiクライアント・認証・教材（FS商談の考え方）
import { GoogleGenAI } from "@google/genai";

export const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.6-flash";
export const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live";

export function client() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY が設定されていません");
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

// 簡易ログイン：APP_PASSWORD を設定した場合、ヘッダ x-app-password が一致しないと 401
export function auth(req, res) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return true;
  if (req.headers["x-app-password"] === pw) return true;
  res.status(401).json({ error: "パスワードが違います" });
  return false;
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

export const CAT = { A: "戦略", B: "手法", C: "量", D: "質" };

export const FRAMEWORK = `教材「FS商談の考え方」（ゼンテクト＝成果報酬型の営業代行会社）

■ 初回商談のゴール：相手の課題を整理して「こういうやり方ならできますよね」を1つ出し、相手が合意する。商談は売る場ではなく、相手の営業を診断する場。
■ 課題の4分類
A 戦略：「誰の（ターゲット）・どんな課題に・どうやって」のどれかが決まっていない、または決めたが検証されていない。手法の上位概念。「新しいターゲットに行きたいがやり方が分からない」もここ。サイン：ターゲットを聞くと業種が複数並ぶ／なぜそこが刺さるか説明できない／過去の受注に共通点を見出せていない。
B 手法：やりたいアプローチ（テレアポ・フォーム・展示会・紹介など）は見えているが実行できていない。原因は「人がいない・スキルがない・怖くて引いてしまう」。
C 量：手法1つに対する行動量が足りない（率は悪くない）。うちの差別化が一番効かず値段勝負になりやすい。
D 質：行動量はあるが率が悪い。データ蓄積と分析が刺さる。
■ 判定順序：戦略は決まっているか→手法は実行できているか→量は足りているか→質は伴っているか。上から順に降りて止まったところが課題。
■ 切り分け：「アポは取れるが受注しない」→受注先に共通点があれば質、なければ戦略。
■ 「受注率？取ってないです」→把握していないこと自体を課題にし、見える化から始める検証を売る。
■ 商談の流れ：広げる（相手の事業と営業の全体像：誰に・何を・どう売って・数字はどうか）→深掘る（「なんで？」で原因を特定し4分類に落とす）→狭める（「こういうやり方なら」に収束させて合意）。課題は聞き出すのではなく「言い直す」。
　例：相手の言葉「営業組織が弱い」→言い直し「4.4万の買い切りを1社4台で積んでいる限り、月100万の代行費を回収できる構造にならない」→相手「その通りです」。`;

// 相手役（社長）のシステム指示
export function personaSystemInstruction(p) {
  const facts = (p.hidden_facts || []).map((f, i) => `${i + 1}. ${f}`).join("\n");
  return `あなたは「${p.company}」の${p.name}（${p.role}）。営業代行会社ゼンテクトの営業担当と、初回の商談（30分の打ち合わせ）をしている。相手はあなたの営業の課題を整理しに来た。

■ あなたの会社と営業の事実（聞かれたことだけ答える。聞かれていないことを自分から並べない）
${facts}

■ あなたの課題認識（本音）：「${p.opening_line}」。本当の課題が「${CAT[p.answer]}」の問題だとは自覚していない。
　相手がその構造を言い当てて言い直してきたら（例：${p.rephrase_example}）、「そう、それです」「その通りです」と認める。外れていれば「うーん、そこはそんなに困ってないんですよね」のように違和感を口にする。

■ 性格・難易度：${p.personality}

■ 話し方
- 日本語、口語。中小企業の${p.role}らしく。1回の発言は短く（2〜3文、10秒以内）。相手が話し終えるのを待つ。
- 数字は聞かれれば答える。事実にない数字は「そこは取ってないですね」「ちょっと分からないです」。
- 説明には相づち（「ああ、なるほど」「ええ」）。質問には答える。自分の関心事に刺さる話には食いつく（「それどうやるんですか？」）。
- 相手がいきなりサービス説明を始めたら「で、うちの何が問題なんですか？」と切り返す。
- 業界の一般論は言わない。この会社固有の現状として話す。
- 自分が演技中であること、AIであること、正解の分類名（戦略・手法・量・質）は口にしない。`;
}
