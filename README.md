# Hear

Live captions on [Even Realities G2](https://www.evenrealities.com/) smart glasses, for when you cannot hear what is being said.

The glasses listen to the people around you, [Soniox](https://soniox.com/) transcribes the speech in real time, and the words appear on the display within about a second. Translation is optional.

- **Open and listen.** No meetings, no sessions, no setup beyond an API key.
- **Nothing is recorded or stored.** Audio is streamed to Soniox while captions are on and is not kept anywhere by this app.
- **Any spoken language** is recognised; translate into 60 languages or show the original only.
- **Optional AI answers (experimental).** Add your own Claude API key and a tap on the glasses sends the last stretch of conversation (text only) to Claude; a short answer appears on the glasses.
- **Speaker changes are marked.** A line that starts with `•` is a different person talking, on the glasses and on the phone.
- **The newest words are the brightest.** On the glasses the latest two lines are at full brightness and earlier ones a step dimmer, so your eye lands on what is being said. This can be turned off.
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
| Tap | Ask Claude about the last stretch of conversation (only with a Claude API key set); tap again to close, swipe to page |
| Menu | Clear the screen |
| Double-tap | Exit |

On the phone (the plugin page inside the Even App) the page is the conversation itself: what is being said right now is the largest text, earlier utterances sit above it, and a one-line status at the top uses the same marks as the glasses (`■` listening, `||` paused, `□` waiting, `!` a problem). The first time, it asks only for the Soniox key. Settings open from the button at the top once captions are paused:

| Setting | What it does |
|---|---|
| Soniox API Key | Stored only on the phone |
| Translate to | Target language, or off |
| Show the original on the glasses too | On: 3 lines original + 6 lines translation. Off: all 9 lines translation |
| Also show speech already in the target language | On (default): shown as usual. Off: left off the glasses if you understand that language anyway; the phone still keeps it |
| When a sentence is finalised | Accurate (default): waits a little longer, which separates speakers more reliably and cuts sentences less, at a measured cost of about 0.2 s. Fast: as soon as the speaker stops |
| Microphone | Glasses, or the phone (for example on a table in a larger room) |
| Languages spoken around you | Hints for recognition, not a restriction |
| Lean harder toward these languages | Try it when one language comes out written as another. Best effort, not a hard limit |
| Brighter newest two lines | On (default): the latest two lines on the glasses are brightest, earlier ones a step dimmer, and text fills from the bottom. Off: everything at full brightness, filling from the top |
| Quiet timeout | Minutes of silence before disconnecting from Soniox; 0 keeps the connection open |
| Clear after idle | Seconds without any new caption text before the glasses are cleared (default 15); new text restarts the count; 0 never clears |

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
| `?tiers=1` / `?tiers=0` | Brighter newest two lines on or off, to compare the two glasses layouts |

If captions start to lag, tap the version number at the top right of the phone page: a line of live readings appears (audio from the glasses, Soniox, network, display updates) that shows which stage is falling behind.

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
| `src/ui.ts` | Phone-side page: status, conversation, settings |
| `ui-test.html`, `src/ui-test.ts` | The phone page in each state without the glasses bridge (dev server only): `/ui-test.html?view=first|live|plain|paused|settings|error|ai&lang=zh` |
| `src/settings.ts`, `src/kv.ts` | Settings model and SDK storage with timeouts |
| `src/i18n.ts` | Interface strings in three languages |
| `src/ai.ts` | One question to Claude over the Anthropic SDK, streamed back |
| `src/demo-feed.ts` | Fake Soniox responses for `?demo=1` |
| `store/` | Store listing text, privacy terms, screenshots |

Code comments are mostly in Chinese. Some of them refer to notes and sibling projects in the author's private workspace that are not part of this repository.

## Privacy

The app contacts Soniox, and only while captions are on. If you add a Claude API key, a tap on the glasses also sends recent caption text (no audio) to Anthropic. See [`store/privacy-terms-en.md`](apps/hear/store/privacy-terms-en.md).

## License

MIT. Not affiliated with Even Realities or Soniox.

If this is useful to you: <https://ko-fi.com/lim0513>
