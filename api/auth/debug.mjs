// GET /api/auth/debug — check SMTP2GO key + test send
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  
  const rawKey = process.env.SMTP2GO_API_KEY || "";
  const trimmed = rawKey.trim();
  
  // Try to send with the key to verify it works from Vercel
  const testResult = { status: "not_tested" };
  if (trimmed) {
    try {
      const testPayload = {
        api_key: trimmed,
        to: ["test@smtp2go.com"], // SMTP2GO test address
        sender: "quran@xerpium.com",
        subject: "Test from Vercel",
        text_body: "Test"
      };
      const r = await fetch("https://api.smtp2go.com/v3/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testPayload),
      });
      const data = await r.json();
      testResult.status = r.ok ? "ok" : "error";
      testResult.response = data;
      testResult.httpStatus = r.status;
    } catch (e) {
      testResult.status = "fetch_error";
      testResult.error = e.message;
    }
  }
  
  return res.status(200).json({
    keyExists: !!rawKey,
    keyLength: rawKey.length,
    trimmedLength: trimmed.length,
    keyPrefix: trimmed.slice(0, 8) + "...",
    keySuffix: "..." + trimmed.slice(-6),
    testResult,
  });
}
