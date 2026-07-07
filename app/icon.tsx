import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            border: "4px solid #b1552e",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 3,
            right: 3,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#6f7f3f",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
