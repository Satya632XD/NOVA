const MAX_PROJECT_SIZE = 10 * 1024 * 1024;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const body = req.body;

    if (!body || !body.project) {
      return res.status(400).json({
        error: "Project data is required"
      });
    }

    const projectJSON = JSON.stringify(body.project);

    if (
      Buffer.byteLength(projectJSON, "utf8") >
      MAX_PROJECT_SIZE
    ) {
      return res.status(413).json({
        error: "Project is too large"
      });
    }

    const buildId = crypto.randomUUID();

    return res.status(202).json({
      buildId,
      status: "queued",
      platform: body.platform || "android",
      format: body.format || "apk",
      message: "Build request accepted."
    });
  } catch (error) {
    console.error("NOVA build error:", error);

    return res.status(500).json({
      error: "Internal build service error"
    });
  }
}
