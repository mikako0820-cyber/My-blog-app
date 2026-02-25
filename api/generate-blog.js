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
あなたは日本語のプロブロガー兼、実務に強い編集者です。
以下の条件で、読みやすく具体的で、ありきたりではない記事を書いてください。

【カテゴリ】
${categoryText}

【テーマ】
${topic}

【トーン】
${tone}

【目的】
- 読者が「なるほど、やってみよう」と思える内容
- 抽象論ではなく、現場感・生活感のある具体例を入れる
- ありきたりな言い回し（例: 大切です / 意識しましょう の連発）を避ける

【必須構成】
1. 導入（共感 + 問題提起）
2. 本文（3〜5見出し）
3. まとめ（今日からできる小さな一歩）

【出力ルール】
- 日本語
- HTML形式で出力
- 使用してよいタグは <h2><h3><p><ul><ol><li><strong> のみ
- タイトル（h1）は不要
- 絵文字なし
- 誇大表現・煽り表現は避ける
- 1見出しごとに具体例を1つ以上入れる
- 40代女性向けテーマなら、日常・体調・気持ちの揺らぎにも自然に触れる
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
        messages: [{ role: "user", content: prompt }]
      })
    });

    const raw = await anthropicRes.text();

    if (!anthropicRes.ok) {
      return res.status(anthropicRes.status).json({
        message: `Anthropic APIエラー: ${raw}`
      });
    }

    const anthropicData = JSON.parse(raw);

    const text = anthropicData?.content?.[0]?.text;
    if (!text) {
      return res.status(500).json({ message: "記事の生成結果が空でした。" });
    }

    const safeHtml = text
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
      .replace(/on\w+="[^"]*"/gi, "");

    return res.status(200).json({ html: safeHtml });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      message: `サーバーエラーが発生しました: ${e.message}`
    });
  }
};
