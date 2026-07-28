import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceInfo } from "@/lib/deviceInfo";

const VISITOR_ID_KEY = "site_visitor_id"; // localStorage -- persists across sessions, identifies a returning browser
const VISIT_ID_KEY = "site_visit_id"; // sessionStorage -- one per tab session, cleared on tab close
const HEARTBEAT_INTERVAL_MS = 20_000;

function getOrCreateVisitorId(): string {
  let id = localStorage.getItem(VISITOR_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_ID_KEY, id);
  }
  return id;
}

// Headless -- mounted once at the app root (see App.tsx) so it logs exactly
// one visit per tab session regardless of which page loads first, and keeps
// that same row's last_seen_at ticking forward while the tab stays open and
// visible. Duration is derived on read (last_seen_at - created_at) rather
// than captured via a beforeunload/sendBeacon call, since those are flaky in
// practice (backgrounded tabs, mobile Safari, etc. can skip them entirely).
export function AnalyticsTracker() {
  const visitIdRef = useRef<string | null>(sessionStorage.getItem(VISIT_ID_KEY));

  useEffect(() => {
    let cancelled = false;

    const logVisit = async () => {
      if (visitIdRef.current) return;

      const visitorId = getOrCreateVisitorId();
      const { deviceType, browser, browserVersion, os } = getDeviceInfo();
      const id = crypto.randomUUID();

      const { error } = await supabase.from("site_visits").insert({
        id,
        visitor_id: visitorId,
        entry_path: window.location.pathname,
        device_type: deviceType,
        browser,
        browser_version: browserVersion,
        os,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent,
      });

      if (!error && !cancelled) {
        sessionStorage.setItem(VISIT_ID_KEY, id);
        visitIdRef.current = id;
      }
    };

    logVisit();

    const heartbeat = () => {
      if (document.visibilityState !== "visible" || !visitIdRef.current) return;
      supabase
        .from("site_visits")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", visitIdRef.current)
        .then(({ error }) => {
          if (error) console.error("Analytics heartbeat failed:", error);
        });
    };

    const interval = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", heartbeat);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, []);

  return null;
}
