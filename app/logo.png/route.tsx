import { ImageResponse } from "next/og";

export const contentType = "image/png";

// Serves a static-URL brand mark (matches the LogoMark used in SiteNav/icon.tsx)
// at a size suitable for schema.org Organization.logo — the favicon (app/icon.tsx)
// is only 32x32, too small for that purpose.
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f6f2e9",
        }}
      >
        <div
          style={{
            width: 280,
            height: 280,
            borderRadius: "50%",
            border: "20px solid #b1552e",
            display: "flex",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -8,
              right: 36,
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "#6f7f3f",
            }}
          />
        </div>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
