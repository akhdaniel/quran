// GET /api/auth/debug — check env vars (for debugging only)
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  
  const checkVars = [
    "SMTP2GO_API_KEY",
    "smtp2go_api_key",
    "SMTP2GO_APIKEY",
    "Smtp2goApiKey",
    "VITE_DEEPSEEK_API_KEY",
    "DEEPSEEK_API_KEY",
    "BLOB_READ_WRITE_TOKEN",
  ];
  
  const result = {};
  for (const key of checkVars) {
    const val = process.env[key];
    result[key] = val ? val.slice(0, 4) + "..." + val.slice(-4) : null;
  }
  
  // Also list all env vars (masked values)
  const allVars = {};
  for (const key of Object.keys(process.env).sort()) {
    const val = process.env[key];
    allVars[key] = val ? val.slice(0, 3) + "..." + val.slice(-3) : null;
  }
  
  return res.status(200).json({ checkVars: result, allKeys: Object.keys(process.env).sort() });
}
