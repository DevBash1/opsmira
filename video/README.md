# Opsmira launch film

A 97-second launch film for Opsmira, built with [Remotion](https://www.remotion.dev). The product UI is recreated in React with
invented machines and data (nothing is captured from a running system), the voice-over is text to speech, and the sound effects and music are
recordings from [Mixkit](https://mixkit.co), fitted to the cues by a script.
It lives in `video/`, is not part of the app build, and is excluded from the Docker context.

The last two cards (other AI agents through MCP, and Opsmira upgrading itself with the run detached) carry no
voice-over: they were added after the voice was recorded, and the key used for the text to speech has since been
rotated. They are picture and music only; see the end of the storyboard.

The story, the scene table, the final voice-over text and the list of what every claim rests on are in [STORYBOARD.md](STORYBOARD.md).

## Deliverables (in `out/`, git-ignored)

| File | What it is |
|------|------------|
| `opsmira-launch-16x9.mp4` | Master: 1920x1080, 30 fps, H.264 (CRF 16, yuv420p), AAC 192 kb/s stereo, -16 LUFS, `+faststart` |
| `opsmira-launch-16x9-captions.mp4` | The same film with karaoke captions burned in |
| `music-options/` | The master with each of the other music tracks (`opsmira-launch-16x9-<id>-<title>.mp4`) and with none (`…-nomusic.mp4`): same picture, same voice and effects |
| `v1-generated-sound/` | The first cut, with the synthesised effects and bed, kept for comparison |
| `opsmira-launch.srt` | Captions as a sidecar file, timed to the voice |
| `poster.png` | 1920x1080 still of the finished end card |
| `reports/` | What was measured on these files: `verify-*.json` (streams, loudness, black frames, audio offset), `mix-report*.json` (the mixer's own numbers), and `review/` (contact sheets of the transitions, the end card, the Approve click and the captions) |

## Use it

```bash
cd video
npm install
npm run dev            # Remotion Studio: pick "Launch", "LaunchCaptions" or "Poster"
```

The Studio plays `public/audio/preview.mp3` (the mix) under the picture. On a fresh checkout, fetch the sounds and build the mix first:
`npm run sfx && npm run music && npm run audio` (the effects, the music and the mix are git-ignored: they are large, reproducible, and the Mixkit files may not be
redistributed on their own).

### Render

```bash
npm run timeline && npm run audio     # only if beats, voice or sounds changed
npm run render                        # out/opsmira-launch-16x9.mp4
npm run render:captions               # out/opsmira-launch-16x9-captions.mp4
npm run srt                           # out/opsmira-launch.srt
npm run poster                        # out/poster.png
# another music track (or --no-music): remix, then swap it onto the finished picture (no re-render)
python3 scripts/audio/build_audio.py --music music/mixkit-134.wav --out out/tmp/mix-134/master.wav
ffmpeg -i out/opsmira-launch-16x9.mp4 -i out/tmp/mix-134/master.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -ar 48000 -movflags +faststart -t 96.733333 out/music-options/opsmira-launch-16x9-134.mp4   # -t: the film's length (src/timeline.generated.json durationSeconds)
node scripts/render.mjs --scale=0.5 --out=out/tmp/draft.mp4    # a quick half-size look
```

A full render is about 30 minutes on a 4-core laptop (3 browser tabs). `scripts/render.mjs` renders the picture muted with Remotion (tagged BT.709, which `remotion.config.ts` also sets:
without it the colours are encoded with the older BT.601 matrix and players show the greens slightly dark), then
muxes `public/audio/master.wav` into it as AAC with ffmpeg (needs `ffmpeg` on the PATH).

To look at a handful of frames without rendering a video (about a second each):

```bash
node scripts/stills.mjs Launch out/tmp/look 12.5,26.0,f1830 --scale=0.5     # seconds, or fNNNN frame numbers
node scripts/stills.mjs LaunchCaptions out/tmp/look 9.7 --scale=0.5          # captions variant
node scripts/stills.mjs Launch out/tmp/look 20 --props='{"debug":"nocam"}'   # a scene without its camera move
```

### Props

`Launch` and `LaunchCaptions` take `{ captions: boolean, audio: boolean }`. `captions` burns the karaoke captions in (`LaunchCaptions` defaults it to true);
`audio` plays the preview mix in the Studio (renders are muted and muxed, so it is false there). Captions sit 96 px from the bottom edge; `src/kit/Captions.tsx` has a `PLACE` table that moves a line out of the way of what is on screen (above the message box, or to the top while the approval card fills the frame), so check it when a scene's camera changes. There is no `theme` prop: the product scenes are
dark and the Watch scene is light by design.

### Checking a render

```bash
python3 scripts/verify.py out/opsmira-launch-16x9.mp4
```

It reports the container and streams (size, fps, codecs, colour tags, faststart), the loudness of the muxed audio (target -16 LUFS integrated, true peak below -1.5 dBTP),
any black frames, the offset between the mp4's decoded audio and `public/audio/master.wav` (should be 0 ms), and, for sound cues that start out of silence, how many milliseconds
after their timeline time they start in the file. Picture against sound is checked by eye: pull the frames around an event (for example the Approve click at 28.7 s, where the
button squashes two frames before the ring and the click sound sits between the two) and compare with the cue times in `src/timeline.generated.json`. The script writes its report to `out/tmp/verify-<name>.json`; the ones for the delivered files are kept in `out/reports/`.

## How it is put together

One timeline drives everything, so picture and sound cannot drift apart.

```
scripts/voice-script.json ─┐
scripts/voice.mjs  ────────┴─> public/voice/*.mp3 + manifest.json   (text to speech + word times)
scripts/beats.mjs (gaps between lines, scene cuts, named events, typing runs, sound cues)
        │            + manifest.json
        ▼  npm run timeline  (scripts/build-timeline.mjs)
src/timeline.generated.json ──> src/timeline.ts ──> every scene (frames come from here, never from literals)
        │
        └─> scripts/audio/build_audio.py  (npm run audio)  <── public/sfx, public/music (fetch_sounds.py: npm run sfx, npm run music)
                 └─> public/audio/master.wav, preview.mp3, out/tmp/mix-report.json
```

| Path | What |
|------|------|
| `src/Root.tsx` | Compositions, the scene order and the transitions between scenes |
| `src/scenes/` | Hook, Ask, Connect, Watch, Command, Own, End |
| `src/kit/` | The product's look rebuilt for video: window, top bar, composer, chat, pills, approval card, disk surface, tasks, cursor, 3D stage camera, captions, brand mark, transitions |
| `scripts/beats.mjs` | The one hand-authored file: line gaps, cut points, events, typing, sound cues |
| `scripts/voice.mjs` | Voice-over generation and caching (see below) |
| `scripts/audio/` | `fetch_sounds.py` (downloads the Mixkit effects and music and fits them to the cues), `build_audio.py` (levelling, ducking, limiter, loudness), `make_sfx.py` and `make_music.py` (the first cut's synthesised sounds, `npm run sfx:synth` / `music:synth`), `spectrogram.py` and `mixmap.py` (pictures of the sound for review) |
| `scripts/render.mjs`, `scripts/stills.mjs`, `scripts/make-srt.mjs` | Render, review stills, subtitles |
| `scripts/extract-icons.mjs` | Copies icon geometry out of the product's `src/components/Icons.tsx` (read only) so icons match the real UI |

To change timing, edit `scripts/beats.mjs` (or a voice line), then `npm run timeline && npm run audio`. To change a sound, put another Mixkit id in the `SFX`
table of `scripts/audio/fetch_sounds.py` and run `npm run sfx && npm run audio`; to change the music, add the track to `MUSIC` there, run `npm run music`, and set
`music.file` in `scripts/beats.mjs`. The mixer prints integrated loudness, true peak and limiter activity; the target is -16 LUFS and a true peak below -1.5 dBTP.

### Sound

Every effect keeps the file name the cues use. `fetch_sounds.py` lines each recording up with its cue (a click starts 2 ms in; a whoosh or swell puts its loudest
moment where the cue expects it, so whooshes still peak on the cut) and levels it to the loudness of the synthesised sound it replaced (kept in `out/cache/sfx-synth`).
Recordings too peaky to reach that level under a -1 dBFS ceiling get the difference in `public/sfx/levels.json`, which the mixer adds to their cues. The keystrokes are
single keys cut out of two laptop typing recordings. The music comes in on the cut out of the hook (`cut_ask`, 6.3 s) and sits about 10 LU under the voice while it speaks.

Music: "Uplifting Bass" by Lily J (Mixkit 726) in the master; alternatives "Deep Techno Ambience" by Alejandro Magaña (134), "Ramp It Up" by Ahjay Stelino (69) and
"New Bass 01" by Lily J (720). Effects: the Mixkit ids and titles are in the `SFX` table of `scripts/audio/fetch_sounds.py`.

## Regenerating the voice-over

The clips are cached in `public/voice/` (mp3 plus word times), so building and rendering need no key and no network. The key that recorded
them has since been rotated, so recording again (a changed line, or a line for a new beat) needs a fresh `OPENAI_API_KEY`. To change a line,
edit `scripts/voice-script.json` and run:

```bash
OPENAI_API_KEY=... node scripts/voice.mjs            # only lines whose text, voice, model or instructions changed
OPENAI_API_KEY=... node scripts/voice.mjs --only=p1 --force      # re-roll one line
node scripts/voice.mjs --check                       # what is cached or stale (no key needed)
```

The key is read from the environment only. It is never printed, logged or written to any file; do not commit it. Word times come from a transcription pass (`whisper-1`)
over the generated clip, which also needs the key.

The voice is OpenAI `gpt-4o-mini-tts`, voice "cedar", with a written delivery brief (calm, plain, unhurried). It was chosen over "marin", "ash" and "verse" by **measurement, not by ear**
(`--audition=cedar,marin,ash,verse` on three real lines, clips in `out/audition`): a warm lower register (median pitch about 125 to 130 Hz), a steady pace of about 2.7 to 2.9 words a second
(ash dragged at 1.5 to 2.1, verse swung between 1.4 and 3.3), clean diction (the transcription pass returned every word correctly), and moderate pitch movement. Nobody has listened to the final
mix while building it, so **listen to the whole film once before publishing**; any line that does not sound right can be re-rolled with `--only=<id> --force` (then `npm run timeline && npm run audio`).

## Things to know before publishing

- **The voice is synthetic.** OpenAI's usage policies require telling listeners that the voice is AI-generated. Put that in the video description (or on screen) wherever the film is published.
- **Remotion licence.** Remotion is free for individuals, for-profit organisations with up to 3 employees, non-profits, and evaluation; anyone else needs a Company License
  ([remotion.pro/license](https://www.remotion.pro/license)). This repository is AGPL-3.0, but Remotion's own licence is separate and is not AGPL: check that the owner's
  organisation qualifies for the free tier (the installed version's terms are in `node_modules/remotion/LICENSE.md`; they are due to change in Remotion 5.0). This project only depends on
  Remotion from npm and does not redistribute it.
- **Fonts** (Space Grotesk, Inter, IBM Plex Mono) are loaded from Google Fonts through `@remotion/google-fonts` and are licensed under the SIL Open Font License.
- **Music and effects are from Mixkit** under the Mixkit Stock Music Free License and Mixkit Sound Effects Free License ([mixkit.co/license](https://mixkit.co/license/)),
  which allow use in videos without attribution; they do not allow redistributing the files on their own, so the downloads and the fitted copies
  (`out/cache/mixkit`, `public/sfx/*.wav`, `public/music/*.wav`) stay git-ignored.
- **v0.1.** The film says "early software" on the end card, as the project does.
