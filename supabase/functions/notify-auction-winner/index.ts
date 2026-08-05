// Sends a Web Push notification to a bid winner. Called by
// trg_notify_auction_winner (see the bidding migration) the instant an
// auction transitions to 'ended' with a winner -- entirely free, since Web
// Push is a browser standard (VAPID keys), not a paid SMS/WhatsApp service.
//
// Required secrets (set via `supabase secrets set`):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY -- generate once with
//   `npx web-push generate-vapid-keys`. VAPID_PUBLIC_KEY must match the one
//   baked into src/config.ts (VAPID_PUBLIC_KEY) -- they're a matched pair.
//   VAPID_SUBJECT -- a mailto: address or site URL, e.g. mailto:you@example.com
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-injected by the
// platform for every Edge Function -- no extra secret needed. Using the
// service role key here is intentional: push_subscriptions has no public
// SELECT policy at all, so this is the only thing that can ever read it.

import webpush from "npm:web-push@3.6.7";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json({ error: "VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not configured on this function." }, 500);
  }

  try {
    const { winner_session_id, winner_name, winner_amount, title } = await req.json();
    if (!winner_session_id) {
      return json({ error: "Missing winner_session_id" }, 400);
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const subsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?buyer_session_id=eq.${encodeURIComponent(winner_session_id)}&select=id,endpoint,p256dh,auth`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const subs: PushSubscriptionRow[] = await subsRes.json();

    const payload = JSON.stringify({
      title: "You won! 🎉",
      body: `Hi ${winner_name || "there"}, you won "${title}" for ₹${Number(winner_amount).toFixed(0)}. Complete payment to claim it!`,
      url: "/bidding",
    });

    const staleIds: string[] = [];
    let sentCount = 0;
    let failedCount = 0;
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          sentCount++;
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            staleIds.push(sub.id);
          } else {
            failedCount++;
            console.error("push send failed:", err);
          }
        }
      })
    );

    if (staleIds.length > 0) {
      await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=in.(${staleIds.join(",")})`, {
        method: "DELETE",
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      });
    }

    return json({ sent: sentCount, removed: staleIds.length, failed: failedCount });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
