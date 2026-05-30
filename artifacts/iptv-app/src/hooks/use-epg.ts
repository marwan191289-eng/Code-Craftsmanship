import { useQuery } from "@tanstack/react-query";
import { type Profile } from "@/lib/types";
import { parseEpgXml, type EpgData } from "@/lib/epg-parser";

function buildEpgUrl(profile: Profile): string | null {
  if (profile.epgUrl) return profile.epgUrl;
  if (profile.mode === "xtream" && profile.serverUrl && profile.username && profile.password) {
    const srv = profile.serverUrl.replace(/\/$/, "");
    return `${srv}/xmltv.php?username=${profile.username}&password=${profile.password}`;
  }
  return null;
}

export function useEpg(profile: Profile | null): { epgData: EpgData | null; isLoading: boolean } {
  const epgUrl = profile ? buildEpgUrl(profile) : null;

  const { data, isLoading } = useQuery<EpgData>({
    queryKey: ["epg", profile?.id],
    queryFn: async () => {
      if (!epgUrl) throw new Error("No EPG URL");
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(epgUrl)}`);
      if (!res.ok) throw new Error("Failed to fetch EPG");
      const text = await res.text();
      if (!text.includes("<tv")) throw new Error("Invalid EPG");
      return parseEpgXml(text);
    },
    enabled: !!epgUrl,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 90,
    retry: 1,
  });

  return { epgData: data ?? null, isLoading };
}
