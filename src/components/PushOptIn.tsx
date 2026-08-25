import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { VAPID_PUBLIC_KEY } from "@/config";

// pushManager.subscribe wants the VAPID public key as a raw Uint8Array, not
// the base64url string it's stored/transmitted as everywhere else.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

interface Props {
  sessionId: string;
}

/** Opt-in control for auction push notifications (outbid alerts and
 * winner notifications). Renders nothing on browsers without Push API
 * support (e.g. Safari on iOS unless the site has been added to the home
 * screen) -- there's nothing useful to offer there. */
export function PushOptIn({ sessionId }: Props) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window);
  }, []);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, [supported]);

  const subscribe = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.info("Notifications blocked — you can still check back manually.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const subJson = sub.toJSON();
      const { error } = await supabase.rpc("save_push_subscription", {
        _session_id: sessionId,
        _endpoint: subJson.endpoint!,
        _p256dh: subJson.keys!.p256dh,
        _auth: subJson.keys!.auth,
      });
      if (error) throw error;
      setSubscribed(true);
      toast.success("You'll get notified if you're outbid or if you win!");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't enable notifications on this device.");
    } finally {
      setBusy(false);
    }
  };

  if (!supported) return null;

  if (subscribed) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted border border-border text-xs font-semibold text-muted-foreground">
        <BellRing className="w-3.5 h-3.5 text-success" /> Notifications on
      </span>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={subscribe} disabled={busy || !sessionId} className="gap-1.5">
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
      Notify me about my bids
    </Button>
  );
}
