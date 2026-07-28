# Setup

This covers the three one-time setup steps: the Supabase Storage bucket,
the Instagram/Meta credentials, and wiring both into GitHub Actions. All of
it is free.

## 1. Supabase Storage bucket

The pipeline needs somewhere public to stage generated images/video before
handing a URL to Instagram (the Graph API fetches media by URL, it doesn't
accept raw uploads). Run this once in your Supabase project's **SQL Editor**:

```sql
insert into storage.buckets (id, name, public)
values ('ig-ad-assets', 'ig-ad-assets', true)
on conflict (id) do nothing;

create policy "Allow anon ad asset uploads"
on storage.objects for insert
to anon
with check (bucket_id = 'ig-ad-assets');

create policy "Allow public ad asset reads"
on storage.objects for select
to anon
using (bucket_id = 'ig-ad-assets');
```

This mirrors the `card-videos` bucket policy the storefront already uses, so
it's consistent with how that project handles anon uploads.

## 2. Instagram Graph API credentials

Auto-posting requires an Instagram **Business or Creator** account linked to
a **Facebook Page**, and a Meta Developer App to generate an access token.
None of this costs money, and you do **not** need Meta's full App Review
process as long as you're posting to your own account (the app can stay in
"Development Mode" with you as its admin/tester).

1. **Convert your Instagram account** (if not already): Instagram app ->
   Settings -> Account type and tools -> switch to Professional account ->
   Business.
2. **Link a Facebook Page**: Instagram Settings -> Account Center -> link
   your Instagram account to a Facebook Page you control (create a simple
   Page if you don't have one -- it's free).
3. **Create a Meta Developer App**: go to
   [developers.facebook.com/apps](https://developers.facebook.com/apps),
   create an app of type "Business". Add the **Instagram Graph API** product
   to it.
4. **Generate a token with the right permissions** using the
   [Graph API Explorer](https://developers.facebook.com/tools/explorer/):
   - Select your app, select your Page.
   - Request these permissions: `instagram_basic`, `instagram_content_publish`,
     `pages_show_list`, `pages_read_engagement`.
   - Generate a **User Access Token**.
5. **Exchange it for a long-lived token** (short-lived tokens expire in ~1
   hour; long-lived last ~60 days):
   ```
   GET https://graph.facebook.com/v21.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id={app-id}
     &client_secret={app-secret}
     &fb_exchange_token={short-lived-user-token}
   ```
6. **Get your Page Access Token** using the long-lived user token:
   ```
   GET https://graph.facebook.com/v21.0/me/accounts?access_token={long-lived-user-token}
   ```
   Find your Page in the response and copy its `access_token` -- this is
   your `IG_ACCESS_TOKEN`. Page tokens derived this way don't expire as long
   as the underlying user stays authorized, so you shouldn't need to rotate
   it often; if publishing ever starts failing with an auth error, just
   repeat steps 4-6.
7. **Get your Instagram Business Account ID**:
   ```
   GET https://graph.facebook.com/v21.0/{page-id}?fields=instagram_business_account&access_token={page-access-token}
   ```
   The `instagram_business_account.id` field is your `IG_BUSINESS_ACCOUNT_ID`.

## 3. GitHub Actions secrets

In this repo: **Settings -> Secrets and variables -> Actions -> New
repository secret**, add:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Your Supabase anon/publishable key |
| `SUPABASE_STORAGE_BUCKET` | `ig-ad-assets` |
| `IG_ACCESS_TOKEN` | Page access token from step 2.6 |
| `IG_BUSINESS_ACCOUNT_ID` | From step 2.7 |

The workflow (`.github/workflows/scheduled_ads.yml`) runs daily at 15:00 UTC
by default -- edit the cron expression to change the schedule, or trigger it
manually from the Actions tab ("Run workflow") to test it.

**Recommendation**: leave `publish.auto_publish: false` in `config.yaml`
for the first several scheduled runs. Review the generated images/video in
the workflow's artifact download before flipping it to `true`.

## Optional: royalty-free music for videos

`assets/music/background.mp3` (referenced by `video.music_path` in
`config.yaml`) is not included -- pick your own free-to-use track and drop
it in, for example from:

- [YouTube Audio Library](https://www.youtube.com/audiolibrary) (free,
  no attribution tracks available)
- [Pixabay Music](https://pixabay.com/music/) (free, check each track's
  license)

Leave `video.music_path` empty in `config.yaml` to generate silent videos
instead.
