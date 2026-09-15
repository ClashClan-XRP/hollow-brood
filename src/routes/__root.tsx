import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { publicUrl } from "@/lib/public-url";
import appCss from "../styles.css?url";

const APP_NAME = "Hollow Brood";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "theme-color", content: "#0b100e" },
      {
        name: "description",
        content:
          "Widescreen spider colony action. Pick a difficulty, lay fang and siege eggs, and hold the nest in a three-way war.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: publicUrl("favicon.svg") },
      { rel: "icon", type: "image/png", sizes: "32x32", href: publicUrl("favicon-32.png") },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: publicUrl("__grok/manifest.webmanifest") },
      { rel: "apple-touch-icon", href: publicUrl("__grok/icon-180.png") },
    ],
  }),
  component: () => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
