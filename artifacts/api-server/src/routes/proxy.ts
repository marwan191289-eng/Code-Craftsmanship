import { Router } from "express";

const router = Router();

const epgCache = new Map<string, { data: Buffer; contentType: string; fetchedAt: number }>();
const EPG_TTL = 60 * 60 * 1000;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/110.0.0.0 Safari/537.36",
  Accept: "*/*",
  Connection: "keep-alive",
};

async function fetchRemote(url: string, timeoutMs = 120000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: HEADERS });
  } finally {
    clearTimeout(timer);
  }
}

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

router.get("/epg", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || typeof targetUrl !== "string") {
    return res.status(400).json({ message: "Missing url parameter" });
  }

  const cached = epgCache.get(targetUrl);
  if (cached && Date.now() - cached.fetchedAt < EPG_TTL) {
    res.setHeader("Content-Type", cached.contentType);
    res.setHeader("X-EPG-Cached", "true");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).send(cached.data);
  }

  try {
    let response: Response;
    try {
      response = await fetchRemote(targetUrl, 120000);
    } catch (fetchErr: any) {
      if (fetchErr.name === "AbortError") {
        return res.status(504).json({ message: "EPG request timed out" });
      }
      return res.status(502).json({ message: `Cannot reach EPG server: ${fetchErr.message}` });
    }

    if (!response.ok) {
      return res.status(502).json({ message: `EPG server responded with ${response.status}` });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type") || "application/xml";

    epgCache.set(targetUrl, { data: buffer, contentType, fetchedAt: Date.now() });

    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-EPG-Cached", "false");
    return res.status(200).send(buffer);
  } catch (error: any) {
    res.status(500).json({ message: "EPG proxy failed: " + error.message });
  }
});

router.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || typeof targetUrl !== "string") {
    return res.status(400).json({ message: "Missing or invalid URL parameter" });
  }

  try {
    let response: Response;
    try {
      response = await fetchRemote(targetUrl, 120000);
    } catch (fetchErr: any) {
      if (fetchErr.name === "AbortError") {
        return res.status(504).json({ message: "Request timed out." });
      }
      return res.status(502).json({
        message: `Cannot reach server: ${fetchErr.cause?.code || fetchErr.message}.`,
      });
    }

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
    } else if (lowerUrl.includes("xmltv") || lowerUrl.includes("epg")) {
      contentType = "application/xml";
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
