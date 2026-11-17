import { createRoot } from "react-dom/client";
import App from "./game";
import { ED16_BUILD } from "./build-id";

(window as unknown as { __ED16_BUILD?: string }).__ED16_BUILD = ED16_BUILD;
document.documentElement.dataset.ed16Build = ED16_BUILD;

const el = document.getElementById("root");
if (!el) throw new Error("Missing #root");
createRoot(el).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => { /* install prompt can still appear */ });
  });
}
