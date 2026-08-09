export default async function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: "NOVA",
    component: "API",
    version: "0.1.0"
  });
}
