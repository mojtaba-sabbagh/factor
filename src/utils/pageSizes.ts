import type { CSSProperties } from "react";

export const PAGE_SIZES: Record<string, { w: number; h: number }> = {
  a4: { w: 210, h: 297 },
  a5: { w: 148, h: 210 },
};

// Returns CSS custom properties consumed by .doc-page in globals.css.
export function pageStyleVars(size: string, customLetterhead: { src: string } | null): CSSProperties {
  const spec = PAGE_SIZES[size] || PAGE_SIZES.a4;
  return {
    ["--page-width-mm" as string]: `${spec.w}mm`,
    ["--page-height-mm" as string]: `${spec.h}mm`,
    ...(customLetterhead ? { ["--letterhead-src" as string]: `url(${customLetterhead.src})` } : {}),
  } as CSSProperties;
}
