import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { useBuyer } from "@/hooks/useBuyer";
import { NameGate } from "@/components/NameGate";
import { LiveChat } from "@/components/LiveChat";
import { SlotGrid } from "@/components/SlotGrid";
import { BreakCheckoutSheet } from "@/components/BreakCheckoutSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2, Package } from "lucide-react";
import { CURRENCY } from "@/config";
import { extractYouTubeId } from "@/lib/youtube";
import { toast } from "sonner";

type BoxBreak = Database["public"]["Tables"]["box_breaks"]["Row"];
type BreakSlotClaim = Database["public"]["Tables"]["break_slot_claims"]["Row"];

const statusLabel: Record<string, string> = {
  upcoming: "Starting Soon",
  live: "🔴 Live Now",
  ended: "Ended",
};

const LiveBreak = () => {
  const { breakId } = useParams<{ breakId: string }>();
  const { name, phone, sessionId, setName, setIdentity } = useBuyer();
  const [breakRow, setBreakRow] = useState<BoxBreak | null>(null);
  const [claims, setClaims] = useState<BreakSlotClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlots, setSelectedSlots] = useState<Set<number>>(new Set());
  const [claiming, setClaiming] = useState(false);

  const refetchClaims = async () => {
    if (!breakId) return;
    const { data, error } = await supabase.from("break_slot_claims").select("*").eq("break_id", breakId);
    if (error) console.error("Error fetching slot claims:", error);
    if (data) setClaims(data);
  };

  useEffect(() => {
    if (!breakId) return;
    let mounted = true;

    (async () => {
      const { data, error } = await supabase.from("box_breaks").select("*").eq("id", breakId).single();
      if (error) console.error("Error fetching break:", error);
      if (mounted) setBreakRow(data ?? null);
      await refetchClaims();
      if (mounted) setLoading(false);
    })();

    const claimsChannel = supabase
      .channel(`break-slot-claims-${breakId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "break_slot_claims", filter: `break_id=eq.${breakId}` },
        (payload) => {
          setClaims((prev) => {
            if (payload.eventType === "INSERT") {
              const next = payload.new as BreakSlotClaim;
              return prev.some((c) => c.id === next.id) ? prev : [...prev, next];
            }
            if (payload.eventType === "UPDATE") {
              const next = payload.new as BreakSlotClaim;
              return prev.map((c) => (c.id === next.id ? next : c));
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((c) => c.id !== (payload.old as BreakSlotClaim).id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    const breakChannel = supabase
      .channel(`box-break-${breakId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "box_breaks", filter: `id=eq.${breakId}` },
        (payload) => setBreakRow(payload.new as BoxBreak)
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(claimsChannel);
      supabase.removeChannel(breakChannel);
    };
  }, [breakId]);

  // Same purpose as the equivalent sweep on the main storefront: frees up
  // slots whose claimant never checked out, independent of anyone taking a
  // new action.
  useEffect(() => {
    const sweep = () => {
      supabase.rpc("release_expired_break_slot_claims").then(({ error }) => {
        if (error) console.error("Error releasing expired slot claims:", error);
      });
    };
    sweep();
    const interval = setInterval(sweep, 30_000);
    return () => clearInterval(interval);
  }, []);

  const myPendingClaims = useMemo(
    () => claims.filter((c) => c.buyer_session_id === sessionId && c.status === "claimed"),
    [claims, sessionId]
  );

  const toggleSlot = (slot: number) => {
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  };

  const handleClaimSelected = async () => {
    if (!breakRow || !name || selectedSlots.size === 0) return;
    setClaiming(true);
    const { error } = await supabase.rpc("claim_break_slots", {
      _break_id: breakRow.id,
      _slot_numbers: Array.from(selectedSlots),
      _buyer_name: name,
      _session_id: sessionId,
    });
    setClaiming(false);
    if (error) {
      toast.error(error.message ?? "Too late! Someone beat you to a slot.");
      await refetchClaims();
    } else {
      toast.success(`Claimed ${selectedSlots.size} slot${selectedSlots.size === 1 ? "" : "s"}!`, {
        description: "Open your cart to checkout.",
      });
      setSelectedSlots(new Set());
    }
  };

  const handleUnclaim = async (claim: BreakSlotClaim, toastIdToDismiss?: string | number) => {
    const { error } = await supabase.rpc("release_break_slot_claim", { _claim_id: claim.id, _session_id: sessionId });
    if (error) {
      toast.error("Couldn't unclaim");
    } else {
      toast("Released");
      if (toastIdToDismiss) toast.dismiss(toastIdToDismiss);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!breakRow) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-4">
        <Package className="w-10 h-10 text-muted-foreground" />
        <p className="text-lg font-semibold">Break not found</p>
        <Button asChild variant="outline">
          <Link to="/breaks">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to Box Breaks
          </Link>
        </Button>
      </div>
    );
  }

  const selectedTotal = selectedSlots.size * Number(breakRow.price_per_slot);
  const canInteract = Boolean(name) && breakRow.status !== "ended";

  return (
    <div className="min-h-screen pb-28">
      <NameGate
        open={!name || !phone}
        initialName={name}
        onSubmit={(n, p) => {
          setIdentity(n, p);
          toast.success(`Welcome, ${n}! 👋`, { description: "Pick your slots below." });
        }}
      />

      <header className="border-b border-border">
        <div className="container py-4 flex items-center justify-between gap-3">
          <Link to="/breaks" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" /> All Breaks
          </Link>
          {name && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border text-sm">
              Trainer: <strong>{name}</strong>
              <button onClick={() => setName("")} className="text-xs text-muted-foreground hover:text-foreground underline ml-1">
                change
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="container py-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <h1 className="text-2xl md:text-3xl font-black">{breakRow.title}</h1>
          <Badge
            className={
              breakRow.status === "live"
                ? "bg-success text-success-foreground border-0 animate-pulse"
                : breakRow.status === "ended"
                  ? "bg-muted text-muted-foreground border-0"
                  : "bg-primary/15 text-primary border border-primary/30"
            }
          >
            {statusLabel[breakRow.status]}
          </Badge>
          <Badge className="bg-card text-foreground border border-border">
            {CURRENCY}{Number(breakRow.price_per_slot).toFixed(0)} / slot
          </Badge>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {breakRow.youtube_video_id ? (
              <iframe
                className="w-full aspect-video rounded-2xl border border-border"
                src={`https://www.youtube.com/embed/${extractYouTubeId(breakRow.youtube_video_id)}`}
                title={breakRow.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="w-full aspect-video rounded-2xl border border-border bg-muted flex items-center justify-center text-muted-foreground">
                Stream hasn't started yet — check back soon!
              </div>
            )}

            <div className="rounded-2xl border border-border gradient-card-bg p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="font-bold">Pick your slots</h2>
                {selectedSlots.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {selectedSlots.size} selected · {CURRENCY}{selectedTotal.toFixed(0)}
                    </span>
                    <Button size="sm" onClick={handleClaimSelected} disabled={claiming} className="gradient-gold text-primary-foreground font-bold">
                      {claiming && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                      Claim {selectedSlots.size} slot{selectedSlots.size === 1 ? "" : "s"}
                    </Button>
                  </div>
                )}
              </div>
              {!name && <p className="text-sm text-muted-foreground mb-3">Enter your name above to start claiming slots.</p>}
              {breakRow.status === "ended" && <p className="text-sm text-muted-foreground mb-3">This break has ended.</p>}
              <SlotGrid
                totalSlots={breakRow.total_slots}
                pricePerSlot={Number(breakRow.price_per_slot)}
                claims={claims}
                mySessionId={sessionId}
                selectedSlots={selectedSlots}
                onToggleSlot={toggleSlot}
                disabled={!canInteract}
              />
            </div>
          </div>

          <div className="h-[420px] lg:h-auto">
            <LiveChat breakId={breakRow.id} displayName={name} />
          </div>
        </div>
      </main>

      <BreakCheckoutSheet
        breakRow={breakRow}
        myClaims={myPendingClaims}
        buyerName={name}
        onUnclaim={handleUnclaim}
        onFinalized={refetchClaims}
      />
    </div>
  );
};

export default LiveBreak;
