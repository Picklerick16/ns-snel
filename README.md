# Snel, a train planner with your own transfer time

Snel asks the NS API for its normal trips. Then, at every stop where you could get off, it asks NS again for a trip that starts a few minutes after you arrive. You choose that margin yourself, 2 minutes by default. That is how it finds routes like the one on 24 Nov 2026. You run 2a → 10b at Amsterdam Centraal in 4 minutes and reach Almere Poort at 14:05 instead of 14:17.

"Ik zit in deze trein" does the same for a train you are already on. It only looks at stops that are still ahead.

## Files

- `index.html` + `planner.js`: the app, hosted on GitHub Pages.
- `worker/`: a Cloudflare Worker that forwards four read-only NS calls and adds your API key, so the key never sits in the page.
- `test/replay.test.mjs`: offline test that replays 24 Nov. Run `node test/replay.test.mjs`.
- `test/devserver.mjs`: local preview with fake data on http://localhost:8766. Set the time to 12:45 and plan Den Haag HS → Almere Poort.

## One-time setup (about 15 minutes)

1. **NS API key.** Make an account at apiportal.ns.nl. Under Products, subscribe to the free **Ns-App** product, then copy your primary key.
2. **Cloudflare Worker.** Make a free account at cloudflare.com. Then, in a terminal in `ns-snel\worker`:
   ```powershell
   npx wrangler login
   ```
   ```powershell
   npx wrangler deploy
   ```
   ```powershell
   npx wrangler secret put NS_KEY
   ```
   Paste the NS key when it asks. The deploy prints the Worker address, for example `https://ns-snel.<name>.workers.dev`.
3. **GitHub Pages.** Create a public repository `ns-snel` under picklerick16. Upload `index.html` and `planner.js`, the `worker` and `test` folders are optional. Then go to Settings → Pages → Branch `main`, folder `/`. The app is then at `https://picklerick16.github.io/ns-snel/`.
4. **iPhone.** Open that address in Safari and go to Instellingen. Paste the Worker address, then use Share → Add to Home Screen.

## Not yet checked with live NS data

The app reads the NS v3 trips response: legs, stops, tracks and actual times. That shape comes from the NS documentation as I remember it, not from a real call, because there was no key yet. The first live search may show that a field has a different name. Ask Claude to check it once the Worker runs.

Security: the Worker only accepts four NS paths and only answers the origins in `wrangler.toml`. The NS key stays a Worker secret.
