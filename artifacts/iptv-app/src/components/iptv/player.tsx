import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import { useIptvStore } from "@/store/use-iptv-store";
import { X, Maximize, Loader2, WifiOff, RefreshCw, Clock, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { type EpgData, getNowNext, getProgressPercent, formatTime, resolveChannelId } from "@/lib/epg-parser";

function toM3u8(url: string): string {
  if (/\/(live|movie|series)\//i.test(url) && url.endsWith(".ts")) {
    return url.slice(0, -3) + ".m3u8";
  }
  return url;
}

function proxify(url: string): string {
  if (!url || url.startsWith("/")) return url;
  if (url.includes("/api/proxy")) return url;
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

interface PlayerOverlayProps {
  epgData?: EpgData | null;
}

export function PlayerOverlay({ epgData }: PlayerOverlayProps) {
  const playingItem = useIptvStore((state) => state.playingItem);
  const setPlayingItem = useIptvStore((state) => state.setPlayingItem);
  const directMode = useIptvStore((state) => state.directMode);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), 3500);
  }, []);

  useEffect(() => {
    showControls();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [playingItem, showControls]);

  const channelId = playingItem && epgData
    ? resolveChannelId(epgData, playingItem.tvgId || "", playingItem.tvgName || "", playingItem.name)
    : "";
  const { now, next } = channelId ? getNowNext(epgData!, channelId) : { now: null, next: null };
  const progress = getProgressPercent(now);

  useEffect(() => {
    if (!playingItem) {
      const v = videoRef.current;
      if (v) { v.pause(); v.removeAttribute("src"); v.load(); }
      return;
    }

    setIsLoading(true);
    setError(null);
    let hls: Hls | null = null;
    const video = videoRef.current;
    if (!video) return;

    const onCanPlay = () => setIsLoading(false);
    const onError = () => {
      setError("Playback error — the stream may be offline or unsupported.");
      setIsLoading(false);
    };

    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("error", onError);

    const streamUrl = toM3u8(playingItem.url);
    const manifestUrl = directMode ? streamUrl : proxify(streamUrl);

    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 60, maxBufferLength: 45 });
      hls.loadSource(manifestUrl);
      hls.attachMedia(video);

      if (!directMode) {
        hls.on(Hls.Events.LEVEL_LOADED, (_evt, data) => {
          data?.details?.fragments?.forEach((frag: any) => {
            if (!frag.url) return;
            let absUrl = frag.url;
            if (!absUrl.startsWith("http")) {
              try { absUrl = new URL(frag.url, streamUrl).href; } catch { return; }
            }
            if (!absUrl.includes("/api/proxy")) frag.url = proxify(absUrl);
          });
        });
      }

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls?.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls?.recoverMediaError();
        else {
          hls?.destroy();
          setError(`Stream unavailable (${data.details})`);
          setIsLoading(false);
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = manifestUrl;
      video.play().catch(() => {});
    } else {
      setError("HLS is not supported in this browser.");
      setIsLoading(false);
    }

    return () => {
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("error", onError);
      hls?.destroy();
    };
  }, [playingItem, directMode, retryKey]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  };

  return (
    <AnimatePresence>
      {playingItem && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 bg-black"
          onMouseMove={showControls}
          onTouchStart={showControls}
        >
          <div ref={containerRef} className="relative w-full h-full bg-black overflow-hidden">
            {isLoading && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-3">
                <Loader2 className="w-10 h-10 text-primary animate-spin opacity-50" />
                <p className="text-[9px] uppercase tracking-[0.25em] text-slate-600">Connecting...</p>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-6 text-center gap-5">
                <WifiOff className="w-8 h-8 text-red-500/40" />
                <p className="text-white/40 text-xs leading-relaxed max-w-xs uppercase tracking-wider">{error}</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setError(null); setIsLoading(true); setRetryKey((k) => k + 1); }}
                    className="flex items-center gap-2 px-6 py-2 border border-primary/30 hover:border-primary text-primary text-[10px] uppercase tracking-[0.2em] transition-all"
                  >
                    <RefreshCw className="w-3 h-3" /> Retry
                  </button>
                  <button
                    onClick={() => setPlayingItem(null)}
                    className="px-6 py-2 border border-white/10 hover:border-white/30 text-white/50 text-[10px] uppercase tracking-[0.2em] transition-all"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            <video ref={videoRef} className="w-full h-full object-contain" controls autoPlay playsInline />

            <AnimatePresence>
              {controlsVisible && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="absolute top-0 left-0 right-0 z-20"
                >
                  <div className="p-6 bg-gradient-to-b from-black/95 via-black/60 to-transparent pb-16">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <button
                          onClick={() => setPlayingItem(null)}
                          className="w-11 h-11 border border-white/10 hover:border-primary/50 flex items-center justify-center text-white transition-all mt-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <div>
                          <h3 className="text-white font-display font-medium text-2xl uppercase tracking-tighter">
                            {playingItem.name}
                          </h3>
                          <p className="text-primary text-[9px] uppercase tracking-[0.2em] mt-0.5">
                            {playingItem.group}
                          </p>

                          {now && (
                            <div className="mt-3 max-w-md">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[8px] text-primary uppercase tracking-widest border border-primary/30 px-1.5 py-0.5">
                                  LIVE
                                </span>
                                <span className="text-white text-sm font-medium">{now.title}</span>
                              </div>
                              <div className="flex items-center gap-2 mb-2">
                                <Clock className="w-3 h-3 text-slate-500" />
                                <span className="text-[10px] text-slate-400">
                                  {formatTime(now.start)} – {formatTime(now.stop)}
                                </span>
                              </div>
                              {now.description && (
                                <p className="text-slate-500 text-[10px] leading-relaxed line-clamp-2 max-w-sm">
                                  {now.description}
                                </p>
                              )}
                              <div className="mt-2 h-1 w-48 bg-white/10 overflow-hidden">
                                <div
                                  className="h-full bg-primary transition-all duration-1000"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {next && (
                            <div className="mt-3 flex items-center gap-2">
                              <ChevronRight className="w-3 h-3 text-slate-600" />
                              <span className="text-[9px] text-slate-500 uppercase tracking-widest">Next:</span>
                              <span className="text-[10px] text-slate-400">{next.title}</span>
                              <span className="text-[9px] text-slate-600">{formatTime(next.start)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={toggleFullscreen}
                        className="w-11 h-11 border border-white/10 hover:border-primary/50 flex items-center justify-center text-white transition-all mt-1"
                      >
                        <Maximize className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
