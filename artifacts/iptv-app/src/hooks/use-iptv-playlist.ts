import { useQuery } from "@tanstack/react-query";
import { type Profile } from "@/lib/types";
import { parseM3U } from "@/lib/m3u-parser";
import { useIptvStore } from "@/store/use-iptv-store";

export function normalizeServerUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && u.port === "80") {
      u.protocol = "http:";
      u.port = "";
    } else if (u.protocol === "http:" && u.port === "443") {
      u.protocol = "https:";
      u.port = "";
    }
    return u.toString().replace(/\/$/, "");
  } catch {
    return url.replace(/\/$/, "");
  }
}

export function buildM3uUrl(profile: Profile): string | null {
  if (profile.m3uUrl) return profile.m3uUrl;
  if (profile.mode === "xtream" && profile.serverUrl && profile.username && profile.password) {
    const srv = normalizeServerUrl(profile.serverUrl);
    return `${srv}/get.php?username=${profile.username}&password=${profile.password}&type=m3u_plus&output=m3u8`;
  }
  return null;
}

async function fetchViaProxy(m3uUrl: string): Promise<string> {
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(m3uUrl)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
    throw new Error(errorData.message || `Failed to load playlist (${res.status})`);
  }
  return res.text();
}

async function fetchDirect(m3uUrl: string): Promise<string> {
  const res = await fetch(m3uUrl, { headers: { Accept: "*/*" }, mode: "cors" });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return res.text();
}

export function useIptvPlaylist(profile: Profile | null) {
  const directMode = useIptvStore((state) => state.directMode);
  const setDirectMode = useIptvStore((state) => state.setDirectMode);

  return useQuery({
    queryKey: ["playlist", profile?.id, directMode],
    queryFn: async () => {
      if (!profile) return [];

      if (profile.m3uContent && profile.m3uContent.trim()) {
        return parseM3U(profile.m3uContent);
      }

      const m3uUrl = buildM3uUrl(profile);
      if (!m3uUrl) throw new Error("Playlist URL is not configured.");

      let text: string;

      if (directMode) {
        try {
          text = await fetchDirect(m3uUrl);
        } catch (err: any) {
          const isCorsIssue =
            err instanceof TypeError ||
            err.message?.toLowerCase().includes("cors") ||
            err.message?.toLowerCase().includes("failed to fetch") ||
            err.message?.toLowerCase().includes("network");

          if (isCorsIssue) {
            setDirectMode(false);
            text = await fetchViaProxy(m3uUrl);
          } else {
            throw new Error(`Direct connection failed: ${err.message}`);
          }
        }
      } else {
        text = await fetchViaProxy(m3uUrl);
      }

      if (!text.trim() || (!text.includes("#EXTM3U") && !text.includes("#EXTINF"))) {
        throw new Error("The server returned an invalid or empty playlist. Check your credentials.");
      }

      return parseM3U(text);
    },
    enabled: !!profile,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 2,
    retry: 0,
  });
}
