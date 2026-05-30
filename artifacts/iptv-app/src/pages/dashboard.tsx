import { useMemo, useState } from "react";
import { useIptvStore } from "@/store/use-iptv-store";
import { useIptvPlaylist } from "@/hooks/use-iptv-playlist";
import { useEpg } from "@/hooks/use-epg";
import { Sidebar } from "@/components/iptv/sidebar";
import { MediaCard } from "@/components/iptv/media-card";
import { PlayerOverlay } from "@/components/iptv/player";
import { Search, Loader2, PlaySquare, WifiOff, RefreshCw, ShieldCheck, Globe } from "lucide-react";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const profile = useIptvStore((state) => state.selectedProfile);
  const currentTab = useIptvStore((state) => state.currentTab);
  const searchQuery = useIptvStore((state) => state.searchQuery);
  const setSearchQuery = useIptvStore((state) => state.setSearchQuery);
  const directMode = useIptvStore((state) => state.directMode);
  const setDirectMode = useIptvStore((state) => state.setDirectMode);
  const queryClient = useQueryClient();

  const [displayCount, setDisplayCount] = useState(100);

  const { data: allItems = [], isLoading, error } = useIptvPlaylist(profile);
  const { epgData } = useEpg(profile);

  const filteredItems = useMemo(() => {
    let filtered = allItems;

    if (currentTab === "favorites") {
      const favs = profile?.favorites || [];
      filtered = filtered.filter((item) => favs.includes(item.id));
    } else {
      filtered = filtered.filter((item) => item.type === currentTab);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.group && item.group.toLowerCase().includes(q))
      );
    }

    filtered = [...filtered].sort((a, b) => {
      const gA = (a.group || "").toLowerCase();
      const gB = (b.group || "").toLowerCase();
      if (gA < gB) return -1;
      if (gA > gB) return 1;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    return filtered;
  }, [allItems, currentTab, searchQuery, profile?.favorites]);

  const visibleItems = filteredItems.slice(0, displayCount);

  const counts = useMemo(
    () => ({
      live: allItems.filter((i) => i.type === "live").length,
      movies: allItems.filter((i) => i.type === "movies").length,
      series: allItems.filter((i) => i.type === "series").length,
    }),
    [allItems]
  );

  const tabLabel =
    currentTab === "live" ? "Live TV"
    : currentTab === "movies" ? "Movies"
    : currentTab === "series" ? "Series"
    : "Favorites";

  const toggleDirectMode = () => {
    setDirectMode(!directMode);
    queryClient.invalidateQueries({ queryKey: ["playlist", profile?.id] });
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden font-sans">
      <Sidebar counts={counts} />

      <main className="flex-1 flex flex-col relative h-full min-w-0">
        <header className="h-20 shrink-0 border-b border-border bg-background px-4 sm:px-6 flex items-center gap-3 z-10">
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            <h1 className="text-2xl font-medium font-display text-white uppercase tracking-tighter">
              {tabLabel}
            </h1>
            {!isLoading && allItems.length > 0 && (
              <span className="text-[10px] text-primary uppercase tracking-widest border border-primary/30 px-2 py-0.5">
                {filteredItems.length.toLocaleString()}
              </span>
            )}
            {epgData && currentTab === "live" && (
              <span className="text-[8px] text-green-400 uppercase tracking-widest border border-green-500/20 bg-green-900/10 px-2 py-0.5">
                EPG Active
              </span>
            )}
          </div>

          <div className="relative flex-1 max-w-lg ml-auto">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
            <Input
              placeholder={`Search ${tabLabel}...`}
              className="w-full pl-10 bg-card border-border text-white rounded-none h-10 focus-visible:ring-primary placeholder:text-slate-600 text-sm"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setDisplayCount(100);
              }}
            />
          </div>

          <button
            onClick={toggleDirectMode}
            title={directMode ? "VPN Mode active" : "Server Proxy mode"}
            className={cn(
              "flex items-center gap-2 px-3 h-10 border text-[9px] uppercase tracking-widest font-medium transition-all duration-300 shrink-0",
              directMode
                ? "border-green-500/50 bg-green-900/20 text-green-400 hover:bg-green-900/30"
                : "border-border text-slate-500 hover:border-primary hover:text-white"
            )}
          >
            {directMode ? (
              <><ShieldCheck className="w-3.5 h-3.5" /><span className="hidden sm:inline">VPN</span></>
            ) : (
              <><Globe className="w-3.5 h-3.5" /><span className="hidden sm:inline">Proxy</span></>
            )}
          </button>

          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["playlist", profile?.id] })}
            className="p-2.5 border border-border hover:border-primary text-slate-600 hover:text-primary transition-all shrink-0"
            title="Refresh playlist"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </header>

        {directMode && (
          <div className="bg-green-900/10 border-b border-green-500/20 px-6 py-2 flex items-center gap-2">
            <ShieldCheck className="w-3 h-3 text-green-400 shrink-0" />
            <p className="text-[9px] text-green-400 uppercase tracking-widest">
              VPN Direct Mode — playlist &amp; streams fetched directly from your browser.
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary opacity-40" />
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600">Loading {tabLabel}...</p>
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto gap-4">
              <div className="w-16 h-16 border border-red-500/20 flex items-center justify-center">
                <WifiOff className="w-7 h-7 text-red-500/60" />
              </div>
              <h2 className="text-xl font-medium text-white font-display uppercase tracking-tight">Connection Failed</h2>
              <p className="text-slate-500 text-xs leading-relaxed border border-border bg-card p-4">
                {(error as Error).message}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["playlist", profile?.id] })}
                  className="px-6 py-2.5 border border-border hover:border-primary text-slate-400 hover:text-white text-[10px] uppercase tracking-widest transition-all flex items-center gap-2"
                >
                  <RefreshCw className="w-3 h-3" /> Retry
                </button>
              </div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <div className="w-16 h-16 border border-border flex items-center justify-center">
                {allItems.length === 0 ? <PlaySquare className="w-6 h-6 text-slate-700" /> : <Search className="w-6 h-6 text-slate-700" />}
              </div>
              <h2 className="text-lg font-medium text-white font-display uppercase tracking-tight">
                {allItems.length === 0 ? "No content loaded" : "No results"}
              </h2>
              <p className="text-slate-600 text-[10px] uppercase tracking-[0.15em] max-w-xs">
                {searchQuery ? "Try a different search term" : allItems.length === 0 ? "The playlist loaded but contains no items" : `No ${tabLabel} found`}
              </p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 pb-20"
            >
              {visibleItems.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  isFavorite={(profile?.favorites || []).includes(item.id)}
                  epgData={currentTab === "live" ? epgData : null}
                />
              ))}

              {filteredItems.length > displayCount && (
                <div className="col-span-full flex flex-col items-center gap-2 mt-8 pb-8">
                  <p className="text-[9px] text-slate-600 uppercase tracking-widest">
                    Showing {displayCount} of {filteredItems.length.toLocaleString()}
                  </p>
                  <button
                    onClick={() => setDisplayCount((p) => p + 200)}
                    className="px-10 py-3 border border-border hover:border-primary text-white text-[10px] font-bold uppercase tracking-[0.25em] transition-all duration-300 hover:bg-primary/5"
                  >
                    Load More
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </main>

      <PlayerOverlay epgData={epgData} />
    </div>
  );
}
