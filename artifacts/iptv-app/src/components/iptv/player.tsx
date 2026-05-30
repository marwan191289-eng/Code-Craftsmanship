import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { useIptvStore } from "@/store/use-iptv-store";
import { X, Maximize, Loader2, WifiOff, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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

export function PlayerOverlay() {
  const playingItem = useIptvStore((state) => state.playingItem);
  const setPlayingItem = useIptvStore((state) => state.setPlayingItem);
  const directMode = useIptvStore((state) => state.directMode);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!playingItem) {
      const v = videoRef.current;
      if (v) {
        v.pause();
        v.removeAttribute("src");
        v.load();
      }
      return;
    }

    setIsLoading(true);
    setError(null);
    let hls: Hls | null = null;

    const video = videoRef.current;
    if (!video) return;

    const onCanPlay = () => setIsLoading(false);
    const onError = () => {
      setError("Playback error — the stream may be offline or in an unsupported format.");
      setIsLoading(false);
    };

    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("error", onError);

    const streamUrl = toM3u8(playingItem.url);
    const manifestUrl = directMode ? streamUrl : proxify(streamUrl);

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60,
        maxBufferLength: 45,
        xhrSetup: (xhr: XMLHttpRequest) => {
          xhr.withCredentials = false;
        },
      });

      hls.loadSource(manifestUrl);
      hls.attachMedia(video);

      if (!directMode) {
        hls.on(Hls.Events.LEVEL_LOADED, (_evt, data) => {
          const frags = data?.details?.fragments;
          if (!frags) return;
          frags.forEach((frag: any) => {
            if (!frag.url) return;
            let absUrl = frag.url;
            if (!absUrl.startsWith("http")) {
              try {
                absUrl = new URL(frag.url, streamUrl).href;
              } catch {
                return;
              }
            }
            if (!absUrl.includes("/api/proxy")) {
              frag.url = proxify(absUrl);
            }
          });
        });
      }

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {
          video.muted = true;
          video.play().catch(() => {});
        });
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls?.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls?.recoverMediaError();
        } else {
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
        >
          <div ref={containerRef} className="relative w-full h-full bg-black overflow-hidden">
            {isLoading && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-3">
                <Loader2 className="w-10 h-10 text-primary animate-spin opacity-50" />
                <p className="text-[9px] uppercase tracking-[0.25em] text-slate-600">
                  Connecting...
                </p>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-6 text-center gap-5">
                <WifiOff className="w-8 h-8 text-red-500/40" />
                <p className="text-white/40 text-xs font-light leading-relaxed max-w-xs uppercase tracking-wider">
                  {error}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setError(null);
                      setIsLoading(true);
                      setRetryKey((k) => k + 1);
                    }}
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

            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              controls
              autoPlay
              playsInline
            />

            <div className="absolute top-0 left-0 right-0 p-6 bg-gradient-to-b from-black/90 to-transparent flex items-start justify-between opacity-0 hover:opacity-100 transition-opacity z-20">
              <div className="flex items-start gap-4">
                <button
                  onClick={() => setPlayingItem(null)}
                  className="w-11 h-11 border border-white/10 hover:border-primary/50 flex items-center justify-center text-white transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="pt-2">
                  <h3 className="text-white font-display font-medium text-xl uppercase tracking-tighter">
                    {playingItem.name}
                  </h3>
                  <p className="text-primary text-[9px] uppercase tracking-[0.2em] mt-1">
                    {playingItem.group}
                  </p>
                </div>
              </div>
              <button
                onClick={toggleFullscreen}
                className="w-11 h-11 border border-white/10 hover:border-primary/50 flex items-center justify-center text-white transition-all"
              >
                <Maximize className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
