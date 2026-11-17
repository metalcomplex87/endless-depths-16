// Shim for grok/canvas so the game can run as a normal website.
// Only useGrokTheme / hooks are used; provide a fixed dark theme matching the dungeon UI.
import { useState, useEffect, useRef } from "react";
export { useState, useEffect, useRef };

const FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const ts = (fontSize: number, lineHeight: number, fontWeight: number = 400) => ({
  fontFamily: FAMILY,
  fontSize,
  lineHeight: lineHeight + "px",
  fontWeight,
});

export function useGrokTheme() {
  return {
    kind: "dark" as const,
    bg: { base: "#120c14", subtle: "#1a121c", surface: "#1e1622" },
    text: { primary: "#e8e0d0", secondary: "#c8c0b0", tertiary: "#908878" },
    fill: { primary: "#e8e0d0", secondary: "#2a2228" },
    font: {
      family: FAMILY,
      mono: MONO,
      heading1: ts(30, 36, 700),
      heading2: ts(24, 30, 700),
      heading3: ts(20, 26, 600),
      body1: ts(16, 24, 400),
      subtext: ts(14, 20, 400),
      table: ts(15, 22, 400),
      metric: ts(24, 30, 500),
      body2: ts(13, 18, 400),
      label: ts(12, 16, 400),
      caption: ts(11, 16, 400),
      code: { fontFamily: MONO, fontSize: 13, lineHeight: "20px", fontWeight: 400 },
    },
    weight: { regular: 400, medium: 500, semibold: 600 },
    radius: { sm: 4, md: 8, lg: 12, xl: 16, full: 9999 },
    motion: { hover: "120ms", easing: "ease-out" },
    dataviz: {
      categorical: ["#ffd840", "#e07040", "#70c0e0", "#90d070", "#c070e0", "#e0a050"],
      singleSeriesRest: "#705838",
      other: "#706860",
    },
    chart: ["#e8e0d0", "#c8c0b0", "#908878", "#2a2228"] as const,
  };
}
