import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import { useIptvStore } from "@/store/use-iptv-store";
import { X, Maximize, Loader2, WifiOff, RefreshCw, Clock, ChevronRight, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { type EpgData, getNowNext, getProgressPercent, formatTime, resolveChannelId } from "@/lib/epg-parser";

function isHlsUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes(".m3u") || lower.includes(".m3u8") || lower.includes(".ts") || (/(live|movie|series)\//.test(lower) && !lower.match(/\.(mp4|mkv|avi|flv|webm|m4v)$/));
}

function isDirectVideo(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.match(/\.(mp4|mkv|avi|flv|webm|m4v)$/) !== null;
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
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
  const epgProgress = getProgressPercent(now);

  const isVod = playingItem?.type === "movies" || playingItem?.type === "series";
  const vodProgress = duration > 0 ? (currentTime / duration) * 100 : 0;

  useEffect(() => {
    if (!playingItem) {
      const v = videoRef.current;
      if (v) { v.pause(); v.removeAttribute("src"); v.load(); }
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setBuffered(0);
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsPlaying(false);
    let hls: Hls | null = null;
    const video = videoRef.current;
    if (!video) return;

    const onCanPlay = () => setIsLoading(false);
    const onError = () => {
      setError("Playback error — the stream may be offline or unsupported.");
      setIsLoading(false);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      setDuration(video.duration || 0);
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onVolumeChange = () => setIsMuted(video.muted);
    const onWaiting = () => setIsLoading(true);
    const onPlaying = () => setIsLoading(false);

    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("error", onError);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);

    const streamUrl = playingItem.url;
    const videoUrl = directMode ? streamUrl : proxify(streamUrl);

    if (isHlsUrl(streamUrl) && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60,
        maxBufferLength: 45,
        maxMaxBufferLength: 120,
        manifestLoadingMaxRetry: 4,
        manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 4,
        levelLoadingRetryDelay: 1000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 1000,
      });

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        hls?.loadSource(videoUrl);
      });
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
        setIsLoading(false);
        if (data.levels.length > 0 && data.levels[0].details?.fragments) {
          setDuration(data.levels[0].details.totalduration || 0);
        }
        video.play().catch(() => {
          video.muted = true;
          setIsMuted(true);
          video.play().catch(() => {});
        });
      });

      hls.on(Hls.Events.LEVEL_LOADED, (_evt, data) => {
        if (data?.details?.totalduration) {
          setDuration(data.details.totalduration);
        }
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) {
          if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR) {
            console.warn("HLS fragment load error, retrying...");
          }
          return;
        }
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          console.warn("HLS network error, attempting recovery...");
          hls?.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          console.warn("HLS media error, attempting recovery...");
          hls?.recoverMediaError();
        } else {
          hls?.destroy();
          setError(`Stream unavailable (${data.details})`);
          setIsLoading(false);
        }
      });
    } else if (isDirectVideo(streamUrl)) {
      video.src = videoUrl;
      video.play().catch(() => {
        video.muted = true;
        setIsMuted(true);
        video.play().catch(() => {});
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = videoUrl;
      video.play().catch(() => {
        video.muted = true;
        setIsMuted(true);
        video.play().catch(() => {});
      });
    } else {
      setError("This stream format is not supported in this browser.");
      setIsLoading(false);
    }

    return () => {
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("error", onError);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      hls?.destroy();
    };
  }, [playingItem, directMode, retryKey]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!playingItem) return;
      const video = videoRef.current;
      if (!video) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          if (video.paused) video.play().catch(() => {});
          else video.pause();
          break;
        case "Escape":
          setPlayingItem(null);
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        case "ArrowRight":
          if (video.duration) {
            video.currentTime = Math.min(video.duration, video.currentTime + 10);
          }
          break;
        case "ArrowLeft":
          video.currentTime = Math.max(0, video.currentTime - 10);
          break;
        case "ArrowUp":
          video.volume = Math.min(1, video.volume + 0.1);
          break;
        case "ArrowDown":
          video.volume = Math.max(0, video.volume - 0.1);
          break;
        case "m":
        case "M":
          video.muted = !video.muted;
          setIsMuted(video.muted);
          break;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [playingItem, setPlayingItem]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = pct * video.duration;
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
                {buffered > 0 && duration > 0 && (
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest">
                    Buffered {Math.round((buffered / duration) * 100)}%
                  </p>
                )}
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

            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              autoPlay
              playsInline
              muted={isMuted}
              onClick={togglePlay}
            />

            {/* Bottom controls bar */}
            <AnimatePresence>
              {controlsVisible && !error && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.2 }}
                  className="absolute bottom-0 left-0 right-0 z-20"
                >
                  <div className="p-6 bg-gradient-to-t from-black/95 via-black/60 to-transparent">
                    {isVod && duration > 0 && (
                      <div className="mb-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-slate-400 tabular-nums">
                            {formatDuration(currentTime)}
                          </span>
                          <div className="flex-1 h-1 bg-white/10 cursor-pointer group" onClick={handleSeek}>
                            <div className="h-full bg-primary relative" style={{ width: `${vodProgress}%` }}>
                              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-400 tabular-nums">
                            {formatDuration(duration)}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button onClick={togglePlay} className="w-10 h-10 border border-white/10 hover:border-primary flex items-center justify-center text-white transition-all">
                          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                        </button>
                        <button onClick={toggleMute} className="w-10 h-10 border border-white/10 hover:border-primary flex items-center justify-center text-white transition-all">
                          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={toggleFullscreen} className="w-10 h-10 border border-white/10 hover:border-primary flex items-center justify-center text-white transition-all">
                          <Maximize className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Top info bar */}
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
                                  style={{ width: `${epgProgress}%` }}
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

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
