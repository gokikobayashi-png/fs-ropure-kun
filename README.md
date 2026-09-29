# FS商談ロープレ君（音声版）

ゼンテクトのFS商談を、AIが演じる相手企業の社長と**声で**練習するアプリ。
田村さんの「商談の事前準備を、AIペルソナとの音声ロープレで…」と同じ構成（Gemini Live API／短命トークン／Vercel）で、
題材を「課題は 戦略・手法・量・質 のどれか」に特化したもの。

## 流れ

1. **ケース設定** … 業種・商材・規模・正解の分類・難易度を入れる（空欄ならAIがランダム）
2. **相手を生成** … AIが架空の会社＋社長を作る。事前に見えるのは会社概要と社長のひとこと（課題認識）だけ
3. **音声ロープレ** … マイクで話す。社長役が声で返す。文字起こしが画面に流れる
4. **課題はどれか** … A〜Dを選び、課題の「言い直し」を書いて判定。コーチが会話ログを引いて振り返る

## 構成

```
api/_lib.js       教材（FS商談の考え方）・社長役のプロンプト・共通処理
api/persona.js    相手企業ペルソナ生成（gemini-3.6-flash）
api/token.js      Live API 用の短命トークン発行（APIキーはここだけ）
api/grade.js      判定と振り返り
public/index.html 画面
public/app.js     マイク→16kHz PCM→Gemini、24kHz音声の再生、文字起こし表示
public/pcm-capture.js  AudioWorklet（ダウンサンプル）
```

ブラウザは短命トークン（30分・1回きり）でGeminiに直結するので、APIキーはブラウザに渡らない。追加サーバ不要。

## セットアップ（Vercel）

1. [Google AI Studio](https://aistudio.google.com/) でAPIキーを取る
2. このフォルダをGitHubに上げて、Vercelで Import（Framework Preset は Other でOK）
3. Vercel の Environment Variables に設定
   - `GEMINI_API_KEY` … 必須
   - `APP_PASSWORD` … 任意。設定すると最初にパスワード画面が出る（社内共有用）
   - `GEMINI_LIVE_MODEL` … 任意。既定 `gemini-3.8-live`
   - `GEMINI_TEXT_MODEL` … 任意。既定 `gemini-3.6-flash`
4. Deploy → 発行されたURLを開く → マイク許可

ローカルで試すなら `npm i -g vercel` → `vercel dev`（`.env` に上の変数を書く）。

## 使うときのコツ

- 相手が話し終えてから話す。かぶせると相手は止まる（本物と同じ）
- 「営業が弱くて」と言われたら、そのまま受けずに「誰に・何を・どう売って・月に何件・何%」を先に埋める
- 判定前に必ず声で言い直す。「〜で積んでいる限り、〜にならない構造ですよね」

## 差し替えどころ

- 教材の定義や口調は `api/_lib.js` の `FRAMEWORK` と `personaSystemInstruction`
- 難易度ごとの性格は `api/persona.js` の `PERSONALITY`
- 声は `api/persona.js` の `json.voice`（Charon / Aoede など）

## 費用の目安

Live API は音声の入出力トークン課金。10分の会話で数十円規模（田村さんの試算と同じ水準）。
ペルソナ生成と判定はテキストなのでごく小さい。
