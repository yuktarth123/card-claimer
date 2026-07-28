# ig-ad-generator

An in-house, free-to-run pipeline that turns your live card listings (from
[yanks-tcg](https://yanks-tcg.vercel.app/)'s Supabase database) into Instagram
ad creative -- both feed images and Reels-style videos -- and optionally
publishes them automatically.

No paid APIs are required:

- **Product data**: pulled straight from your existing Supabase `cards` table
  (public-read, same as the storefront).
- **Images**: [Pollinations.ai](https://pollinations.ai) -- free, no signup,
  no API key -- generates a backdrop, which is then composited with your real
  card photo, price badge, and caption text using Pillow.
- **Video**: assembled locally with `ffmpeg` (Ken Burns pan/zoom over the
  generated images, optional background music) -- the same trick tools like
  Canva/CapCut use, no generative-video API or credits involved.
- **Scheduling**: a GitHub Actions cron workflow, free on GitHub's hosted
  runners.
- **Publishing** (optional): Instagram's Graph API, once you've done the
  one-time Meta Developer App setup (see `SETUP.md`).

## How it works

```
Supabase cards table -> pick N cards -> generate ad copy
      -> AI background (Pollinations) + real card photo composited (Pillow)
      -> Ken Burns video assembled (ffmpeg)
      -> [optional] upload to Supabase Storage -> publish to Instagram
```

## Quick start

1. `pip install -r requirements.txt`
2. `cp .env.example .env` and fill in `SUPABASE_URL` / `SUPABASE_ANON_KEY`
   (same values your frontend already uses).
3. Adjust `config.yaml` to taste (which cards to pick, brand color, tone,
   video length). Leave `publish.auto_publish: false` for your first runs.
4. `python -m src.pipeline`
5. Check `output/<timestamp>/` for the generated feed images, story images,
   and `ad_reel.mp4`.

Once you're happy with what's being generated, follow `SETUP.md` to wire up
Instagram publishing and turn on the scheduled GitHub Actions workflow.

## Project layout

```
src/
  config.py             # loads config.yaml + env vars
  data_source.py         # fetches cards from Supabase REST API
  copywriter.py           # template-based headline/caption/hashtag generation
  image_gen.py            # Pollinations.ai background + Pillow compositing
  video_gen.py             # ffmpeg Ken Burns video assembly
  storage.py                # uploads generated media to Supabase Storage
  instagram_publish.py       # Instagram Graph API publish (image + Reel)
  pipeline.py                 # orchestrates the whole run
.github/workflows/
  scheduled_ads.yml            # daily cron (+ manual trigger) via GitHub Actions
config.yaml                     # all non-secret settings
```

## Customizing the look

- Drop a transparent PNG at `assets/logo.png` and set `brand.logo_path` in
  `config.yaml` to have your logo watermarked onto every ad.
- Drop a `.ttf` at `assets/fonts/brand.ttf` to use your own brand font instead
  of the bundled default.
- Drop a royalty-free/CC0 track at `assets/music/background.mp3` (see
  `SETUP.md` for free sources) and point `video.music_path` at it.

## Notes on the free tiers

- Pollinations.ai is free and unauthenticated but best-effort -- expect
  occasional slow responses or the odd failed request; the pipeline will
  raise clearly if a run fails rather than silently posting something broken.
  Re-running is free and safe.
- GitHub Actions free tier gives generous minutes for scheduled jobs like
  this one; a daily run generating a handful of images/videos costs a few
  minutes.
- Supabase Storage free tier includes 1GB of storage and bandwidth, which is
  ample for staging ad media before it's published to Instagram.
