import { createRoot } from "react-dom/client";
import App from "./game";
import { ED16_BUILD } from "./build-id";

(window as unknown as { __ED16_BUILD?: string }).__ED16_BUILD = ED16_BUILD;
document.documentElement.dataset.ed16Build = ED16_BUILD;

const el = document.getElementById("root");
if (!el) throw new Error("Missing #root");
createRoot(el).render(<App />);

let swReg: ServiceWorkerRegistration | null = null;
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then((r) => { swReg = r; r.update().catch(() => {}); }).catch(() => { /* install prompt can still appear */ });
  });
}

// Stale-build guard: if the page or bundle came from an old cache, the live index.html names a newer build.
// Check on start and whenever the app comes back to the foreground; reload once per new build id.
// The game already flushes the active profile save on visibilitychange/pagehide, so a reload never loses progress.
async function checkNewBuild(): Promise<void> {
  try {
    const res = await fetch("./index.html?bv=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return;
    const html = await res.text();
    const m = html.match(/name="ed16-build" content="([^"]+)"/);
    const live = m ? m[1] : "";
    if (!live || live === ED16_BUILD) return;
    let tried = "";
    try { tried = sessionStorage.getItem("edBuildReload") || ""; } catch { /* ignore */ }
    if (tried === live) return;
    try { sessionStorage.setItem("edBuildReload", live); } catch { /* ignore */ }
    if (swReg) { try { await swReg.update(); } catch { /* ignore */ } }
    location.reload();
  } catch { /* offline: keep running the cached build */ }
}
if (location.protocol === "https:" || location.protocol === "http:") {
  window.setTimeout(() => { void checkNewBuild(); }, 1500);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") window.setTimeout(() => { void checkNewBuild(); }, 400); });
}
