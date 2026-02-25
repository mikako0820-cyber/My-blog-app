module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ message: "POSTのみ対応です。" });
  }

  try {
    const { topic, categoryText, tone } = req.body || {};

    if (!topic || !categoryText || !tone) {
      return res.status(400).json({ message: "入力が不足しています。" });
    }

    if (String(topic).length > 120) {
      return res.status(400).json({ message: "テーマは120文字以内で入力してください。" });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "サーバーのAPIキー設定がありません。" });
    }

    const prompt = `
あなたは日本語のプロブロガーです。
カテゴリ「${categoryText}」、テーマ「${topic}」、トーン「${tone}」でブログ記事を書いてください。

要件:
- 日本語
- 読みやすい構成
- HTMLタグは <h2> <h3> <p> <ul> <ol> <li> <strong> のみ使用
- 導入→本文→まとめ の流れ
- 誇大表現は避ける
- 実用的でわかりやすい内容
`;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1500,
        messages: [
          { role: "user", content: prompt }
        ]
      })
    });

    // まず text で受けて、エラー内容を見えるようにする
    const raw = await anthropicRes.text();

    // JSONに変換（失敗したらそのまま返す）
    let anthropicData;
    try {
      anthropicData = JSON.parse(raw);
    } catch (e) {
      return res.status(500).json({
        message: `Anthropicの応答がJSONではありません: ${raw}`
      });
    }

    if (!anthropicRes.ok) {
      return res.status(anthropicRes.status).json({
        message: anthropicData?.error?.message || `Anthropic API error: ${raw}`
      });
    }

    // content は配列で返ってくる
    const text = anthropicData?.content?.[0]?.text;
    if (!text) {
      return res.status(500).json({ message: "記事の生成結果が空でした。" });
    }

    // 最低限のサニタイズ
    const safeHtml = text
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
      .replace(/on\w+="[^"]*"/gi, "");

    return res.status(200).json({ html: safeHtml });

  } catch (e) {
    console.error(e);
    return res.status(500).json({
      message: e?.message || "サーバーエラーが発生しました。"
    });
  }
};
