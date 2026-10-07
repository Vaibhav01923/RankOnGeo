"use client";
import { useEffect, useRef } from "react";

/**
 * Product walkthrough under the hero form, played muted on a loop like a live
 * preview of the dashboard. Uses the autoPlay attribute rather than calling
 * play() on mount: the browser then starts it whenever the tab becomes visible,
 * where a one-off play() in a background tab gets paused and never resumes.
 * Under reduced motion it's stopped on its poster; native controls give
 * everyone pause and fullscreen. The file is a cropped, silent 30fps web
 * encode of the screen recording (~2 MB), not the 27 MB original.
 */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    video.autoplay = false;
    video.pause();
    video.currentTime = 0;
  }, []);

  return (
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
  );
}
