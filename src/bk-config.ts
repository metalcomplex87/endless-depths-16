// Off-device save backup receiver (Grok Bot routine webhook "ed16-save-backup-receiver").
// Empty URL = webhook sending is OFF. The local backup history (ed16_bk_hist_pN) works either way.
// The key is sent as "Authorization: Bearer <key>". It ships in the public game.js, so anyone who can load
// the site can read it; accepted because the routine only stores the posted save codes.
export const ED16_BK_URL = "";
export const ED16_BK_KEY = "";
