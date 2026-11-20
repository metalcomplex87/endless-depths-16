// Off-device save backups go to the box relay (Node receiver behind a tunnel). Its current URL is read from
// a secret gist (ED16_BK_GIST); ED16_BK_URL, if set, overrides that. Empty key = sending OFF; the local
// history (ed16_bk_hist_pN + IndexedDB) and silent local auto-heal work either way.
// The key ships in the public game.js, so anyone who loads the site can read it (see GUARANTEES.md).
export const ED16_BK_URL = "";
export const ED16_BK_GIST = "metalcomplex87/5b596505d20ccf8031f27e77e11d343c";
export const ED16_BK_KEY = "116e8e5731097b79537a753c1645ff3d";
