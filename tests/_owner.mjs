/** Unlock the site-wide owner gate. The passcode must come from ED16_OWNER_CODE; it is never logged or hardcoded. */
export async function passOwnerGate(page) {
  const code = process.env.ED16_OWNER_CODE || "";
  await page.waitForSelector(".dc-root", { timeout: 25000 });
  const state = await page.waitForFunction(() => {
    const t = document.body.innerText || "";
    if (document.querySelector("[data-ed16-owner-gate]")) return "gate";
    if (
      (t.includes("Profiles") || t.includes("Choose a profile") || t.includes("Save Game") ||
        t.includes("Optional 4-digit PIN") || t.includes("Enter your PIN") ||
        t.includes("Restore save") || t.includes("Saves") || t.includes("Opening")) &&
      !t.includes("Loading saves")
    ) return "ready";
    return false;
  }, { timeout: 25000 });
  const kind = await state.jsonValue();
  if (kind === "ready") return;
  if (!code) throw new Error("ED16_OWNER_CODE is required to unlock the owner gate");
  const sel = 'input[aria-label="Owner passcode"]';
  await page.waitForSelector(sel, { timeout: 8000 });
  await page.evaluate((sel, c) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error("owner passcode field missing");
    const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    const tracker = el._valueTracker;
    if (tracker) tracker.setValue("");
    if (desc && desc.set) desc.set.call(el, c);
    else el.value = c;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, sel, code);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("[data-ed16-owner-gate] button")].find((el) => /Unlock|Checking/i.test(el.textContent || ""));
    if (b) b.click();
  });
  await page.waitForFunction(() => !document.querySelector("[data-ed16-owner-gate]"), { timeout: 20000 });
}
