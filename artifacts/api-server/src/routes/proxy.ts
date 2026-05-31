import { Router } from "express";

const router = Router();

const epgCache = new Map<string, { data: Buffer; contentType: string; fetchedAt: number }>();
const EPG_TTL = 60 * 60 * 1000;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/110.0.0.0 Safari/537.36",
  Accept: "*/*",
  Connection: "keep-alive",
};

async function fetchRemote(url: string, options: RequestInit = {}, timeoutMs = 30000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...HEADERS,
        ...(options.headers as Record<string, string> || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function rewriteManifestUrls(manifest: string, baseUrl: string): string {
  const lines = manifest.split("\n");
  const rewritten: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      rewritten.push(line);
      continue;
    }

    let absUrl: string;
    try {
      absUrl = new URL(trimmed, baseUrl).href;
    } catch {
      rewritten.push(line);
      continue;
    }

    if (absUrl.includes("/api/proxy")) {
      rewritten.push(line);
    } else {
      rewritten.push(line.replace(trimmed, `/api/proxy?url=${encodeURIComponent(absUrl)}`));
    }
  }

  return rewritten.join("\n");
}

router.post("/upload-m3u", async (_req, res) => {
  try {
    const chunks: Buffer[] = [];
    _req.on("data", (chunk: Buffer) => chunks.push(chunk));
    _req.on("end", () => {
      try {
        const content = Buffer.concat(chunks).toString("utf-8").replace(/^\uFEFF/, "");
        if (!content.includes("#EXTINF") && !content.includes("#EXTM3U")) {
          res.status(400).json({ message: "File does not appear to be a valid M3U playlist" });
          return;
        }
        const entryCount = (content.match(/#EXTINF/g) || []).length;
        res.status(200).json({ success: true, content, entryCount });
      } catch (err: any) {
        res.status(500).json({ message: "Failed to process file: " + err.message });
      }
    });
    _req.on("error", (err) => {
      res.status(500).json({ message: "Upload failed: " + err.message });
    });
  } catch (error: any) {
    res.status(500).json({ message: "Upload error: " + error.message });
  }
});

router.get("/epg", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || typeof targetUrl !== "string") {
    res.status(400).json({ message: "Missing url parameter" });
    return;
  }

  const cached = epgCache.get(targetUrl);
  if (cached && Date.now() - cached.fetchedAt < EPG_TTL) {
    res.setHeader("Content-Type", cached.contentType);
    res.setHeader("X-EPG-Cached", "true");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.status(200).send(cached.data);
    return;
  }

  try {
    let response: Response;
    try {
      response = await fetchRemote(targetUrl, {}, 30000);
    } catch (fetchErr: any) {
      if (fetchErr.name === "AbortError") {
        res.status(504).json({ message: "EPG request timed out" });
        return;
      }
      res.status(502).json({ message: `Cannot reach EPG server: ${fetchErr.message}` });
      return;
    }

    if (!response.ok) {
      res.status(502).json({ message: `EPG server responded with ${response.status}` });
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type") || "application/xml";

    epgCache.set(targetUrl, { data: buffer, contentType, fetchedAt: Date.now() });

    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-EPG-Cached", "false");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.status(200).send(buffer);
  } catch (error: any) {
    res.status(500).json({ message: "EPG proxy failed: " + error.message });
  }
});

router.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || typeof targetUrl !== "string") {
    res.status(400).json({ message: "Missing or invalid URL parameter" });
    return;
  }

  const lowerUrl = targetUrl.toLowerCase();
  const isManifest = lowerUrl.includes(".m3u") || lowerUrl.includes(".m3u8") || lowerUrl.includes("playlist");
  const isVideo = lowerUrl.includes(".ts") || lowerUrl.includes(".aac") || lowerUrl.includes(".ac3") || lowerUrl.includes(".mp4") || lowerUrl.includes(".mkv") || lowerUrl.includes(".avi") || lowerUrl.includes(".flv") || lowerUrl.includes(".webm") || lowerUrl.includes(".m4v");

  try {
    const fetchOptions: RequestInit = {};
    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      fetchOptions.headers = { Range: rangeHeader };
    }

    let response: Response;
    try {
      response = await fetchRemote(targetUrl, fetchOptions, isManifest ? 30000 : 60000);
    } catch (fetchErr: any) {
      if (fetchErr.name === "AbortError") {
        res.status(504).json({ message: "Request timed out." });
        return;
      }
      res.status(502).json({
        message: `Cannot reach server: ${fetchErr.cause?.code || fetchErr.message}.`,
      });
      return;
    }

    if (!response.ok) {
      res.status(502).json({
        message: `Server responded with error ${response.status}. Check your URL or credentials.`,
      });
      return;
    }

    let contentType = response.headers.get("content-type") || "application/octet-stream";

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Expose-Headers", "*");

    const acceptRanges = response.headers.get("accept-ranges");
    if (acceptRanges) {
      res.setHeader("Accept-Ranges", acceptRanges);
    }

    const contentRange = response.headers.get("content-range");
    if (contentRange) {
      res.setHeader("Content-Range", contentRange);
    }

    if (isManifest) {
      contentType = lowerUrl.includes(".m3u8") ? "application/vnd.apple.mpegurl" : "application/x-mpegurl";
      const text = await response.text();
      const rewritten = rewriteManifestUrls(text, targetUrl);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.status(200).send(rewritten);
      return;
    }

    if (isVideo) {
      contentType = lowerUrl.includes(".ts") ? "video/mp2t" : contentType;
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Transfer-Encoding", "chunked");
      res.status(response.status);

      if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
          res.end();
        } catch (err) {
          res.destroy();
        }
        return;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      res.setHeader("Content-Length", buffer.length);
      res.end(buffer);
      return;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", buffer.length);
    res.status(200).send(buffer);
  } catch (error: any) {
    res.status(500).json({ message: "Proxy request failed: " + error.message });
  }
});

export default router;
