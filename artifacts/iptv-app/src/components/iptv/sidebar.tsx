import { useIptvStore } from "@/store/use-iptv-store";
import { Tv, Film, Clapperboard, Heart, LogOut, Signal, Calendar, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useServerInfo } from "@/hooks/use-server-info";

interface SidebarProps {
  counts?: {
    live: number;
    movies: number;
    series: number;
  };
}

export function Sidebar({ counts }: SidebarProps) {
  const currentTab = useIptvStore((state) => state.currentTab);
  const setCurrentTab = useIptvStore((state) => state.setCurrentTab);
  const setSelectedProfile = useIptvStore((state) => state.setSelectedProfile);
  const profile = useIptvStore((state) => state.selectedProfile);

  const { data: serverInfo } = useServerInfo(profile);

  const navItems = [
    { id: "live", label: "Live TV", icon: Tv, count: counts?.live },
    { id: "movies", label: "Movies", icon: Film, count: counts?.movies },
    { id: "series", label: "Series", icon: Clapperboard, count: counts?.series },
    { id: "favorites", label: "Favorites", icon: Heart, count: undefined },
  ] as const;

  const profileMode = profile?.m3uContent ? "FILE" : profile?.mode?.toUpperCase() ?? "";

  const statusColor =
    serverInfo?.status?.toLowerCase() === "active"
      ? "text-green-400"
      : serverInfo?.status
      ? "text-red-400"
      : "text-slate-600";

  return (
    <div className="w-20 md:w-64 h-screen bg-background border-r border-border flex flex-col justify-between py-8 shrink-0 transition-all duration-500">
      <div className="flex flex-col items-center md:items-start w-full px-6">
        <div className="flex items-center gap-3 mb-12 w-full justify-center md:justify-start">
          <Tv className="w-8 h-8 text-primary shrink-0" />
          <h2 className="hidden md:block font-display font-medium text-2xl tracking-tighter text-white whitespace-nowrap uppercase">
            MARWAN
          </h2>
        </div>

        <nav className="w-full space-y-1">
          {navItems.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={cn(
                  "w-full flex items-center justify-center md:justify-start gap-4 px-3 py-4 md:py-3 transition-all duration-300 group relative",
                  isActive ? "text-primary" : "text-slate-500 hover:text-white"
                )}
                title={item.label}
              >
                <item.icon
                  className={cn(
                    "w-5 h-5 shrink-0 transition-transform duration-300 group-hover:scale-110",
                    isActive && "text-primary"
                  )}
                />
                <span
                  className={cn(
                    "hidden md:flex md:flex-1 items-center justify-between font-medium transition-colors uppercase text-[10px] tracking-[0.1em]",
                    isActive ? "text-primary font-semibold" : ""
                  )}
                >
                  {item.label}
                  {typeof item.count === "number" && item.count > 0 && (
                    <span
                      className={cn(
                        "text-[8px] tracking-wider px-1.5 py-0.5 border",
                        isActive ? "border-primary/40 text-primary" : "border-border text-slate-700"
                      )}
                    >
                      {item.count > 9999 ? `${Math.floor(item.count / 1000)}K` : item.count}
                    </span>
                  )}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute inset-0 bg-primary/5 border-r-2 border-primary"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="px-6 space-y-4">
        {serverInfo && (
          <div className="hidden md:block border border-border bg-card/50 p-3 space-y-2">
            <p className="text-[8px] uppercase tracking-[0.2em] text-slate-600 mb-2">Server Info</p>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Signal className="w-3 h-3 text-slate-600" />
                <span className="text-[9px] text-slate-500 uppercase tracking-wider">Status</span>
              </div>
              <span className={cn("text-[9px] font-medium uppercase tracking-wider", statusColor)}>
                {serverInfo.status}
              </span>
            </div>

            {serverInfo.expDate && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3 h-3 text-slate-600" />
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider">Expires</span>
                </div>
                <span className="text-[9px] text-white tabular-nums">{serverInfo.expDate}</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wifi className="w-3 h-3 text-slate-600" />
                <span className="text-[9px] text-slate-500 uppercase tracking-wider">Connections</span>
              </div>
              <span className="text-[9px] text-white tabular-nums">
                {serverInfo.activeConnections}/{serverInfo.maxConnections}
              </span>
            </div>

            {serverInfo.isTrial && (
              <div className="border border-amber-500/20 bg-amber-900/10 px-2 py-1 mt-1">
                <p className="text-[8px] text-amber-400 uppercase tracking-widest text-center">Trial Account</p>
              </div>
            )}
          </div>
        )}

        <div className="hidden md:block">
          <div className="px-4 py-3 border border-border flex items-center gap-3 bg-card/50">
            <div className="w-8 h-8 border border-primary/30 text-primary flex items-center justify-center font-light text-sm">
              {profile?.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-[10px] text-white font-medium truncate uppercase tracking-tight">
                {profile?.name}
              </p>
              <p className="text-[8px] text-primary uppercase tracking-widest">{profileMode}</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setSelectedProfile(null)}
          className="w-full flex items-center justify-center md:justify-start gap-4 px-3 py-3 text-slate-500 hover:text-red-500 transition-colors uppercase text-[10px] tracking-widest"
          title="Switch Profile"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          <span className="hidden md:block font-medium">Exit</span>
        </button>
      </div>
    </div>
  );
}
