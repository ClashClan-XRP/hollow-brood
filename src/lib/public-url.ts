/** Public asset URL that respects Vite `base` (GitHub Pages lives under `/hollow-brood/`). */
export function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${path.replace(/^\//, "")}`;
}
