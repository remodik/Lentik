"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Pause, Play, Volume2, VolumeX, X } from "lucide-react";

export type LightboxMedia = {
  kind: "image" | "video";
  url: string;
  fileName: string;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CustomVideoPlayer({
  src,
  className,
  poster,
  autoPlay,
}: {
  src: string;
  className?: string;
  poster?: string;
  autoPlay?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    if (v.buffered.length > 0) {
      setBuffered(v.buffered.end(v.buffered.length - 1));
    }
  };

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const next = Number(e.target.value);
    v.currentTime = next;
    setCurrentTime(next);
  };

  const onVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    setVolume(next);
    setMuted(next === 0);
    if (videoRef.current) {
      videoRef.current.volume = next;
      videoRef.current.muted = next === 0;
    }
  };

  const toggleFullscreen = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void wrap.requestFullscreen?.();
    }
  };

  const onPointerMove = () => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 2200);
  };

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={wrapRef}
      className={`relative group/player rounded-xl overflow-hidden bg-black select-none ${className ?? ""}`}
      onMouseMove={onPointerMove}
      onMouseLeave={() => playing && setShowControls(false)}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={() => {
          if (videoRef.current) setDuration(videoRef.current.duration || 0);
        }}
        onVolumeChange={() => {
          if (videoRef.current) {
            setVolume(videoRef.current.volume);
            setMuted(videoRef.current.muted);
          }
        }}
        className="block w-full h-full object-contain bg-black cursor-pointer"
      />

      {/* Большая центральная Play-кнопка, когда видео на паузе */}
      {!playing && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Воспроизвести"
          className="absolute inset-0 grid place-items-center bg-black/30 transition-opacity"
        >
          <span className="w-16 h-16 rounded-full bg-white/95 grid place-items-center shadow-2xl backdrop-blur-sm">
            <Play className="w-7 h-7 text-ink-900 ml-1" strokeWidth={2.4} />
          </span>
        </button>
      )}

      {/* Нижняя панель управления */}
      <div
        className={`absolute left-0 right-0 bottom-0 px-3 pt-8 pb-2.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent transition-opacity duration-200 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Полоса прогресса */}
        <div className="relative h-1.5 group/seek">
          <div className="absolute inset-0 rounded-full bg-white/20" />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white/40"
            style={{ width: `${bufferedPct}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-warm-400"
            style={{ width: `${progressPct}%` }}
          />
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.05}
            value={currentTime}
            onChange={onSeek}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
            aria-label="Перемотать"
          />
          <span
            className="absolute -top-1 w-3.5 h-3.5 rounded-full bg-white shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity"
            style={{ left: `calc(${progressPct}% - 7px)` }}
            aria-hidden
          />
        </div>

        <div className="flex items-center gap-3 mt-2 text-white">
          <button
            type="button"
            onClick={toggle}
            className="w-8 h-8 grid place-items-center rounded-lg hover:bg-white/15 transition"
            aria-label={playing ? "Пауза" : "Воспроизвести"}
          >
            {playing ? (
              <Pause className="w-4 h-4" strokeWidth={2.4} />
            ) : (
              <Play className="w-4 h-4 ml-0.5" strokeWidth={2.4} />
            )}
          </button>

          <div className="flex items-center gap-1.5 group/vol">
            <button
              type="button"
              onClick={() => {
                if (!videoRef.current) return;
                const next = !muted;
                videoRef.current.muted = next;
                setMuted(next);
              }}
              className="w-8 h-8 grid place-items-center rounded-lg hover:bg-white/15 transition"
              aria-label={muted ? "Включить звук" : "Выключить звук"}
            >
              {muted || volume === 0 ? (
                <VolumeX className="w-4 h-4" strokeWidth={2.2} />
              ) : (
                <Volume2 className="w-4 h-4" strokeWidth={2.2} />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={onVolume}
              className="w-0 group-hover/vol:w-20 transition-[width] duration-200 accent-warm-400"
              aria-label="Громкость"
            />
          </div>

          <div className="text-[12px] font-body tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="ml-auto text-[11px] font-body uppercase tracking-wider px-2 py-1 rounded-md hover:bg-white/15 transition"
          >
            На весь экран
          </button>
        </div>
      </div>
    </div>
  );
}

const CLOSE_ANIM_MS = 170;

export default function MediaLightbox({
  media,
  onClose,
}: {
  media: LightboxMedia | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  // Локальный кэш контента — чтобы он не пропадал во время exit-анимации,
  // когда parent уже занулил media.
  const [renderMedia, setRenderMedia] = useState<LightboxMedia | null>(null);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Когда снаружи пришло новое media — показываем сразу.
  useEffect(() => {
    if (media) {
      setRenderMedia(media);
      setClosing(false);
    }
  }, [media]);

  const triggerClose = () => {
    if (closing) return;
    setClosing(true);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setRenderMedia(null);
      setClosing(false);
      onClose();
    }, CLOSE_ANIM_MS);
  };

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!renderMedia) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") triggerClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderMedia]);

  if (!mounted || !renderMedia) return null;

  return createPortal(
    <div
      className={`lentik-overlay-anim ${closing ? "is-closing" : ""} fixed inset-0 z-[400] bg-black/85 backdrop-blur-md`}
      onClick={triggerClose}
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр вложения"
    >
      {/* Плавающие кнопки в правом верхнем углу экрана */}
      <div
        className="absolute top-4 right-4 z-10 flex items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href={renderMedia.url}
          download={renderMedia.fileName}
          target="_blank"
          rel="noreferrer"
          className="w-10 h-10 rounded-full grid place-items-center bg-white/8 hover:bg-white/18 text-white transition backdrop-blur"
          aria-label="Скачать"
          data-tooltip="Скачать"
        >
          <Download className="w-4 h-4" strokeWidth={2.2} />
        </a>
        <button
          type="button"
          onClick={triggerClose}
          className="w-10 h-10 rounded-full grid place-items-center bg-white/8 hover:bg-white/18 text-white transition backdrop-blur"
          aria-label="Закрыть"
          data-tooltip="Закрыть"
        >
          <X className="w-5 h-5" strokeWidth={2.4} />
        </button>
      </div>

      {/* Имя файла в правом нижнем углу, тонкое */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-white/8 backdrop-blur text-white/85 text-xs font-body max-w-[80vw] truncate pointer-events-none"
      >
        {renderMedia.fileName}
      </div>

      {/* Контент по центру. Клик по обёртке (вокруг медиа) — закрывает,
          клик по самому изображению/видео — нет. */}
      <div className={`lentik-dialog-anim ${closing ? "is-closing" : ""} absolute inset-0 flex items-center justify-center p-6`}>
        {renderMedia.kind === "image" ? (
          <img
            src={renderMedia.url}
            alt={renderMedia.fileName}
            onClick={(e) => e.stopPropagation()}
            className="max-w-[92vw] max-h-[88vh] object-contain rounded-xl shadow-2xl cursor-default"
          />
        ) : (
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[min(1200px,92vw)]"
          >
            <CustomVideoPlayer
              src={renderMedia.url}
              className="max-h-[88vh] w-full"
              autoPlay
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
