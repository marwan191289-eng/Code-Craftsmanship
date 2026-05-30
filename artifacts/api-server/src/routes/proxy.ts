import { Router } from "express";

const router = Router();

router.post("/upload-m3u", async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const content = Buffer.concat(chunks).toString("utf-8").replace(/^\uFEFF/, "");
        if (!content.includes("#EXTINF") && !content.includes("#EXTM3U")) {
          return res.status(400).json({ message: "File does not appear to be a valid M3U playlist" });
        }
        const entryCount = (content.match(/#EXTINF/g) || []).length;
        res.status(200).json({ success: true, content, entryCount });
      } catch (err: any) {
        res.status(500).json({ message: "Failed to process file: " + err.message });
      }
    });
    req.on("error", (err) => {
      res.status(500).json({ message: "Upload failed: " + err.message });
    });
  } catch (error: any) {
    res.status(500).json({ message: "Upload error: " + error.message });
  }
});

router.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || typeof targetUrl !== "string") {
    return res.status(400).json({ message: "Missing or invalid URL parameter" });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    let response: Response;
    try {
      response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
          Accept: "*/*",
          Connection: "keep-alive",
        },
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === "AbortError") {
        return res.status(504).json({ message: "Request timed out. The server took too long to respond." });
      }
      return res.status(502).json({
        message: `Cannot reach server: ${fetchErr.cause?.code || fetchErr.message}. The provider may be blocking this server or is offline.`,
      });
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      return res.status(502).json({
        message: `Server responded with error ${response.status}. Check your URL or credentials.`,
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let contentType = response.headers.get("content-type");
    const lowerUrl = targetUrl.toLowerCase();
    if (lowerUrl.includes("m3u8")) {
      contentType = "application/vnd.apple.mpegurl";
    } else if (lowerUrl.includes(".ts")) {
      contentType = "video/mp2t";
    } else if (lowerUrl.includes("m3u")) {
      contentType = "application/x-mpegurl";
    }

    res.setHeader("Content-Type", contentType || "application/octet-stream");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Expose-Headers", "*");
    res.setHeader("Content-Length", buffer.length);
    return res.status(200).send(buffer);
  } catch (error: any) {
    res.status(500).json({ message: "Proxy request failed: " + error.message });
  }
});

export default router;
