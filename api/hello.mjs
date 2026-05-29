// Minimal test API — zero dependencies
export default async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.status(200).json({
    ok: true,
    message: "API function is alive!",
    method: req.method,
    query: req.query,
    time: new Date().toISOString(),
  });
};
