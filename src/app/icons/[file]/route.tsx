import { ImageResponse } from "next/og";

// PWA icons: /icons/192.png, /icons/512.png, /icons/maskable-512.png.
// Public (the proxy skips *.png) so Android can fetch them before login.
const SIZES: Record<string, { size: number; maskable: boolean }> = {
  "192.png": { size: 192, maskable: false },
  "512.png": { size: 512, maskable: false },
  "maskable-512.png": { size: 512, maskable: true },
};

export async function GET(_req: Request, ctx: RouteContext<"/icons/[file]">) {
  const { file } = await ctx.params;
  const spec = SIZES[file];
  if (!spec) return new Response(null, { status: 404 });
  const { size, maskable } = spec;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2563eb",
          borderRadius: maskable ? 0 : size * 0.2,
        }}
      >
        {/* Fuel-drop mark; maskable variant keeps it inside the 80% safe zone. */}
        <div
          style={{
            width: size * (maskable ? 0.42 : 0.52),
            height: size * (maskable ? 0.42 : 0.52),
            background: "white",
            borderRadius: "50% 0 50% 50%",
            transform: "rotate(-45deg)",
          }}
        />
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
