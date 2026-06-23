"use client";
import { useState, useEffect } from "react";

const WORDS = ["every", "ChatGPT", "Perplexity", "Claude", "Gemini", "Grok"];

export function RotatingWord() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let t: ReturnType<typeof setInterval>;

    function start() {
      t = setInterval(() => setIdx((i) => (i + 1) % WORDS.length), 2000);
    }

    function onVisibility() {
      if (document.hidden) clearInterval(t);
      else start();
    }

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <span className="inline-grid text-white border-b-2 border-brand pb-0.5" aria-live="polite" aria-atomic="true">
      {WORDS.map((word, i) => (
        <span
          key={word}
          className="col-start-1 row-start-1 transition-opacity duration-300 motion-reduce:transition-none"
          style={{
            opacity: i === idx ? 1 : 0,
            animation: i === idx ? "fadeSlideIn 0.4s ease forwards" : "none",
          }}
          aria-hidden={i !== idx}
        >
          {word}
        </span>
      ))}
    </span>
  );
}
