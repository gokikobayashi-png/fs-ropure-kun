// 共通：Geminiクライアント・認証・教材（FS商談の考え方）・ゼンテクト商材・Notion知見
import { GoogleGenAI } from "@google/genai";

export const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.6-flash";
export const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live";

export function client() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY が設定されていません");
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

// メンバー（ID＝メールアドレス、パスワードは全員共通）。MEMBERS_JSON で上書きできる
export const MEMBERS = (() => {
  try { if (process.env.MEMBERS_JSON) return JSON.parse(process.env.MEMBERS_JSON); } catch (_) {}
  return [
    { email: "goki.kobayashi@zentect.com", name: "小林 剛己", short: "小林", admin: true },
    { email: "kei.tamura@zentect.com", name: "田村", short: "田村" },
    { email: "yukihiro.kamioka@zentect.com", name: "上岡", short: "上岡" },
    { email: "shinichiro.miyatake@zentect.com", name: "宮武", short: "宮武" },
  ];
})();
export function findMember(email) {
  const e = String(email || "").trim().toLowerCase();
  return MEMBERS.find(m => m.email.toLowerCase() === e) || null;
}
// 簡易ログイン：APP_PASSWORD（共通）＋ x-app-user（メンバーのメール）。
// APP_PASSWORD 未設定のときはパスワード確認なし。x-app-user が無い旧クライアントは管理者扱いにせず匿名で通す。
export function auth(req, res) {
  const pw = process.env.APP_PASSWORD;
  if (pw && req.headers["x-app-password"] !== pw) { res.status(401).json({ error: "パスワードが違います" }); return false; }
  const email = req.headers["x-app-user"];
  if (email) {
    const m = findMember(email);
    if (!m) { res.status(401).json({ error: "このメールアドレスは登録されていません" }); return false; }
    req.user = m;
  }
  return true;
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

// テキスト生成：既定モデルが混雑（503/429）のときは順に別モデルへ逃がす
const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"];
export async function generate(ai, params) {
  const models = [TEXT_MODEL, ...FALLBACK_MODELS.filter(m => m !== TEXT_MODEL)];
  let last;
  for (const model of models) {
    try {
      return await ai.models.generateContent({ ...params, model });
    } catch (e) {
      last = e;
      const s = String(e.message || e);
      if (!/503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded/i.test(s)) throw e;
    }
  }
  throw last;
}

export const CAT = { A: "戦略", B: "手法", C: "量", D: "質" };

/* =========================================================
   教材「FS商談の考え方」
   ========================================================= */
export const FRAMEWORK = `教材「FS商談の考え方」（ゼンテクトのFS＝初回商談の進め方）

■ 0. 終着点
商談のゴールは、相手の課題を整理して「こういうやり方ならできますよね」を1つ出し、相手が合意すること。次回提案はその合意を提案書の形にしたものにすぎない。商談は「売る場」ではなく「相手の営業を診断する場」。診断に相手が納得したら提案する権利がもらえる。
商談中に自分がどこにいるかは3つの問いで分かる：①相手の営業の全体像（誰に・何を・どう売って・数字はどうか）は掴めたか ②課題を「戦略／手法／量／質」のどれかに落とし、相手より一段深い言葉で言い直せたか ③「こういうやり方ならできますよね」に相手が頷いたか。

■ 1. 広げる／深掘る／狭める
広げる＝相手の事業と営業の全体像を掴む（課題を探しに行かない。全体像が見えれば課題は浮く）。深掘る＝広げる側の最後に、浮いた課題を4分類に落とすための「なぜ」。狭める＝「こういうやり方ならできますよね」に収束させて合意を取る。
課題は「聞き出す」のではなく「言い直す」。FSの相手は「営業が弱い」「伸びない」としか言えないから商談に来ている。全体像から「こういう構造で詰まっていますよね」と言い直して「そう、それ」と言わせる。
実例（アクティブ・ブレインズ）：相手の言葉「営業組織が弱い」→言い直し「4.4万の買い切りを1社4台で積んでいる限り、月100万の代行費を回収できる構造にならない。1発の台数を増やすか、社数を上げるかしか無い」→相手「その通りです」。

■ 2. 思考の順番（ゼンテクトは最後）
①相手の事業とお金の流れ（誰に売って、どこで利益が出るか。単価・課金形態）→②営業の構造（体制・商談ソース・販路・月の商談数・受注率）→③課題はどこか（4分類。仮説でよい）→④うちなら何ができるか（最後）。「ゼンテクトで解ける課題」から考えると戦略の課題が見えなくなり、提案が「コールします」に寄って値段勝負になる。

■ 3. 押さえる5項目（目的は「4分類の判定」と「採算の検算」。済んだらヒアリングは終わっていい）
1 相手は誰で、どんなミッションか（役割・経歴・決裁権・なぜ今来たか）→動く理由とクロージングの形
2 事業・ターゲット・手法・営業戦略（体制、商談ソース、販路、数字）→全体像。4分類と検算の材料
3 課題は 戦略／手法／量／質 のどれか→提案の中身と大きさ
4 解決するやり方は何か（うちが実行する前提で）→「こういうやり方なら」の中身
5 それに無理はないか（採算）→相手がうちに払って回収できるか。無理なら絞る
1・2が広げる、3が深掘る、4・5が狭める。

■ 4. 課題の4分類（上から順に降りる一本道。止まったところが課題）
1 戦略は決まっているか（誰に・何を・どうやって、が言えるか。検証済みか）→Noなら戦略
2 手法は実行できているか（やりたいアプローチが動いているか）→Noなら手法
3 量は足りているか（行動量が目標に届いているか）→Noなら量
4 質は伴っているか（率が基準を超えているか）→Noなら質
相手が「量が足りない」と言っていても、戦略が決まっていなければ量を増やしても失敗する。
A 戦略：「誰の・どんな課題に・どうやって」のどれかが未決、または決めたが未検証。「新しいターゲットに行きたいがやり方が分からない」もここ。サイン：ターゲットを聞くと業種が複数並ぶ／なぜそこが刺さるか説明できない／過去の受注に共通点がない。うちが売るもの：セグメントを切って短いスパンで検証を回す仕組み。
B 手法：戦略はあり、やりたいアプローチも見えているが実行できていない（人・スキル・怖くて引く）。サイン：「やりたいが手が回らない」／門前払いで引いてしまう／営業がエンジニア出身。売るもの：実行部隊（IS／FS）。
C 量：手法は動いているが、手法1つに対する行動量が足りない。サイン：コール数・商談数が目標に対して明らかに少ない、率は悪くない。売るもの：稼働の上乗せ。差別化が一番効かず値段勝負になりやすい。
D 質：手法は動いて量もあるが率が悪い。サイン：アポ率・受注率が基準を下回る／断られる理由が分からない／リストやトークが放置。売るもの：全活動をデータで蓄積し、断り理由と受注要因を分析してリスト・スクリプト・ターゲットに戻す。
境目で迷うケース：「アポは取れるが受注しない」→受注先に共通点があればFSの質、なければ戦略／「量が足りないと言うが率も悪い」→量ではなく質か戦略／「手法が1つしかなく頭打ち」→手法の追加＝戦略の見直し／「相手が数字を持っていない」→分類できない。把握していないこと自体が課題。売るのは「見える化から始める検証」。
4分類と提案の大きさ：戦略→一気通貫（戦略立案〜実行〜分析）130万、厚くするのはセグメント設計と検証サイクル／手法→実行部隊 IS90万〜一気通貫130万、厚くするのは体制（PM＋IS/FS）と業界に近いメンバー経歴／量→ISのみ90万、または1セグメント1ヶ月に絞る、厚くするのは稼働とコール数・週次定例／質→ISのみ90万＋分析、または既存活動のデータ化から、厚くするのはデータ蓄積と分析。

■ 5. 採算の検算（口には出さない。頭の中で）
投資額＝期間(月)×月費用＋準備費。回収額＝期間内の受注数×1受注の売上。受注数＝稼働量×アポ率×受注率。1受注の売上＝買い切りなら導入数×単価、SaaS/月額ならARR（月額×12×アカウント数）。回収額≧投資額→成立→フルで提案。＜→不成立→絞る、または座組みを変える。
変数：期間3〜6ヶ月（「まず試す」なら3）／月費用 IS90万・一気通貫130万・準備費20万／稼働量の基準 月100コール前後でアポ1／アポ率 実績があればそれ、なければ100コール→1アポ／受注率 実績がなければ20商談→1受注（5%）、把握していなければそれ自体を課題に／1受注の売上「1社あたり何台」「月額いくら×何アカウント」を必ず聞く。基準ファネル（100コール→1アポ、20商談→1受注、この稼働で月100万）は参考値で商材で大きく変わる。
商談中の使い方：現状把握で「単価・課金形態」「月の受注数」「1受注あたりの導入数」「受注率」の4つを聞く→頭の中で比べる→成立ならフル提案、不成立なら紹介の前に「フルでは無理」と決め、絞る提案・座組みを変える提案を先に言う。検算していたことは後から開示してよい（「〜という構造だと御社からすると取り組みしづらいと思って聞いていました」→相手は「こちら側で考えている」と受け取る。信頼はここで生まれる）。
実例・不成立（アクティブ・ブレインズ）：単価4.4万買い切り／1社4台／月200台／新規8割。1受注17.6万。半年の投資540万（IS90万×6）→必要受注31件→受注率5%なら620商談/半年＝月100商談超→不成立。だから「セグメントを1つに絞って1ヶ月」（投資を落とす）と「ゼネコン・マリコンのDX推進部に直で行く、買い切りは年度末の予算消化と相性がいい」（1受注を大きくする）を同時に言った。
実例・成立（ジャパンインフラウェイマーク）：POC1件200〜300万／半年で3,000〜5,000万＝10〜20件が目標／過去のアポ率5〜8%。1受注250万、半年の投資780万（一気通貫130万×6）→必要4件、目標10〜20件→成立→フル提案。成立時は検算を前提として流し、「KPIの目線が合うパートナーか」「どの体制なら20件いけるか」に時間を使う。
不成立のときの3つの手：投資を落とす（範囲と期間を絞る。ISのみ／1セグメント／1ヶ月。単価は下げない）／1受注を大きくする（当たるレイヤーを上げる。まとめ買い・全社導入）／座組みを変える（成果報酬・アライアンス・紹介経由）。どれも成り立たないなら受けない方がいい。「他の事業者とやるときも、絞って1ヶ月から始めるのをおすすめします」と相手側に立って締める。
検算をしない商材：SaaSで価格優位が明確な商材はROIが問題にならないので検算しない。相手が成果報酬を前提にしているなら検算の主体はうち側（うちが赤字にならないか）。

■ 6. よくある誤解
課題は相手の口から聞き出すもの→全体像から言い直して「そう、それ」と言わせる／「なんで？なんで？」で狭める→「なぜ」は4分類に落とす深掘りで広げる側の最後、狭めるのは「こういうやり方なら」への収束／ゼンテクトで解ける課題から考える→事業とお金の流れ→営業の構造→分類→うちに何ができるか、の順／深ぼるべき要素が見つからない→4分類の一本道を上から降りれば止まる所が深ぼる要素／終着点が分からない→「こういうやり方ならできますよね」への合意から逆算／説明の強弱が分からない→分類が決まれば厚くする部分は決まる。

■ 7. 自己チェック（3問）：①相手の営業を「誰に・何を・どう売って・月に何件商談し・何%決まるか」まで順を追って自分の言葉で説明できるか（できなければまだ広げる） ②課題を4分類のどれかに置けたか ③「こういうやり方なら」を1つ出したか。`;

/* =========================================================
   ゼンテクトの商材情報（会社紹介資料より）
   ========================================================= */
export const ZENTECT = `ゼンテクト（株式会社ゼンテクト）の商材情報
- 会社：東京都千代田区神田三崎町。代表 田村慧（豊田通商→AI×マーケSaaS→物流SaaS立ち上げ）。取締役 上岡幸弘（日本製鉄→アスエネでIS・建設業FSトップ）。IS/FS 小林剛己（住宅ローン営業全国2位→アスエネ建設業IS立ち上げ、145社市場で売上1億超2期連続）、宮武慎一郎（百十四銀行法人担当→アスエネIS/アカウントセールス）。
- 位置づけ：「営業代行でも自社採用でもない、最短で自ら正解を探し出す成長パートナー」。BtoBグロース支援／セールス特化型AIエージェント開発。
- 支援領域：営業戦略（ペルソナ・ターゲティング・商談フェーズ構築・営業資料）／インサイドセールス（掘り起こし、新規開拓、商談後フォロー、代理店開拓）／フィールドセールス（初回商談〜クロージング、個別提案資料）／セールスカイゼン（CRM構築・定着、受注/失注理由分析、リスト・トーク改善）／組織構築（業界ナレッジ研修、IS/FS研修）。
- 解決する課題（自社メンバーだけでぶつかる壁）：①ターゲット選定・設計（業界知識不足、新規市場のリサーチ方法が未確立）②見込み顧客リサーチ（人力では足りない、アプローチ先選定の判定が曖昧）③トーク設計・検証（汎用的、OK/NG理由が不明確、効果測定材料が揃わない）④アポ獲得（アポ獲得が目的化、アジェンダ未確定の案件が量産）⑤データ分析・改善設計（表面的な計測、成功/失敗要因の言語化不足）。新規営業には「専門のノウハウ」と「短いスパンでPDCAを回しきる実行力」が必要。
- 提供価値の型：工程①ターゲット選定・設計（200万社の企業基礎データ＋3,000万件の連絡先データ＋外部環境サイト・採用情報・プレスリリース・行政公開データ。3C/SWOT、受注企業・商談ログから共通項を抽出した独自リスト、NGリスト除外）→②③リサーチ・トーク設計/検証（受注実績から逆算したTier付け、キラーワードのABテスト、レイヤー毎の訴求と切り返しの蓄積）→④アポ獲得（BANTC：予算・決裁権・ニーズ・時期・競合。「貴社サービスの打ち合わせであること」「興味の背景が聞けていること」が最低条件）→⑤データ分析・改善設計（架電内容の全件自動記録、結果のラベル付け、AI×人間で傾向分析しスクリプトへ反映）。
- 支援体制：PM（戦略設計・全体統括、架電/商談ログとFBから改善の舵取り）＋IS（初期接点・リード創出。経験メンバーを補佐にアサイン）＋DXレイヤー（営業活動のデータ資産化、成功・失敗パターン分析）。
- 料金（税抜）：
  ・成果報酬型（ターゲット分析・リスト・アプローチ〜アポ取得）：準備費用20万円（初回のみ）＋アポ1件あたり 役員以上7万円／部長クラス5万円／担当者クラス3万円。含まれる：リスト作成、スクリプト作成/改善、架電・メール、報告レポート。当月末締め翌月末払い。
  ・固定報酬型：ISプラン 月額90万円（130時間/人月）／一気通貫プラン 月額130万円（130時間、商談〜クロージング・商談ログ共有まで含む）。準備費用20万円。PM費用は月額の10%（9万〜／13万〜）。最低契約6ヶ月。依頼人月・支援範囲は個別調整可。
- 事前確認事項：SFA/CRM（Salesforce・HubSpot等）、情報共有ツール（Slack・Chatwork・Teams）、NGリスト、優先する企業規模・エリア。契約後の依頼：定例・報告会参加（30〜60分）、既存顧客リスト/過去商談記録の共有、自社サービス説明、貴社ドメインのメールアドレス発行。
- 支援実績の業種：建設業向けサービス、AI・データ活用、フィールド業務・現場管理、製造業向け、物流向け、営業DX、リーガルテック、メディア・コンテンツ配信、バックオフィス、電子書籍、法人向け名刺管理。事例：建設現場CO2排出量算定サービス（訴求軸が不明瞭→展開時の訴求軸を設計）。
- 実例の相手の言葉：「何社か話した中で一番納得感がある」（アクティブ・ブレインズ）。`;

/* =========================================================
   競合（難易度「手強い」で相手が比較検討している先）
   ========================================================= */
export const COMPETITORS = `■ 相手が比較検討している他社（難易度「手強い」のとき。相手は提案を受けた上で、こちらにも話を聞いている）
- EmpowerX：Salesforce等のSaaS出身者が創業したIS/FS支援。「The Model」を分かっている、300社以上支援、契約更新率92%、担当者は毎月固定、週1定例、2週間〜1ヶ月でオンボーディング、と言う。料金：インサイドセールス専属プラン 月100万円/1枠＋管理費40万円（PM必須）、初期費用60万円（キャンペーンで40万円）、契約6ヶ月〜。Call数特化型は月300万円で5,000コール、月60万円で1,000コール、月30万円で500コール（契約2〜10ヶ月〜）。新規事業のテストマーケ事例（東急・リクルート・ユーザベース「3ヶ月で受注」）を見せられている。
- セレブリックス：1998年設立、従業員1,264名、累計1,400社・12,700サービスの支援実績。「セールスといえば、セレブリックス」。基本パッケージは4ヶ月〜（準備期間1ヶ月＋営業代行3ヶ月×2名）、申込からPJ開始まで1〜2ヶ月。契約は準委任の「期間契約」で成果保証なし、稼働メンバーは固定を約束しない（人選・マネジメントはセレブリックス一任）、常駐は原則不可。顧客接点構築（アポ獲得）から商談代行・クロージング、カスタマーサクセス、パートナーセールス（BLUE MODEL）まで一気通貫。活動報告書・セールスプレイブック・営業スキル評価表など「仕組み」が整っている。「電話に出ない時代」のデータを持ち、電話以外のチャネル設計を語る。料金は見積もり次第で、2名体制だと月200万円前後の提案を受けている。大手・体制の安心感が売り。
- カリトル君（StockSun）：BtoB営業フリーランス500人のプールから専属ディレクター1名以上を付けてチームで動く。月額10万円〜（トライアル10万円税抜、稼働目安20時間/月）で、アポ5〜10件/月が目安。テレアポ200コール/月、フォーム営業1,200件/月、メール営業6,800件/月の目安。最短5日で開始、導入700社以上、契約継続率約91%、「正社員1名を雇うより安い」「合わなければ即リプレイス」「複数施策の並行検証」が売り。フォーム営業は全件手動でクレームリスクを下げると言う。一方で、アポの定義（担当者レベルも含むか）や戦略設計の深さは不明で、「安いから、まずこれで試す」という比較のされ方をする。
相手の使い方：料金や体制の話になったら「EmpowerXさんは担当固定で週1定例と言っていたが、御社は？」「セレブリックスさんは1,400社やっている。御社の実績は？」「カリトル君なら月10万でアポ5〜10件と言われた。なぜ御社は月90万なのか」「セレブリックスさんは1,400社やっていて報告書も仕組みも揃っている。御社は何人の会社ですか」のように、比較で切り返す。こちらが相手の課題を言い直して構造で説明できていれば納得に向かうが、機能や料金の比較に乗ってしまうと「じゃあ3社で相見積もりで」と流される。他社の悪口は言わず、「向こうはこう言っていた」と事実として伝える。`;

/* =========================================================
   ソーシャルスタイル（相手役のタイプ）
   ========================================================= */
export const STYLES = {
  analytical: { name: "アナリティカル", axis: "意見を聞く × 感情を抑える", traits: "感情表現も主張も控えめ。堅苦しく見える。慎重派で綿密に計画する。決定まで時間をかける。粘り強い。論理を重視する。",
    talk: "淡々と短く話す。相づちは少ない。質問には正確に答えるが、数字は「正確には資料を見ないと」と前置きしてから出す。根拠や前提を聞き返す（「それは何件のデータですか」）。急かされると引く。言い直しは論理が通っていれば認めるが、感情的な言い回しには乗らない。料金には「回収の試算を見せてほしい」と返す。即決はしない（「持ち帰って検討します」）。" },
  driver: { name: "ドライバー", axis: "意見を主張する × 感情を抑える", traits: "感情を表に出さない。競争心が旺盛。成果にこだわる。無駄が嫌い。指図されるのが嫌い。独立心が強い。",
    talk: "結論から言う。前置きや一般論が長いと「で、何ができるんですか」と切る。数字は即答するが丸める。自分の方針を主張し、否定されると反発する。言い直しは的を射ていれば「そう」と一言で認める。料金には「で、何件取れるの」と成果で返す。合えばその場で決める。" },
  amiable: { name: "エミアブル", axis: "意見を聞く × 感情を表す", traits: "温和で親しみやすい。周囲に気を配る。依存心が強い。人と競争するのが嫌い。聞き上手。世話好き。",
    talk: "柔らかく、相づちが多い。相手に合わせて「そうですね」と言うので、本音が見えにくい。数字は「たしか…くらいだったと思います」と曖昧。断るときもはっきり言わず「社内で相談してみます」。本音は「社内（上司・現場）がどう思うか」。言い直しには表向き同意するので、本当に刺さったかは「具体的にはどこが？」と聞かれて初めて分かる。料金には「上に説明しづらくて」と返す。" },
  expressive: { name: "エクスプレッシブ", axis: "意見を主張する × 感情を表す", traits: "表情が豊かで話し好き。喜怒哀楽を表に出す。オープンな性格。熱中しやすい。明るくて楽観的。周囲から認められたがる。",
    talk: "よく喋り、話が脱線する（自社の自慢話・業界の裏話）。乗ってくると「いいですね！やりましょう」と言うが数字は曖昧で、聞くと「だいたい」で済ませる。褒められると機嫌が良くなる。言い直しには大きく反応する（「まさにそれ！」）が、翌日には忘れていそうな軽さ。料金には金額より「一緒にやったら面白そうか」で反応する。" },
};
export function styleOf(key) { return STYLES[key] || null; }

/* =========================================================
   暗算チェック（商談中に出た数字で、その場で計算させる）
   ========================================================= */
export const QUIZ_RULES = `■ 暗算チェックの作り方
- 受講者（営業担当）は数字が苦手。商談で相手が言った数字を使って「頭の中で計算すべきこと」を1問にする。
- 必ず相手が実際に口にした数字だけを使う（キリのいい数字に丸めない。相手が「だいたい月80件くらい」と言ったら80で計算）。相手が言っていない数字は使わない。
- 商談で意味のある計算に限る：月の受注数（商談数×受注率）／アポ率・受注率（件数÷件数）／逆算（目標受注から必要な商談数・コール数）／1受注の売上（単価×導入数、月額×12×アカウント）／目標と見込みの差／半年の投資額（月費用×6＋準備費）と回収に必要な受注数、など。
- 1問は1〜2ステップで、10秒以内に暗算できる大きさ。答えは数値1つ（単位つき）。
- question は口語の短い問い（例：「月80商談で受注率15%。月の受注は？」）。answer は数値（number）、unit は「件」「%」「万円」など。calc は式を2〜3行、mental は暗算のコツを2〜3行（例：「80の10%＝8、5%＝4、合わせて12」）。
- その発言に新しい数字が無い、または計算が成り立たない（必要な数字が揃っていない）ときは quiz を null にする。同じ計算を2回出さない。`;
export const QUIZ_SHAPE = `{"question":"…","answer":12,"unit":"件","calc":["80 × 15%","＝ 12件"],"mental":["80の10%＝8","5%はその半分＝4","→ 12件"],"kind":"pct|ratio|reverse|funnel|revenue|roi"}`;

/* =========================================================
   自社情報（画面で設定）。無ければ上の ZENTECT を使う
   company = { company, product, value, proof, pricing, objections:[], plans:[{name,monthly}], prep, months, trial_months, calls, apo_rate, win_rate }
   ========================================================= */
const s = v => String(v ?? "").trim();
export function hasCompany(c) { return !!(c && (s(c.company) || s(c.product)) && (s(c.value) || s(c.pricing) || s(c.proof))); }
export function companyName(c) { return hasCompany(c) ? s(c.company) || "自社" : "ゼンテクト"; }
export function companyText(c) {
  if (!hasCompany(c)) return ZENTECT;
  const plans = (Array.isArray(c.plans) ? c.plans : []).filter(x => s(x.name) && Number(x.monthly) > 0);
  const objs = (Array.isArray(c.objections) ? c.objections : []).map(s).filter(Boolean);
  return [
    `${s(c.company)}（自社＝受講者が所属する営業代行会社）の商材情報`,
    `- プロダクト/サービス：${s(c.product)}`,
    s(c.value) && `- 提供価値：${s(c.value)}`,
    s(c.proof) && `- 実績・根拠：${s(c.proof)}`,
    s(c.pricing) && `- 価格・料金体系：${s(c.pricing)}`,
    plans.length && `- 検算に使う月費用：${plans.map(x => `${s(x.name)} 月${Number(x.monthly)}万円`).join("／")}。準備費${Number(c.prep) || 0}万円。標準期間${Number(c.months) || 6}ヶ月（まず試すなら${Number(c.trial_months) || 3}ヶ月）`,
    (Number(c.calls) > 0 || Number(c.apo_rate) > 0) && `- 基準の稼働とファネル：月${Number(c.calls) || "?"}コール、アポ率${Number(c.apo_rate) || "?"}%、受注率${Number(c.win_rate) || "?"}%（相手の実績があればそちらを優先）`,
    objs.length && `- 相手からよく出る反論・懸念：${objs.join("／")}`,
  ].filter(Boolean).join("\n");
}
// 相手役が「営業代行の料金」として知っていること
function priceForPersona(c) {
  if (!hasCompany(c)) return "営業代行。固定なら月90万（IS）〜130万（一気通貫）＋準備費20万、最低6ヶ月。成果報酬ならアポ1件3〜7万＋準備費20万。";
  const plans = (Array.isArray(c.plans) ? c.plans : []).filter(x => s(x.name) && Number(x.monthly) > 0);
  return [s(c.product), s(c.pricing) || (plans.length ? plans.map(x => `${s(x.name)} 月${Number(x.monthly)}万`).join("／") + (Number(c.prep) ? `＋準備費${Number(c.prep)}万` : "") : "")].filter(Boolean).join("。");
}

/* =========================================================
   Notion「ロープレ知見」：読み込み・追記
   NOTION_TOKEN と NOTION_KNOWLEDGE_PAGE_ID があるときだけ動く。無ければ空。
   ========================================================= */
const NOTION_VER = "2022-06-28";
function notionHeaders() {
  return { Authorization: "Bearer " + process.env.NOTION_TOKEN, "Notion-Version": NOTION_VER, "content-type": "application/json" };
}
export function knowledgeEnabled() {
  return !!(process.env.NOTION_TOKEN && process.env.NOTION_KNOWLEDGE_PAGE_ID);
}
function rich(b) {
  const t = b[b.type] && b[b.type].rich_text;
  return Array.isArray(t) ? t.map(x => x.plain_text).join("") : "";
}
let cache = { at: 0, items: [] };
export async function loadKnowledge({ force = false } = {}) {
  if (!knowledgeEnabled()) return [];
  if (!force && Date.now() - cache.at < 60 * 1000) return cache.items;
  const id = process.env.NOTION_KNOWLEDGE_PAGE_ID;
  const items = [];
  let cursor;
  for (let i = 0; i < 20; i++) {
    const url = `https://api.notion.com/v1/blocks/${id}/children?page_size=100` + (cursor ? `&start_cursor=${cursor}` : "");
    const r = await fetch(url, { headers: notionHeaders() });
    if (!r.ok) throw new Error("Notion読み込み失敗: " + r.status + " " + (await r.text()).slice(0, 200));
    const j = await r.json();
    for (const b of j.results || []) {
      const t = rich(b).trim();
      if (t) items.push({ type: b.type, text: t });
    }
    if (!j.has_more) break;
    cursor = j.next_cursor;
  }
  cache = { at: Date.now(), items };
  return items;
}
export function knowledgeText(items, limit = 14000) {
  let s = items.map(i => (i.type.startsWith("heading") ? "\n## " + i.text : "- " + i.text)).join("\n");
  if (s.length > limit) s = s.slice(s.length - limit); // 新しいものを優先して残す
  return s;
}
export async function appendKnowledge(lines, heading) {
  if (!knowledgeEnabled()) return false;
  const id = process.env.NOTION_KNOWLEDGE_PAGE_ID;
  const children = [];
  if (heading) children.push({ object: "block", type: "heading_3", heading_3: { rich_text: [{ type: "text", text: { content: heading.slice(0, 1900) } }] } });
  for (const l of lines) {
    const content = String(l).trim().slice(0, 1900);
    if (!content) continue;
    children.push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content } }] } });
  }
  for (let i = 0; i < children.length; i += 100) {
    const r = await fetch(`https://api.notion.com/v1/blocks/${id}/children`, { method: "PATCH", headers: notionHeaders(), body: JSON.stringify({ children: children.slice(i, i + 100) }) });
    if (!r.ok) throw new Error("Notion追記失敗: " + r.status + " " + (await r.text()).slice(0, 200));
  }
  cache.at = 0;
  return true;
}
/* =========================================================
   ロープレ記録：1回ごとにNotionページを作る（田村さんがコメントでアドバイスできるように）
   置き場所は NOTION_RECORDS_PAGE_ID。無ければ「ロープレ知見」ページの中に「ロープレ記録」ページを自動で作る。
   ========================================================= */
const para = (text, bold = false) => ({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: String(text).slice(0, 1900) }, annotations: { bold } }] } });
const h2 = text => ({ object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: text } }] } });
const bullet = text => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content: String(text).slice(0, 1900) } }] } });
let recordsParent = process.env.NOTION_RECORDS_PAGE_ID || "";
async function findRecordsParent() {
  if (recordsParent) return recordsParent;
  const id = process.env.NOTION_KNOWLEDGE_PAGE_ID;
  let cursor;
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`https://api.notion.com/v1/blocks/${id}/children?page_size=100` + (cursor ? `&start_cursor=${cursor}` : ""), { headers: notionHeaders() });
    if (!r.ok) throw new Error("Notion読み込み失敗: " + r.status);
    const j = await r.json();
    const hit = (j.results || []).find(b => b.type === "child_page" && b.child_page && b.child_page.title === "ロープレ記録");
    if (hit) return (recordsParent = hit.id);
    if (!j.has_more) break;
    cursor = j.next_cursor;
  }
  const r = await fetch("https://api.notion.com/v1/pages", { method: "POST", headers: notionHeaders(), body: JSON.stringify({
    parent: { page_id: id }, icon: { type: "emoji", emoji: "📼" },
    properties: { title: { title: [{ type: "text", text: { content: "ロープレ記録" } }] } },
    children: [para("ZenAIロープレで練習した1回ごとの記録。各記録の会話ログの行にコメントを付けてアドバイスする。")],
  }) });
  if (!r.ok) throw new Error("ロープレ記録ページを作れません: " + r.status + " " + (await r.text()).slice(0, 200));
  return (recordsParent = (await r.json()).id);
}
export async function saveRecord({ persona, transcript, picked, correct, rephrase, feedback, mode, overview = "", calcText = "", proposal = "", overviewReview = "", calcReview = "", numbersReview = "", quizText = "", scores = null, nextAction = "", custom = null, secondOpinion = "" }) {
  if (!knowledgeEnabled()) return null;
  const parent = await findRecordsParent();
  const title = `${jstNow()} ${persona.company}（${mode === "chat" ? "チャット" : "音声"}／判定:${CAT[picked]}${correct ? "○" : "×"}）`;
  const blocks = [
    { object: "block", type: "callout", callout: { icon: { type: "emoji", emoji: "🙏" }, rich_text: [{ type: "text", text: { content: "田村さんへ：ズレていたと思う発言の行を選んで、コメントでアドバイスをお願いします。" } }] } },
    h2("相手"),
    bullet(`${persona.company}／${persona.name}（${persona.role || ""}）／難易度：${persona.difficulty || ""}`),
    bullet("会社概要：" + (persona.brief || "")),
    bullet("冒頭のひとこと：" + (persona.opening_line || "")),
    h2("判定"),
    bullet(`受講者の判定：${picked} ${CAT[picked]}（${correct ? "正解" : "不正解"}）／正解：${persona.answer} ${CAT[persona.answer]}`),
    bullet("問1 相手の営業の説明：" + (overview || "（なし）")),
    bullet("問2 受講者の言い直し：" + (rephrase || "（なし）")),
    bullet("問3 検算：" + (calcText || "（なし）")),
    bullet("問3 こういうやり方なら：" + (proposal || "（なし）")),
    bullet("暗算チェック：" + (quizText || "（なし）")),
    bullet("正解の理由：" + (persona.exp || "")),
    bullet("言い直しの模範例：" + (persona.rephrase_example || "")),
    h2("会話ログ"),
  ];
  (transcript.length ? transcript : [{ who: "sys", text: "（会話なし）" }]).forEach((t, i) => {
    const who = t.who === "me" ? "営業（自分）" : t.who === "them" ? persona.name : "";
    blocks.push(para(`${String(i + 1).padStart(2, "0")}　${who ? who + "：" : ""}${t.text}`, t.who === "me"));
  });
  blocks.push(h2("コーチ（AI）の振り返り"), para(feedback || ""));
  if (overviewReview) blocks.push(para("問1 全体像：" + overviewReview));
  if (calcReview) blocks.push(para("問3 検算：" + calcReview));
  if (numbersReview) blocks.push(para("数字：" + numbersReview));
  if (secondOpinion) blocks.push(para("Mr. Go fast（論理の指摘）：" + secondOpinion));
  if (scores) {
    const L = { counterpart: "相手の把握", widen: "広げる", classify: "深掘る", rephrase: "言い直し", converge: "狭める", roi: "検算", listening: "傾聴態度", closing: "クロージング" };
    blocks.push(h2("スコア（5点満点）"));
    for (const k of Object.keys(L)) if (scores[k]) blocks.push(bullet(`${L[k]}：${scores[k].score}／${scores[k].why}`));
    if (custom) for (const k of Object.keys(custom)) blocks.push(bullet(`上司FBの観点「${custom[k].title}」：${custom[k].score}／${custom[k].why}`));
    if (nextAction) blocks.push(bullet("次の一手：" + nextAction));
  }
  blocks.push({ object: "block", type: "toggle", toggle: { rich_text: [{ type: "text", text: { content: "相手の事実（答え合わせ用）" } }], children: (persona.hidden_facts || []).slice(0, 90).map(bullet) } });
  const r = await fetch("https://api.notion.com/v1/pages", { method: "POST", headers: notionHeaders(), body: JSON.stringify({
    parent: { page_id: parent }, properties: { title: { title: [{ type: "text", text: { content: title.slice(0, 1900) } }] } }, children: blocks.slice(0, 100),
  }) });
  if (!r.ok) throw new Error("記録の保存失敗: " + r.status + " " + (await r.text()).slice(0, 200));
  const page = await r.json();
  for (let i = 100; i < blocks.length; i += 100) {
    const a = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, { method: "PATCH", headers: notionHeaders(), body: JSON.stringify({ children: blocks.slice(i, i + 100) }) });
    if (!a.ok) throw new Error("記録の追記失敗: " + a.status);
  }
  return page.url;
}
export function jstNow() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
}

/* =========================================================
   相手役（商談相手）のシステム指示
   ========================================================= */
// 相手役の言語を日本語に固定する指示。
// Gemini Live（ネイティブ音声）は設定の languageCode では返答言語を固定できず、聞こえた音声から言語を自動で選ぶ。
// 雑音・咳・聞き取りにくい発話を別の言語と誤認すると、その言語で返してしまうため、システム指示の冒頭と末尾の両方で縛る。
export const LANG_RULE = `■ 言語（最優先のルール）
RESPOND IN JAPANESE. YOU MUST RESPOND UNMISTAKABLY IN JAPANESE.
- 必ず日本語だけで話す。この商談は最初から最後まで日本語で行う。英語・中国語・韓国語など、ほかの言語には絶対に切り替えない。
- 営業担当は日本語で話している。音声が聞き取りにくい、雑音や咳が入った、別の言語のように聞こえた、という場合も、それは日本語の聞き取りにくい発話として扱い、日本語で「すみません、ちょっと聞き取れなかったので、もう一度お願いできますか」と聞き返す。
- 相手がカタカナ語・英語の略語（SaaS、KPI、CRM、アポ、リード など）を使っても、返事は日本語のまま。`;

// 日本語の発言に見えるか（かなが一定以上あるか）。短い発言・数字や記号だけの発言は判定しない
export function looksJapanese(text) {
  const letters = String(text || "").match(/\p{L}/gu) || [];
  if (letters.length < 12) return true;
  const kana = letters.filter(c => /[\u3040-\u30ff]/.test(c)).length;
  return kana / letters.length >= 0.1;
}

export function personaSystemInstruction(p, knowledge = "", company = null) {
  const me = companyName(company);
  const objs = hasCompany(company) ? (company.objections || []).map(s).filter(Boolean) : [];
  const facts = (p.hidden_facts || []).map((f, i) => `${i + 1}. ${f}`).join("\n");
  return `${LANG_RULE}

あなたは「${p.company}」の${p.name}（${p.role}）。営業代行会社${me}の営業担当と、初回の商談（30分の打ち合わせ）をしている。相手はあなたの営業の課題を整理しに来た。

■ あなたの会社と営業の事実（聞かれたことだけ答える。聞かれていないことを自分から並べない）
${facts}

■ あなたの役職と決裁権：${p.role}。${p.authority || ""}
- 役職・役割・決裁権・今回来た経緯は、自分からは言わない。聞かれたら答える（名刺交換は済んでいる前提だが、役割やミッションは説明していない）。
- 決裁権が無い立場なら、料金や契約の話になったら「私の一存では決められないので、上に説明できる材料が欲しい」という姿勢をとる。知らない数字は「そこは営業部に聞かないと分からない」のように、その役職らしく答える。

■ 商談の終わり方：あなたは初回商談で契約はしない（「是非お願いします」とは言わない）。相手が①あなたの営業の全体像を聞き切り、②課題を構造で言い直して、③「こういうやり方ならできますよね」を出し、④それが採算的に無理のない大きさなら、「それなら次回、提案書と見積もりを持ってきてください」「稟議に上げたいので資料をください」「来週、現場の責任者も入れてもう一度」のように次のステップに進む。①〜③が揃っていなければ「一度検討します」で終わる。${p.difficulty === "hard" ? "他社と比較検討中なので、良い提案でも「他社の提案と並べて判断します」と言う。" : ""}

■ 商談の始まり方：営業担当が先に話す。あなたからは話し始めない。営業担当が時間をもらった御礼を言い、「どこに興味を持ってくれたのか」「なぜ今回時間を取ったのか」を聞いてきたら、軽く挨拶を返し、今回時間を取った背景として自分の課題認識をひとことで答えて、相手の出方を待つ。御礼だけで質問が無ければ、挨拶を返して相手が聞くのを待つ。

■ あなたの課題認識（本音）：「${p.opening_line}」。本当の課題が「${CAT[p.answer]}」の問題だとは自覚していない。
　相手がその構造を言い当てて言い直してきたら（例：${p.rephrase_example}）、「そう、それです」「その通りです」と認める。外れていれば「うーん、そこはそんなに困ってないんですよね」のように違和感を口にする。

■ 性格・難易度：${p.personality}${p.difficulty === "hard" ? `

${COMPETITORS}` : ""}${p.style && STYLES[p.style] ? `

■ あなたのタイプ（ソーシャルスタイル）：${STYLES[p.style].name}（${STYLES[p.style].axis}）。${STYLES[p.style].traits}
　話し方・反応：${STYLES[p.style].talk}
　タイプ名は口にしない。` : ""}

■ 相手（${me}）について、あなたが${p.role}として知っていること・気にすること
- ${priceForPersona(company)}
- だから立場上「それ払って回収できるのか」「うちの単価で何件取れば元が取れるのか」「本当にうちの業界が分かるのか」「アポだけ取って質が低いんじゃないか」を気にする。相手が料金や体制を言ったら、自社の数字と照らして率直に反応する（例：「月90万？うちの粗利だと何件必要ですか」）。${objs.length ? `\n- 話の流れに合えば、次のような懸念も口にする（全部は言わない。1〜2個）：${objs.join("／")}` : ""}
- ただし相手がまだ自社の全体像を聞き終えていないのに提案や料金の話を始めたら、「で、うちの何が問題なんですか？」と切り返す。

■ 話し方
- 日本語、口語。${p.role}らしく。1回の発言は短く（2〜3文、10秒以内）。相手が話し終えるのを待つ。
- 売上目標と着地見込みは自分からは言わない。聞かれたら答える。
- 報酬形態（成果報酬か固定か）の希望も自分からは言わない。料金の話になったとき、聞かれれば希望と理由を言う。成果報酬を希望しているのに固定の提案をされたら「それ、成果が出なくても払うんですよね」と返す。
- 数字は聞かれれば答える。事実にない数字は「そこは取ってないですね」「ちょっと分からないです」。
- 説明には相づち（「ああ、なるほど」「ええ」）。質問には答える。自分の関心事に刺さる話には食いつく（「それどうやるんですか？」）。
- 業界の一般論は言わない。この会社固有の現状として話す。
- 自分が演技中であること、AIであること、正解の分類名（戦略・手法・量・質）は口にしない。
${knowledge ? `
■ 過去の実商談から得た知見（相手役のリアリティに反映する。該当するものだけ使う）
${knowledge}` : ""}

${LANG_RULE}`;
}

/* =========================================================
   ロープレ成績DB（メンバー別・端末をまたいで共有）
   「ロープレ知見」ページの中に Notion データベース「ロープレ成績」を自動で作る。
   1行＝1回のロープレ。ダッシュボード用の要約は「データ」列にJSONで持つ。
   自社情報など全員共通の設定も、種別=設定 の行として同じDBに置く。
   ========================================================= */
const RESULTS_DB_TITLE = "ロープレ成績";
let resultsDb = process.env.NOTION_RESULTS_DB_ID || "";
const RESULTS_PROPS = {
  "名前": { title: {} },
  "メール": { rich_text: {} },
  "メンバー": { rich_text: {} },
  "種別": { select: { options: [{ name: "記録", color: "blue" }, { name: "設定", color: "gray" }] } },
  "日時": { date: {} },
  "総合": { number: { format: "number" } },
  "正解": { checkbox: {} },
  "モード": { select: { options: [{ name: "音声" }, { name: "チャット" }] } },
  "相手": { rich_text: {} },
  "秒": { number: { format: "number" } },
  "データ": { rich_text: {} },
};
export function resultsEnabled() { return !!(process.env.NOTION_TOKEN && (process.env.NOTION_RESULTS_DB_ID || process.env.NOTION_KNOWLEDGE_PAGE_ID)); }
async function findResultsDb() {
  if (resultsDb) return resultsDb;
  const id = process.env.NOTION_KNOWLEDGE_PAGE_ID;
  let cursor;
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`https://api.notion.com/v1/blocks/${id}/children?page_size=100` + (cursor ? `&start_cursor=${cursor}` : ""), { headers: notionHeaders() });
    if (!r.ok) throw new Error("Notion読み込み失敗: " + r.status);
    const j = await r.json();
    const hit = (j.results || []).find(b => b.type === "child_database" && b.child_database && b.child_database.title === RESULTS_DB_TITLE);
    if (hit) return (resultsDb = hit.id);
    if (!j.has_more) break;
    cursor = j.next_cursor;
  }
  const r = await fetch("https://api.notion.com/v1/databases", { method: "POST", headers: notionHeaders(), body: JSON.stringify({
    parent: { type: "page_id", page_id: id }, icon: { type: "emoji", emoji: "📊" },
    title: [{ type: "text", text: { content: RESULTS_DB_TITLE } }],
    properties: RESULTS_PROPS,
  }) });
  if (!r.ok) throw new Error("ロープレ成績DBを作れません: " + r.status + " " + (await r.text()).slice(0, 200));
  return (resultsDb = (await r.json()).id);
}
const rt = s => { const t = String(s ?? ""); const out = []; for (let i = 0; i < t.length && out.length < 50; i += 1900) out.push({ type: "text", text: { content: t.slice(i, i + 1900) } }); return out.length ? out : [{ type: "text", text: { content: "" } }]; };
const rtText = p => (p && Array.isArray(p.rich_text) ? p.rich_text.map(x => x.plain_text).join("") : "");
export async function addResult(user, entry) {
  if (!resultsEnabled()) return null;
  const db = await findResultsDb();
  const at = entry.at || Date.now();
  const r = await fetch("https://api.notion.com/v1/pages", { method: "POST", headers: notionHeaders(), body: JSON.stringify({
    parent: { database_id: db },
    properties: {
      "名前": { title: [{ type: "text", text: { content: `${user.short || user.name} ${jstNow()} ${entry.company || ""}`.slice(0, 1900) } }] },
      "メール": { rich_text: rt(user.email) },
      "メンバー": { rich_text: rt(user.name) },
      "種別": { select: { name: "記録" } },
      "日時": { date: { start: new Date(at).toISOString() } },
      "総合": { number: Number(entry.total) || 0 },
      "正解": { checkbox: !!entry.correct },
      "モード": { select: { name: entry.mode === "chat" ? "チャット" : "音声" } },
      "相手": { rich_text: rt(entry.company || "") },
      "秒": { number: Number(entry.sec) || 0 },
      "データ": { rich_text: rt(JSON.stringify(entry)) },
    },
  }) });
  if (!r.ok) throw new Error("成績の保存失敗: " + r.status + " " + (await r.text()).slice(0, 200));
  return (await r.json()).id;
}
async function queryResults(filter, sorts) {
  const db = await findResultsDb();
  const out = [];
  let cursor;
  for (let i = 0; i < 30; i++) {
    const body = { page_size: 100, filter, sorts };
    if (cursor) body.start_cursor = cursor;
    const r = await fetch(`https://api.notion.com/v1/databases/${db}/query`, { method: "POST", headers: notionHeaders(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error("成績の読み込み失敗: " + r.status + " " + (await r.text()).slice(0, 200));
    const j = await r.json();
    out.push(...(j.results || []));
    if (!j.has_more) break;
    cursor = j.next_cursor;
  }
  return out;
}
// 記録を全件（管理者）またはメール指定で取る。戻り値は {email, name, entry}
export async function listResults({ email = null } = {}) {
  if (!resultsEnabled()) return [];
  const and = [{ property: "種別", select: { equals: "記録" } }];
  if (email) and.push({ property: "メール", rich_text: { equals: email } });
  const pages = await queryResults({ and }, [{ property: "日時", direction: "ascending" }]);
  const out = [];
  for (const p of pages) {
    const P = p.properties || {};
    let entry = null;
    try { entry = JSON.parse(rtText(P["データ"])); } catch (_) {}
    if (!entry) continue;
    entry.id = p.id;
    out.push({ email: rtText(P["メール"]), name: rtText(P["メンバー"]), entry });
  }
  return out;
}
export async function updateResult(id, entry) {
  const r = await fetch(`https://api.notion.com/v1/pages/${id}`, { method: "PATCH", headers: notionHeaders(), body: JSON.stringify({ properties: { "データ": { rich_text: rt(JSON.stringify(entry)) } } }) });
  if (!r.ok) throw new Error("成績の更新失敗: " + r.status + " " + (await r.text()).slice(0, 200));
  return true;
}
export async function deleteResult(id) {
  const r = await fetch(`https://api.notion.com/v1/pages/${id}`, { method: "PATCH", headers: notionHeaders(), body: JSON.stringify({ archived: true }) });
  return r.ok;
}
// 共通設定（自社情報など）：種別=設定、名前=key の行に JSON を持つ
export async function getSetting(key) {
  if (!resultsEnabled()) return null;
  const pages = await queryResults({ and: [{ property: "種別", select: { equals: "設定" } }, { property: "相手", rich_text: { equals: key } }] });
  if (!pages.length) return null;
  try { return JSON.parse(rtText(pages[0].properties["データ"])); } catch (_) { return null; }
}
export async function setSetting(key, value, user) {
  if (!resultsEnabled()) return false;
  const pages = await queryResults({ and: [{ property: "種別", select: { equals: "設定" } }, { property: "相手", rich_text: { equals: key } }] });
  const props = { "データ": { rich_text: rt(JSON.stringify(value)) }, "メール": { rich_text: rt(user ? user.email : "") }, "メンバー": { rich_text: rt(user ? user.name : "") }, "日時": { date: { start: new Date().toISOString() } } };
  let r;
  if (pages.length) r = await fetch(`https://api.notion.com/v1/pages/${pages[0].id}`, { method: "PATCH", headers: notionHeaders(), body: JSON.stringify({ properties: props }) });
  else {
    const db = await findResultsDb();
    r = await fetch("https://api.notion.com/v1/pages", { method: "POST", headers: notionHeaders(), body: JSON.stringify({ parent: { database_id: db }, properties: { ...props, "名前": { title: [{ type: "text", text: { content: "設定：" + key } }] }, "種別": { select: { name: "設定" } }, "相手": { rich_text: rt(key) } } }) });
  }
  if (!r.ok) throw new Error("設定の保存失敗: " + r.status + " " + (await r.text()).slice(0, 200));
  return true;
}
