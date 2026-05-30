import { useState } from "react";
import { Heart, Play, Clock } from "lucide-react";
import { type PlaylistItem } from "@/lib/m3u-parser";
import { useIptvStore } from "@/store/use-iptv-store";
import { useUpdateProfile } from "@/hooks/use-profiles";
import { type EpgData, getNowNext, getProgressPercent, formatTime, resolveChannelId } from "@/lib/epg-parser";
import { cn } from "@/lib/utils";

interface MediaCardProps {
  item: PlaylistItem;
  isFavorite: boolean;
  epgData?: EpgData | null;
}

export function MediaCard({ item, isFavorite, epgData }: MediaCardProps) {
  const setPlayingItem = useIptvStore((state) => state.setPlayingItem);
  const profile = useIptvStore((state) => state.selectedProfile);
  const updateProfile = useUpdateProfile();
  const [logoFailed, setLogoFailed] = useState(false);
  const [logoProxyFailed, setLogoProxyFailed] = useState(false);

  const toggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!profile) return;
    const currentFavs = profile.favorites || [];
    const newFavs = isFavorite
      ? currentFavs.filter((id) => id !== item.id)
      : [...currentFavs, item.id];
    updateProfile.mutate({ id: profile.id, favorites: newFavs });
  };

  const showLogo = item.logo && !logoProxyFailed;
  const logoSrc =
    item.logo && logoFailed ? `/api/proxy?url=${encodeURIComponent(item.logo)}` : item.logo;

  const initials = item.name.replace(/^\W+/, "").substring(0, 2).toUpperCase() || "??";

  const channelId = epgData ? resolveChannelId(epgData, item.tvgId, item.tvgName, item.name) : "";
  const { now } = channelId ? getNowNext(epgData!, channelId) : { now: null };
  const progress = getProgressPercent(now);

  return (
    <div
      onClick={() => setPlayingItem(item)}
      className="group relative flex flex-col bg-card border border-border rounded-none overflow-hidden cursor-pointer hover:border-primary transition-all duration-300"
    >
      <div className="relative aspect-video bg-black/60 w-full overflow-hidden flex items-center justify-center">
        {showLogo ? (
          <img
            src={logoSrc || ""}
            alt={item.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain p-3 opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
            onError={() => {
              if (!logoFailed) setLogoFailed(true);
              else setLogoProxyFailed(true);
            }}
          />
        ) : (
          <span className="text-3xl font-light text-slate-700 font-display select-none">
            {initials}
          </span>
        )}

        <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="w-10 h-10 bg-primary/90 flex items-center justify-center">
            <Play className="w-4 h-4 text-black fill-black ml-0.5" />
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/70 backdrop-blur-sm">
          <p className="text-[7px] text-slate-400 uppercase tracking-widest truncate">
            {item.group}
          </p>
        </div>

        <button
          onClick={toggleFavorite}
          className="absolute top-2 right-2 p-1.5 rounded-none bg-black/60 hover:bg-primary/20 transition-colors z-10 border border-white/10 opacity-0 group-hover:opacity-100"
        >
          <Heart
            className={cn(
              "w-3 h-3 transition-colors",
              isFavorite ? "fill-primary text-primary" : "text-slate-400"
            )}
          />
        </button>
      </div>

      <div className="px-3 pt-2.5 pb-1.5 bg-card border-t border-border/50 flex flex-col gap-1">
        <h3 className="text-white font-medium text-[11px] line-clamp-1 uppercase tracking-tight group-hover:text-primary transition-colors leading-tight">
          {item.name}
        </h3>

        {now && (
          <div className="space-y-1">
            <p className="text-[9px] text-slate-400 line-clamp-1 leading-tight">{now.title}</p>
            <div className="flex items-center gap-1.5">
              <Clock className="w-2.5 h-2.5 text-slate-600 shrink-0" />
              <span className="text-[8px] text-slate-600 tabular-nums">
                {formatTime(now.start)}–{formatTime(now.stop)}
              </span>
            </div>
            <div className="h-px w-full bg-border overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-1000"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
