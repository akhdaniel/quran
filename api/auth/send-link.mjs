// POST /api/auth/send-link — send magic link email via SMTP2GO
import { storeMagicLink } from "../_auth.mjs";

const SMTP2GO_API = "https://api.smtp2go.com/v3/email/send";
const APP_URL = process.env.VERCEL_URL
  ? "https://" + process.env.VERCEL_URL
  : "https://quran-kappa-rosy.vercel.app";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const apiKey = process.env.SMTP2GO_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "SMTP2GO_API_KEY not set" });

  let body = {};
  try { body = req.body || JSON.parse(req.body || "{}"); } catch {}
  const email = (body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return res.status(400).json({ error: "Invalid email" });

  try {
    const token = await storeMagicLink(email);
    const magicUrl = APP_URL + "/?login=" + token;

    const emailPayload = {
      api_key: apiKey,
      to: [email],
      sender: "quran@xerpium.com",
      subject: "Masuk ke Quran AI",
      html_body: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width:480px; margin:0 auto; padding:32px; background:#1a1a2e; color:#e0e0e0; border-radius:12px;">
          <h2 style="color:#c9a96e; margin-top:0;">Quran AI</h2>
          <p>Klik tombol di bawah untuk masuk ke akun Anda:</p>
          <a href="${magicUrl}" style="display:inline-block; padding:14px 32px; background:#c9a96e; color:#1a1a2e; text-decoration:none; border-radius:8px; font-weight:bold; margin:16px 0;">Masuk</a>
          <p style="color:#888; font-size:13px;">Link ini berlaku 15 menit. Abaikan email ini jika Anda tidak meminta login.</p>
          <hr style="border-color:#333; margin:24px 0;">
          <p style="color:#666; font-size:12px;">${magicUrl}</p>
        </div>
      `,
      text_body: "Masuk ke Quran AI: " + magicUrl + "\n\nLink ini berlaku 15 menit.",
    };

    const smtpRes = await fetch(SMTP2GO_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(emailPayload),
    });

    const smtpData = await smtpRes.json().catch(() => ({}));

    if (!smtpRes.ok) {
      console.error("SMTP2GO error:", smtpData);
      return res.status(500).json({ error: "Failed to send email", detail: smtpData });
    }

    return res.status(200).json({ ok: true, message: "Magic link sent", to: email });
  } catch (err) {
    console.error("send-link error:", err);
    return res.status(500).json({ error: err.message });
  }
}
