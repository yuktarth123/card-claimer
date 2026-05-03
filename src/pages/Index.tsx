import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { CardTile } from "@/components/CardTile";
import { NameGate } from "@/components/NameGate";
import { CheckoutSheet } from "@/components/CheckoutSheet";
import { useBuyer } from "@/hooks/useBuyer";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import CountdownTimer from "@/components/CountdownTimer";
import { SELLER_NAME } from "@/config"; // Import SELLER_NAME
// SALE_START_TIME is now fetched from Supabase, not from config.ts

type Card = Database["public"]["Tables"]["cards"]["Row"];
type Filter = "all" | "available" | "mine";

const Index = () => {
  const { name, sessionId, setName } = useBuyer();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [isSaleLive, setIsSaleLive] = useState(false);
  const [saleStartTime, setSaleStartTime] = useState<string | null>(null); // State for sale start time from DB

  useEffect(() => {
    let mounted = true;

    const fetchInitialData = async () => {
      // Fetch cards
      const { data: cardsData, error: cardsError } = await supabase
        .from("cards")
        .select("*")
        .order("created_at", { ascending: false });

      if (mounted && cardsData) setCards(cardsData);
      if (cardsError) console.error("Error fetching cards:", cardsError);

      // Fetch sale start time
      const { data: settingsData, error: settingsError } = await supabase
        .from("app_settings")
        .select("sale_start_time")
        .eq("id", 1)
        .single();

      if (mounted) {
        if (settingsError && settingsError.code !== 'PGRST116') {
          console.error("Error fetching app settings:", settingsError);
          toast.error("Failed to load sale settings.");
        } else if (settingsData?.sale_start_time) {
          setSaleStartTime(settingsData.sale_start_time);
          setIsSaleLive(new Date() >= new Date(settingsData.sale_start_time));
        } else {
          // If no sale_start_time is set, sale is not live
          setSaleStartTime(null);
          setIsSaleLive(false);
        }
      }
      setLoading(false);
    };

    fetchInitialData();

    const cardsChannel = supabase
      .channel("index-cards-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cards" },
        (payload) => {
          setCards((prev) => {
            if (payload.eventType === "INSERT") {
              return [payload.new as Card, ...prev];
            }
            if (payload.eventType === "UPDATE") {
              return prev.map((c) => (c.id === (payload.new as Card).id ? (payload.new as Card) : c));
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((c) => c.id !== (payload.old as Card).id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    const settingsChannel = supabase
      .channel("index-settings-changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "app_settings", filter: "id=eq.1" },
        (payload) => {
          const newSaleStartTime = (payload.new as Database["public"]["Tables"]["app_settings"]["Row"]).sale_start_time;
          setSaleStartTime(newSaleStartTime);
          setIsSaleLive(newSaleStartTime ? new Date() >= new Date(newSaleStartTime) : false);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(cardsChannel);
      supabase.removeChannel(settingsChannel);
    };
  }, []);

  const myCards = useMemo(
    () => cards.filter((c) => c.buyer_session_id === sessionId && c.status === "claimed"),
    [cards, sessionId]
  );

  const visible = useMemo(() => {
    if (filter === "available") return cards.filter((c) => c.status === "available");
    if (filter === "mine") return myCards;
    return cards;
  }, [cards, filter, myCards]);

  const handleClaim = async (card: Card) => {
    if (!isSaleLive) {
      toast.info("The sale hasn't started yet! Stay tuned.");
      return;
    }
    if (!name) return;
    const { error } = await supabase.rpc("claim_card", {
      _card_id: card.id,
      _buyer_name: name,
      _session_id: sessionId,
    });
    if (error) {
      toast.error("Too late! Someone beat you to it.");
    } else {
      toast.success(`Claimed ${card.name}!`, { description: "Open your cart to checkout." });
    }
  };

  const handleUnclaim = async (card: Card) => {
    const { error } = await supabase.rpc("unclaim_card", {
      _card_id: card.id,
      _session_id: sessionId,
    });
    if (error) toast.error("Couldn't unclaim");
    else toast("Released", { description: card.name });
  };

  const availableCount = cards.filter((c) => c.status === "available").length;

  return (
    <div className="min-h-screen pb-32">
      <NameGate open={!name && isSaleLive} onSubmit={setName} />

      {/* Hero */}
      <header className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 gradient-hero opacity-30" />
        <div className="relative container py-8 md:py-12">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center shadow-glow">
              <img src="/yanks-tcg-logo.png" alt="Yanks TCG Logo" className="w-full h-full object-contain p-1" />
            </div>
            <span className="font-bold tracking-wide text-sm uppercase text-muted-foreground">
              {SELLER_NAME}
            </span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-balance">
            Pokémon Cards <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Live Sale</span>
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            {isSaleLive
              ? "First trainer to claim wins the card. Tap to lock it in — everyone sees it instantly."
              : "Get ready! Preview cards now, the live sale starts soon. First-come, first-served when it goes live!"}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-5">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/15 border border-success/30">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-sm font-semibold text-success">{availableCount} available</span>
            </div>
            {!isSaleLive && saleStartTime && ( // Only show countdown if saleStartTime is set and not live
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/30">
                <CountdownTimer targetDate={saleStartTime} onCountdownEnd={() => setIsSaleLive(true)} className="text-primary" />
              </div>
            )}
            {!isSaleLive && !saleStartTime && ( // Show message if saleStartTime is not set
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/30">
                <span className="text-sm font-semibold text-primary">Sale time not set yet!</span>
              </div>
            )}
            {name && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="text-sm">Trainer: <strong>{name}</strong></span>
                <button onClick={() => setName("")} className="text-xs text-muted-foreground hover:text-foreground underline ml-1">change</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container py-6">
        {/* Filter pills */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {([
            { k: "all", label: `All (${cards.length})` },
            { k: "available", label: `Available (${availableCount})` },
            { k: "mine", label: `My Claims (${myCards.length})` },
          ] as const).map((f) => (
            <Button
              key={f.k}
              size="sm"
              variant={filter === f.k ? "default" : "outline"}
              onClick={() => setFilter(f.k)}
              className={filter === f.k ? "gradient-gold text-primary-foreground font-bold border-0" : ""}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <img src="/yanks-tcg-logo.png" alt="Yanks TCG Logo" className="w-12 h-12 mx-auto mb-3 opacity-40 object-contain" />
            <p className="text-lg">No cards here yet. Check back soon!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {visible.map((c) => (
              <CardTile
                key={c.id}
                card={c}
                isMine={c.buyer_session_id === sessionId && c.status === "claimed"}
                onClaim={handleClaim}
                onUnclaim={handleUnclaim}
                disabled={!name && isSaleLive} // Disable if no name AND sale is live
                isSaleLive={isSaleLive} // Pass sale live status
              />
            ))}
          </div>
        )}
      </main>

      <CheckoutSheet myCards={myCards} buyerName={name} onUnclaim={handleUnclaim} />
    </div>
  );
};

export default Index;