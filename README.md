# Endless Depths 16 (standalone)

This folder is the **source of truth** for the game. Edit files under `src/`, not the Cursor canvas. Built files (`index.html`, `game.js`, icons, `manifest.json`, `sw.js`) live in this same folder so the site can be hosted as a plain static website.

Saves use stable `localStorage` / IndexedDB keys (`ed16_save_v1_p1` / `p2` / `p3`, plus backups, stash, and `ed16_lock`). Those names must not change between deploys, or existing phone saves will not load.

## Update workflow

1. Change the game in `src/` (`game.tsx` is the game, `grok-canvas.ts` is the theme shim, `main.tsx` mounts the app).
2. From this directory, run:

```bash
./deploy.sh
```

That one command:

- rebuilds `game.js` and stamps a build id
- deploys to GitHub Pages if `gh` is logged in, otherwise serves the folder locally
- `curl`-checks the URL for a 200 and the game HTML, with no unexpected redirect
- runs the save smoke test, including a trivial second deploy that must still load the previous save

3. On your phone, open the same URL and use **Add to Home screen** / **Install app**. You do not need to sign in to play.

## Public URL (one-time login)

This machine does not stay logged into GitHub unless you have already run:

```bash
gh auth login
```

After that, `./deploy.sh` will create or update a public `endless-depths-16` repo and enable GitHub Pages. The stable URL is:

`https://<your-github-username>.github.io/endless-depths-16/`

## Manual commands

```bash
npm run build      # rebuild game.js only
npm run smoke      # save smoke test (needs ED16_URL)
npm run accept     # full standalone acceptance suite
```
