// POST /api/token  { persona }  → 短命トークン＋ブラウザが Live API に渡す設定
// APIキーはサーバの中だけ。ブラウザには30分だけ有効な使い捨てトークンを渡す。
import { client, auth, readJson, personaSystemInstruction, LIVE_MODEL, loadKnowledge, knowledgeText } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!auth(req, res)) return;
  try {
    const { persona, company = null } = await readJson(req);
    if (!persona || !persona.company) return res.status(400).json({ error: "persona が必要です" });

    let knowledge = "";
    try { knowledge = knowledgeText(await loadKnowledge(), 6000); } catch (e) { console.error(e); }
    const liveConfig = {
      responseModalities: ["AUDIO"],
      speechConfig: {
        languageCode: "ja-JP",
        voiceConfig: { prebuiltVoiceConfig: { voiceName: persona.voice || "Charon" } },
      },
      systemInstruction: personaSystemInstruction(persona, knowledge, company),
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    };

    const ai = client();
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        liveConnectConstraints: { model: LIVE_MODEL, config: liveConfig },
        httpOptions: { apiVersion: "v1alpha" },
      },
    });
    res.status(200).json({ token: token.name, model: LIVE_MODEL, config: liveConfig });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
