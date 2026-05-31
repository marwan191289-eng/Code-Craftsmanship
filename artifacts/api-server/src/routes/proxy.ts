import { Router } from "express";

const router = Router();

interface CacheEntry { data: Buffer; contentType: string; fetchedAt: number }

const epgCache = new Map<string, CacheEntry>();
const playlistCache = new Map<string, CacheEntry>();
const manifestCache = new Map<string, CacheEntry>();

const EPG_TTL       = 60 * 60 * 1000;
const PLAYLIST_TTL  = 5  * 60 * 1000;
const MANIFEST_TTL  = 20 * 1000;

const BASE_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
  "Accept": "*/*",
  "Accept-Encoding": "gzip, deflate",
  "Connection": "keep-alive",
};

async function fetchRemote(url: string, options: RequestInit = {}, timeoutMs = 30000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...BASE_HEADERS,
        ...(options.headers as Record<string, string> || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function getCached(cache: Map<string, CacheEntry>, key: string, ttl: number): CacheEntry | null {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < ttl) return hit;
  return null;
}

function sendCached(res: import("express").Response, entry: CacheEntry, cached: boolean): void {
  res.setHeader("Content-Type", entry.contentType);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-Cache", cached ? "HIT" : "MISS");
  res.setHeader("Cache-Control", "no-cache");
  res.status(200).send(entry.data);
}

function rewriteManifestUrls(manifest: string, baseUrl: string): string {
  const lines = manifest.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }
    let absUrl: string;
    try {
      absUrl = new URL(trimmed, baseUrl).href;
    } catch {
      out.push(line);
      continue;
    }
    if (absUrl.includes("/api/proxy")) {
      out.push(line);
    } else {
      out.push(line.replace(trimmed, `/api/proxy?url=${encodeURIComponent(absUrl)}`));
    }
  }
  return out.join("\n");
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

  const cached = getCached(epgCache, targetUrl, EPG_TTL);
  if (cached) { sendCached(res, cached, true); return; }

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
    const data = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type") || "application/xml";
    const entry: CacheEntry = { data, contentType, fetchedAt: Date.now() };
    epgCache.set(targetUrl, entry);
    sendCached(res, entry, false);
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

  const isPlaylist =
    lowerUrl.includes("get.php") ||
    lowerUrl.includes("type=m3u") ||
    (lowerUrl.endsWith(".m3u") && !lowerUrl.includes(".m3u8"));

  const isManifest =
    !isPlaylist &&
    (lowerUrl.includes(".m3u8") || lowerUrl.includes("playlist.m3u8") || lowerUrl.includes("index.m3u8"));

  const isVideo =
    lowerUrl.endsWith(".ts") || lowerUrl.includes(".ts?") ||
    lowerUrl.endsWith(".aac") || lowerUrl.endsWith(".ac3") ||
    lowerUrl.endsWith(".mp4") || lowerUrl.endsWith(".mkv") ||
    lowerUrl.endsWith(".avi") || lowerUrl.endsWith(".flv") ||
    lowerUrl.endsWith(".webm") || lowerUrl.endsWith(".m4v");

  if (isPlaylist) {
    const cached = getCached(playlistCache, targetUrl, PLAYLIST_TTL);
    if (cached) { sendCached(res, cached, true); return; }
  }

  if (isManifest) {
    const cached = getCached(manifestCache, targetUrl, MANIFEST_TTL);
    if (cached) { sendCached(res, cached, true); return; }
  }

  try {
    const fetchOptions: RequestInit = {};
    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      fetchOptions.headers = { Range: rangeHeader };
    }

    let response: Response;
    try {
      const timeout = isVideo ? 60000 : isPlaylist ? 45000 : 30000;
      response = await fetchRemote(targetUrl, fetchOptions, timeout);
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
    if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);

    const contentRange = response.headers.get("content-range");
    if (contentRange) res.setHeader("Content-Range", contentRange);

    if (isPlaylist) {
      const text = await response.text();
      const data = Buffer.from(text, "utf-8");
      const ct = "application/x-mpegurl";
      const entry: CacheEntry = { data, contentType: ct, fetchedAt: Date.now() };
      playlistCache.set(targetUrl, entry);
      sendCached(res, entry, false);
      return;
    }

    if (isManifest) {
      contentType = "application/vnd.apple.mpegurl";
      const text = await response.text();
      const rewritten = rewriteManifestUrls(text, targetUrl);
      const data = Buffer.from(rewritten, "utf-8");
      const entry: CacheEntry = { data, contentType, fetchedAt: Date.now() };
      manifestCache.set(targetUrl, entry);
      sendCached(res, entry, false);
      return;
    }

    if (isVideo) {
      contentType = lowerUrl.includes(".ts") ? "video/mp2t" : contentType;
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-cache");
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
        } catch {
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
    res.setHeader("Cache-Control", "no-cache");
    res.status(200).send(buffer);
  } catch (error: any) {
    res.status(500).json({ message: "Proxy request failed: " + error.message });
  }
});

export default router;
