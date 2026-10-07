"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Product walkthrough under the hero form, played muted on a loop like a live
 * preview of the dashboard. Uses the autoPlay attribute rather than calling
 * play() on mount: the browser then starts it whenever the tab becomes visible,
 * where a one-off play() in a background tab gets paused and never resumes.
 * Browsers only autoplay muted video, so a visible "Sound on" button lets
 * visitors hear it (the native controls' speaker only shows on hover). Under
 * reduced motion it's stopped on its poster; native controls give everyone
 * pause and fullscreen. The file is a cropped 30fps web encode of the screen
 * recording with its audio normalised to web loudness (~3.4 MB), not the
 * 27 MB original.
 */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    // Keep the button in step with the native controls' mute toggle.
    const sync = () => setMuted(video.muted);
    video.addEventListener("volumechange", sync);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      video.autoplay = false;
      video.pause();
      video.currentTime = 0;
    }
    return () => video.removeEventListener("volumechange", sync);
  }, []);

  function toggleSound() {
    const video = ref.current;
    if (!video) return;
    video.muted = !video.muted;
    if (!video.muted && video.paused) video.play().catch(() => {});
  }

  return (
    <div className="relative">
      <video
        ref={ref}
        className="block h-auto w-full"
        width={1920}
        height={916}
        poster="/videos/rankongeo-demo-poster.webp"
        autoPlay
        muted
        loop
        playsInline
        controls
        preload="metadata"
        aria-label="Walkthrough of the RankOnGeo dashboard: AI visibility scores, tracked prompts, citations, auto-publishing and Reddit marketing"
      >
        <source src="/videos/rankongeo-demo.mp4" type="video/mp4" />
        A walkthrough of the RankOnGeo dashboard.
      </video>
      <button
        type="button"
        onClick={toggleSound}
        aria-pressed={!muted}
        className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-[var(--ink)]/80 px-3 py-1.5 text-xs font-medium text-[var(--surface)] shadow-lg backdrop-blur-sm transition-colors hover:bg-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rust)] max-md:right-2 max-md:top-2"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5V6z" fill="currentColor" />
          {muted ? (
            <path d="M10.5 6l3.5 4m0-4l-3.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          ) : (
            <path d="M10.4 5.6a3.4 3.4 0 010 4.8M12.3 3.8a6 6 0 010 8.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          )}
        </svg>
        {muted ? "Sound on" : "Mute"}
      </button>
    </div>
  );
}
