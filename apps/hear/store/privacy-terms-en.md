# Privacy Policy and Terms of Use — Hear

Last updated: 2026-10-03

Hear shows what people around you are saying as live captions on the Even G2
glasses, optionally translated. It uses the speech-recognition service Soniox
with an API key that **you** provide. The developer operates no server and
receives no data from this app. Installing or using the app means accepting
this document.

---

## Privacy

### What the app stores

All of the following is stored **on your phone only**, in the storage area the
Even app gives to this package:

- Your Soniox API key, so you do not have to retype it.
- Your Claude API key, if you choose to enter one for the optional AI answers.
- Your settings: translation target, language hints, microphone choice, quiet
  timeout and interface language.

That is all. **Captions are not stored**: the app keeps the captions of the
current session in memory while it is open so you can scroll back on the phone,
and nothing is written to disk. Closing the app discards them.
There is no recording. Uninstalling the app removes the key and settings.

### What the app sends, and to whom

The app contacts Soniox, and only after you press Start (or long-press on the
glasses) and only while it is listening:

- **stt-rt.soniox.com** — the microphone audio is streamed to Soniox in real
  time for transcription and, if enabled, translation. Soniox returns text;
  the app displays it. When nobody has spoken for the configured quiet period
  the connection is closed, and it is reopened when voice is detected.

Soniox processes this data under its own terms and privacy policy
(https://soniox.com). You are the Soniox customer; the developer has no access
to your Soniox account or to anything you send there.

Without an API key the app does nothing with audio and sends nothing anywhere.

**Optional AI answers.** If, and only if, you enter a Claude API key in Settings,
a single tap on the glasses sends text to a second service:

- **api.anthropic.com** — the text of the last stretch of conversation (the
  captions, at most about 800 characters; no audio) is sent to Anthropic's Claude
  API, which returns a short answer that the app displays. Nothing is sent
  unless you tap.

Anthropic processes this data under its own terms and privacy policy
(https://www.anthropic.com). You are the Anthropic customer; the developer has
no access to your Anthropic account or to anything you send there. Leave the key
empty and this service is never contacted.

There is no analytics, no telemetry, no crash reporting, no advertising and no
third-party service other than the two named above. Nothing is sent to the developer.

### Permissions

- **Glasses microphone** — listens to the people around you through the G2
  microphones (default).
- **Phone microphone** — alternative input for larger rooms; used only when you
  select it.
- **Network** — restricted to the Soniox host above and, only if you enter a
  Claude API key, the Anthropic host above. The app never contacts any other host.

No other permission is requested or used: no camera, no photo library, no
location, no contacts, no push notifications.

### Listening to other people

You are responsible for complying with the laws and the rules that apply where
you are to transcribing conversations. Audio is processed by Soniox while the
app is listening; tell the people you are with if that is expected where you
are.

---

## Terms of Use

### No affiliation

This app is an independent project. It is not affiliated with, endorsed by or
supported by Soniox, Inc. or Even Realities. "Soniox" names the service the app
sends audio to.

### Your responsibilities

- You provide the Soniox API key and pay for your Soniox usage. The app
  disconnects during quiet periods to limit cost, but you are responsible for
  stopping it (long-press, or double-tap to exit) when you do not need it.
- You are responsible for the device the app is installed on. Anyone with
  access to the unlocked phone can use the stored API key.
- You are responsible for obtaining any consent required where you are.

### Accuracy

Transcription, speaker separation and translation are produced automatically
and contain errors. Captions may be late, incomplete or wrong, and the first
words after a quiet period may be missed. Do not rely on them where
misunderstanding could cause harm — medical, legal, safety or financial
situations included.

### No warranty

The app is provided "as is", without warranty of any kind. To the extent
permitted by law the developer is not liable for any loss arising from its use,
including Soniox charges or consequences of inaccurate captions.

### Changes

This document may be updated with new versions of the app. The current version
is shown on the app's store page.
