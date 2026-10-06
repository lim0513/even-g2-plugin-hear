# Hear

Live captions on [Even Realities G2](https://www.evenrealities.com/) smart glasses, for when you cannot hear what is being said.

The glasses listen to the people around you, [Soniox](https://soniox.com/) transcribes the speech in real time, and the words appear on the display within about a second. Translation is optional.

- **Open and listen.** No meetings, no sessions, no setup beyond an API key.
- **Nothing is recorded or stored.** Audio is streamed to Soniox while captions are on and is not kept anywhere by this app.
- **Any spoken language** is recognised; translate into 60 languages or show the original only.
- **Speaker changes are marked.** A line that starts with `•` is a different person talking.
- **You only pay while people talk.** The connection drops after a quiet period and comes back when someone speaks.
- Interface in English, 日本語 and 中文.

## What you need

- Even Realities G2 glasses and the Even App (2.2.10 or later).
- Your own Soniox API key from [console.soniox.com](https://console.soniox.com/). Real-time recognition costs about $0.12 per hour of listening, translation included, billed to your Soniox account. This project runs no server.

## Using it

On the glasses:

| Gesture | Action |
|---|---|
| Long-press | Start, pause, resume |
| Menu | Clear the screen |
| Double-tap | Exit |

On the phone (the plugin page inside the Even App):

| Setting | What it does |
|---|---|
| Soniox API Key | Stored only on the phone |
| Translate to | Target language, or off |
| Show original while translating | On: 3 lines original + 6 lines translation. Off: all 9 lines translation |
| Speech already in the target language | Show it as usual (default), or hide it if you understand that language anyway |
| Microphone | Glasses, or the phone (for example on a table in a larger room) |
| Languages spoken around you | Hints for recognition, not a restriction |
| Quiet timeout | Minutes of silence before disconnecting from Soniox; 0 keeps the connection open |

## Development

This is an npm workspace. The Even Hub CLI and simulator are installed at the repository root; the app lives in `apps/hear`. Node 20 LTS or 22+ is required.

```bash
npm install

npm run sim -- hear 9898       # dev server + simulator, automation API on port 9898
npm run build -w hear          # type-check and build
npm run release -w hear        # bump the patch version, build, and pack out.ehpk
node scripts/eh.mjs qr hear    # sideload to real glasses over the LAN
```

Useful while developing (dev server only; all of this is stripped from production builds):

| URL parameter | Effect |
|---|---|
| `?demo=1` | Scripted fake captions instead of Soniox, so no key is needed and nothing is billed |
| `?lang=en` / `ja` / `zh` | Force the interface language |
| `?tr=1` / `?tr=0` | Translation on or off |
| `?src=1` / `?src=0` | Show or hide the original while translating |

If captions start to lag, tap the version number at the bottom of the phone page: a line of live readings appears (audio from the glasses, Soniox, network, display updates) that shows which stage is falling behind.

Put `VITE_SONIOX_KEY=...` in `apps/hear/.env.local` to avoid typing the key into the simulator. `.env.local` is git-ignored.

`node scripts/shot.mjs 9898 shot.png` captures the glasses display composited on black, which is how it looks through the lenses. Add `--raw` for the transparent original that the Even Hub store requires.

## How it is put together

Paths are relative to `apps/hear`.

| File | Role |
|---|---|
| `src/main.ts` | Wiring: microphone, Soniox session, glasses rendering, input |
| `src/soniox.ts` | Real-time WebSocket session, reconnects, quiet-period disconnect |
| `src/captions.ts` | Token stream → two caption streams (original, translation); pure logic |
| `src/layout.ts` | Glasses layout: fixed text containers, line wrapping; no SDK dependency |
| `src/ui.ts` | Phone-side settings page |
| `src/settings.ts`, `src/kv.ts` | Settings model and SDK storage with timeouts |
| `src/i18n.ts` | Interface strings in three languages |
| `src/demo-feed.ts` | Fake Soniox responses for `?demo=1` |
| `store/` | Store listing text, privacy terms, screenshots |

Code comments are mostly in Chinese. Some of them refer to notes and sibling projects in the author's private workspace that are not part of this repository.

## Privacy

The app contacts one third party, Soniox, and only while captions are on. See [`store/privacy-terms-en.md`](apps/hear/store/privacy-terms-en.md).

## License

MIT. Not affiliated with Even Realities or Soniox.

If this is useful to you: <https://ko-fi.com/lim0513>
