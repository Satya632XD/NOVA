export class CompilerService {
  constructor({ onStatus = () => {} } = {}) {
    this.onStatus = onStatus;
  }

  async build(project) {
    this.onStatus("Uploading project…");

    const response = await fetch("/api/build", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        project,
        platform: "android",
        format: "apk"
      })
    });

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error("Invalid server response");
    }

    if (!response.ok) {
      throw new Error(
        data?.error || "Build request failed"
      );
    }

    this.onStatus(
      `Build ${data.buildId} queued`
    );

    return data;
  }
}
