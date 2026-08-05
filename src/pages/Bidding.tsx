import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { useBuyer } from "@/hooks/useBuyer";
import { NameGate } from "@/components/NameGate";
import { AuctionCard } from "@/components/AuctionCard";
import { effectiveAuctionStatus } from "@/lib/auction";
import { SELLER_NAME, BID_DISCLAIMER } from "@/config";
import { Link } from "react-router-dom";
import { Gavel, ShieldAlert, Zap, ArrowLeft } from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { toast } from "sonner";

type AuctionItem = Database["public"]["Tables"]["auction_items"]["Row"];

const Bidding = () => {
  const { name, phone, sessionId, setIdentity } = useBuyer();
  const [editingProfile, setEditingProfile] = useState(false);
  const [items, setItems] = useState<AuctionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    let mounted = true;

    const fetchItems = async () => {
      const { data, error } = await supabase
        .from("auction_items")
        .select("*")
        .order("start_time", { ascending: true });
      if (mounted && data) setItems(data);
      if (error) console.error("Error fetching auctions:", error);
      setLoading(false);
    };

    fetchItems();

    const channel = supabase
      .channel("bidding-auction-items")
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_items" }, (payload) => {
        setItems((prev) => {
          if (payload.eventType === "INSERT") return [...prev, payload.new as AuctionItem];
          if (payload.eventType === "UPDATE") {
            const next = payload.new as AuctionItem;
            return prev.some((i) => i.id === next.id) ? prev.map((i) => (i.id === next.id ? next : i)) : [...prev, next];
          }
          if (payload.eventType === "DELETE") return prev.filter((i) => i.id !== (payload.old as AuctionItem).id);
          return prev;
        });
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Keeps scheduled -> live -> ended transitions (and winner fields) moving
  // forward even if nobody bids right at the boundary -- same pattern as the
  // release_expired_claims sweep on the storefront.
  useEffect(() => {
    const sweep = () => {
      supabase.rpc("sync_auction_statuses").then(({ error }) => {
        if (error) console.error("Error syncing auction statuses:", error);
      });
    };
    sweep();
    const interval = setInterval(sweep, 15_000);
    return () => clearInterval(interval);
  }, []);

  const { live, scheduled, ended } = useMemo(() => {
    const live: AuctionItem[] = [];
    const scheduled: AuctionItem[] = [];
    const ended: AuctionItem[] = [];
    for (const item of items) {
      const status = effectiveAuctionStatus(item, now);
      if (status === "live") live.push(item);
      else if (status === "scheduled") scheduled.push(item);
      else if (status === "ended") ended.push(item);
    }
    scheduled.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    ended.sort((a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime());
    return { live, scheduled, ended: ended.slice(0, 12) };
  }, [items, now]);

  return (
    <div className="min-h-screen pb-16">
      <NameGate
        open={!name || !phone}
        initialName={name}
        description="Enter your name and phone to start bidding. Your phone is how we'll reach you if you win."
        onSubmit={(n, p) => {
          setIdentity(n, p);
          toast.success(`Welcome, ${n}! 👋`, { description: "Good luck bidding!" });
        }}
      />
      <NameGate
        open={editingProfile}
        initialName={name}
        initialPhone={phone}
        title="Update your profile"
        description="Change the name and phone you're bidding under."
        onCancel={() => setEditingProfile(false)}
        onSubmit={(n, p) => {
          setIdentity(n, p);
          setEditingProfile(false);
          toast.success(`Updated to ${n}`);
        }}
      />

      <header className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 gradient-hero opacity-30" />
        <div className="relative container py-8 md:py-12">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center shadow-glow">
              <AppLogo className="w-full h-full" alt={`${SELLER_NAME} Logo`} />
            </div>
            <span className="font-display font-bold tracking-wide text-base uppercase text-foreground">{SELLER_NAME}</span>
            <Link to="/" className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted border border-border text-sm font-semibold hover:bg-muted/70 transition">
              <ArrowLeft className="w-4 h-4" /> Back to sale
            </Link>
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-balance">
            Live <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Bidding</span>
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            Bid ₹100 at a time, or set your own amount. Highest bid when the clock hits zero wins.
          </p>
          {name && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border mt-4 w-fit">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="text-sm">Bidder: <strong>{name}</strong></span>
              <button onClick={() => setEditingProfile(true)} className="text-xs text-muted-foreground hover:text-foreground underline ml-1">change</button>
            </div>
          )}
        </div>
      </header>

      <main className="container py-6 space-y-8">
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{BID_DISCLAIMER}</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[4/3] rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Gavel className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-lg">No auctions yet. Check back soon!</p>
          </div>
        ) : (
          <>
            {live.length > 0 && (
              <Section title={`Live Now (${live.length})`}>
                {live.map((item) => (
                  <AuctionCard key={item.id} item={item} sessionId={sessionId} buyerName={name} buyerPhone={phone} />
                ))}
              </Section>
            )}
            {scheduled.length > 0 && (
              <Section title={`Upcoming (${scheduled.length})`}>
                {scheduled.map((item) => (
                  <AuctionCard key={item.id} item={item} sessionId={sessionId} buyerName={name} buyerPhone={phone} />
                ))}
              </Section>
            )}
            {ended.length > 0 && (
              <Section title="Recently Ended">
                {ended.map((item) => (
                  <AuctionCard key={item.id} item={item} sessionId={sessionId} buyerName={name} buyerPhone={phone} />
                ))}
              </Section>
            )}
          </>
        )}
      </main>
    </div>
  );
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-bold mb-3">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
    </div>
  );
}

export default Bidding;
