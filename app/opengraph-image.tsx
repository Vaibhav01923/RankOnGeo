import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "RankOnGeo — Track Your Brand in AI Search";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(160deg, #040d0a 0%, #0c1e15 70%, #12281c 100%)",
          padding: 72,
          color: "#eaf6ee",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: "6px solid #8cf5c3",
              display: "flex",
            }}
          />
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>RankOnGeo</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", flexWrap: "wrap", fontSize: 76, lineHeight: 1.1, letterSpacing: -2, maxWidth: 980 }}>
            <span>Track your brand in&nbsp;</span>
            <span style={{ color: "#8cf5c3", fontStyle: "italic" }}>AI search</span>
          </div>
          <div style={{ fontSize: 30, color: "#9db5a8", maxWidth: 900, fontFamily: "Helvetica, sans-serif" }}>
            See how ChatGPT, Claude, Gemini, Perplexity and AI Overviews answer about your brand — and close the gaps.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: "Helvetica, sans-serif" }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ffb469", display: "flex" }} />
          <div style={{ fontSize: 24, color: "#9db5a8" }}>rankongeo.com</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
