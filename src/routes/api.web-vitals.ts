import { createFileRoute } from "@tanstack/react-router";

const VALID_METRICS = new Set(["CLS", "FCP", "INP", "LCP", "TTFB"]);

export const Route = createFileRoute("/api/web-vitals")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (contentLength > 2_048) return new Response(null, { status: 413 });

        try {
          const payload = (await request.json()) as Record<string, unknown>;
          if (
            typeof payload.name !== "string" ||
            !VALID_METRICS.has(payload.name) ||
            typeof payload.value !== "number" ||
            !Number.isFinite(payload.value) ||
            typeof payload.path !== "string" ||
            !payload.path.startsWith("/") ||
            typeof payload.navigationId !== "string"
          ) {
            return new Response(null, { status: 400 });
          }

          console.info(
            "[web-vital]",
            JSON.stringify({
              name: payload.name,
              value: Math.round(payload.value * 1_000) / 1_000,
              path: payload.path.slice(0, 256),
              navigationId: payload.navigationId.slice(0, 64),
            }),
          );
          return new Response(null, { status: 204 });
        } catch {
          return new Response(null, { status: 400 });
        }
      },
    },
  },
});
