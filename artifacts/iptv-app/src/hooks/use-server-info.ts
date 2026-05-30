import { useQuery } from "@tanstack/react-query";
import { type Profile } from "@/lib/types";

export interface ServerInfo {
  username: string;
  status: string;
  expDate: string | null;
  maxConnections: number;
  activeConnections: number;
  isTrial: boolean;
  serverUrl: string;
  serverTimezone: string;
  allowedFormats: string[];
}

export function useServerInfo(profile: Profile | null) {
  return useQuery<ServerInfo>({
    queryKey: ["server-info", profile?.id],
    queryFn: async () => {
      if (!profile || profile.mode !== "xtream" || !profile.serverUrl || !profile.username || !profile.password) {
        throw new Error("Not Xtream profile");
      }
      const srv = profile.serverUrl.replace(/\/$/, "");
      const apiUrl = `${srv}/player_api.php?username=${profile.username}&password=${profile.password}&action=get_server_info`;
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(apiUrl)}`);
      if (!res.ok) throw new Error("Failed");
      const raw = await res.json();

      const user = raw.user_info || {};
      const server = raw.server_info || {};
      const expTs = user.exp_date ? parseInt(user.exp_date) * 1000 : null;
      return {
        username: user.username || profile.username || "",
        status: user.status || "Unknown",
        expDate: expTs ? new Date(expTs).toLocaleDateString() : null,
        maxConnections: parseInt(user.max_connections) || 1,
        activeConnections: parseInt(user.active_cons) || 0,
        isTrial: user.is_trial === "1",
        serverUrl: profile.serverUrl,
        serverTimezone: server.timezone || "UTC",
        allowedFormats: user.allowed_output_formats || [],
      };
    },
    enabled: !!(profile?.mode === "xtream" && profile?.serverUrl),
    staleTime: 1000 * 60 * 5,
    retry: 0,
  });
}
