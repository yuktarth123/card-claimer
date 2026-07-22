import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { CardTile } from "@/components/CardTile";
import { NameGate } from "@/components/NameGate";
import { CheckoutSheet } from "@/components/CheckoutSheet";
import { useBuyer } from "@/hooks/useBuyer";
import { toast } from "sonner";
import { Zap, Trophy, Search, X, Truck, SlidersHorizontal, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import CountdownTimer from "@/components/CountdownTimer";
import { CURRENCY, SELLER_NAME, CARD_CONDITIONS, ITEM_TYPES } from "@/config";
import AppLogo from "@/components/AppLogo";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import WhatsAppBanner from "@/components/WhatsAppBanner";
import CrossPromoBanner from "@/components/CrossPromoBanner";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import { cn } from "@/lib/utils";

type Card = Database["public"]["Tables"]["cards"]["Row"];
type Claim = Database["public"]["Tables"]["claims"]["Row"];
type Filter = "all" | "available" | "mine";
type SortOrder = "none" | "price-asc" | "price-desc";
const ALL = "__all__";

const Index = () => {
  const { name, phone, sessionId, setName, setIdentity } = useBuyer();
  const [cards, setCards] = useState<Card[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("price-desc");
  const [search, setSearch] = useState("");
  const [itemTypeFilter, setItemTypeFilter] = useState(ALL);
  const [cardSetFilter, setCardSetFilter] = useState(ALL);
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [conditionFilter, setConditionFilter] = useState(ALL);
  const [preorderOnly, setPreorderOnly] = useState(false);
  const [vintageOnly, setVintageOnly] = useState(false);
  const [isSaleLive, setIsSaleLive] = useState(false);
  const [saleStartTime, setSaleStartTime] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const refetchClaims = async () => {
    if (!sessionId) return;
    const { data, error } = await supabase.rpc("get_my_claims", { _session_id: sessionId });
    if (data) setClaims(data);
    if (error) console.error("Error fetching claims:", error);
  };

  useEffect(() => {
    let mounted = true;

    const fetchInitialData = async () => {
      const { data: cardsData, error: cardsError } = await supabase
        .from("cards")
        .select("*")
        .order("created_at", { ascending: false });

      if (mounted && cardsData) setCards(cardsData);
      if (cardsError) console.error("Error fetching cards:", cardsError);

      const { data: claimsData, error: claimsError } = await supabase.rpc("get_my_claims", {
        _session_id: sessionId || "",
      });

      if (mounted && claimsData) setClaims(claimsData);
      if (claimsError) console.error("Error fetching claims:", claimsError);

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
          setSaleStartTime(null);
          setIsSaleLive(false);
        }
      }
      setLoading(false);
    };

    if (sessionId) {
      fetchInitialData();
    }

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
              const next = payload.new as Card;
              const exists = prev.some((c) => c.id === next.id);
              return exists ? prev.map((c) => (c.id === next.id ? next : c)) : [next, ...prev];
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((c) => c.id !== (payload.old as Card).id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    // Note: there's no realtime subscription for claims here. Buyers
    // read their own claims only through the get_my_claims RPC (see
    // refetchClaims above) -- claims SELECT is admin-only via RLS, and
    // Supabase Realtime enforces that same RLS on postgres_changes, so an
    // anon subscription to this table would silently never fire anyway.
    // Refetch explicitly after every claim/unclaim/checkout action instead.

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
  }, [sessionId]);

  // release_expired_claims() only ever runs as a side effect inside
  // claim_units() -- if a buyer claims something and closes their tab
  // without checking out, and nobody else claims anything afterward, that
  // stock stays locked forever. Sweep on an interval so it happens on its
  // own as long as anyone has the storefront open, independent of whether
  // new claims are being made. The resulting `cards` update flows back
  // through the realtime subscription above, no manual refetch needed.
  useEffect(() => {
    const sweep = () => {
      supabase.rpc("release_expired_claims").then(({ error }) => {
        if (error) console.error("Error releasing expired claims:", error);
      });
    };
    sweep();
    const interval = setInterval(sweep, 30_000);
    return () => clearInterval(interval);
  }, []);

  const myClaimsByCard = useMemo(() => {
    const map: Record<string, Claim[]> = {};
    for (const claim of claims) {
      if (!map[claim.card_id]) map[claim.card_id] = [];
      map[claim.card_id].push(claim);
    }
    return map;
  }, [claims]);

  const myPendingClaims = useMemo(
    () => claims.filter((c) => c.status === "claimed"),
    [claims]
  );

  const availableSets = useMemo(
    () => Array.from(new Set(cards.map((c) => c.card_set).filter(Boolean))).sort((a, b) => a.localeCompare(b)) as string[],
    [cards]
  );
  const availableCategories = useMemo(
    () => Array.from(new Set(cards.map((c) => c.category).filter(Boolean))).sort((a, b) => a.localeCompare(b)) as string[],
    [cards]
  );
  const availableItemTypes = useMemo(
    () => ITEM_TYPES.filter((t) => cards.some((c) => c.item_type === t.value)),
    [cards]
  );

  const hasAdvancedFilters =
    itemTypeFilter !== ALL ||
    cardSetFilter !== ALL ||
    categoryFilter !== ALL ||
    conditionFilter !== ALL ||
    preorderOnly ||
    vintageOnly;

  const hasActiveFilters =
    search.trim() !== "" ||
    hasAdvancedFilters ||
    filter !== "all";

  const clearFilters = () => {
    setSearch("");
    setItemTypeFilter(ALL);
    setCardSetFilter(ALL);
    setCategoryFilter(ALL);
    setConditionFilter(ALL);
    setPreorderOnly(false);
    setVintageOnly(false);
    setFilter("all");
  };

  const visible = useMemo(() => {
    let filteredCards = cards;

    if (filter === "available") {
      filteredCards = cards.filter((c) => c.quantity_available > 0);
    } else if (filter === "mine") {
      filteredCards = cards.filter((c) => (myClaimsByCard[c.id]?.length ?? 0) > 0);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      filteredCards = filteredCards.filter((c) =>
        [c.name, c.card_set, c.card_number, c.rarity].filter(Boolean).some((f) => f!.toLowerCase().includes(q))
      );
    }
    if (itemTypeFilter !== ALL) filteredCards = filteredCards.filter((c) => c.item_type === itemTypeFilter);
    if (cardSetFilter !== ALL) filteredCards = filteredCards.filter((c) => c.card_set === cardSetFilter);
    if (categoryFilter !== ALL) filteredCards = filteredCards.filter((c) => c.category === categoryFilter);
    if (conditionFilter !== ALL) filteredCards = filteredCards.filter((c) => c.condition === conditionFilter);
    if (preorderOnly) filteredCards = filteredCards.filter((c) => c.is_preorder);
    if (vintageOnly) filteredCards = filteredCards.filter((c) => c.is_vintage);

    if (sortOrder === "price-asc") {
      filteredCards = [...filteredCards].sort((a, b) => Number(a.price) - Number(b.price));
    } else if (sortOrder === "price-desc") {
      filteredCards = [...filteredCards].sort((a, b) => Number(b.price) - Number(a.price));
    }

    return filteredCards;
  }, [cards, filter, myClaimsByCard, sortOrder, search, itemTypeFilter, cardSetFilter, categoryFilter, conditionFilter, preorderOnly, vintageOnly]);

  const totalListedValue = useMemo(() => {
    return cards.reduce((sum, card) => sum + Number(card.price) * card.quantity_available, 0);
  }, [cards]);

  const handleClaim = async (card: Card, quantity: number) => {
    if (!isSaleLive) {
      toast.info("The sale hasn't started yet! Stay tuned.");
      return;
    }
    if (!name) return;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(20);
    }
    const { error } = await supabase.rpc("claim_units", {
      _card_id: card.id,
      _buyer_name: name,
      _session_id: sessionId,
      _quantity: quantity,
      _buyer_phone: phone || null,
    });
    if (error) {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.([40, 30, 40]);
      }
      toast.error(error.message?.includes("left in stock") ? error.message : "Too late! Someone beat you to it.");
    } else {
      toast.success(`Claimed ${quantity} × ${card.name}!`, { description: "Open your cart to checkout." });
      await refetchClaims();
    }
  };

  const handleUnclaim = async (claim: Claim, toastIdToDismiss?: string | number) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(10);
    }
    const { error } = await supabase.rpc("release_claim", {
      _claim_id: claim.id,
      _session_id: sessionId,
    });
    if (error) {
      toast.error("Couldn't unclaim");
    } else {
      toast("Released");
      if (toastIdToDismiss) {
        toast.dismiss(toastIdToDismiss);
      }
      await refetchClaims();
    }
  };

  const availableCount = cards.filter((c) => c.quantity_available > 0).length;

  return (
    <div className="min-h-screen pb-28">
      <NameGate
        open={!name || !phone}
        initialName={name}
        onSubmit={(n, p) => {
          const wasReturning = Boolean(name);
          setIdentity(n, p);
          toast.success(wasReturning ? `Thanks, ${n}!` : `Welcome, ${n}! 👋`, {
            description: isSaleLive ? "The sale is live — start claiming!" : "Get ready, the sale starts soon.",
          });
        }}
      />
      <PwaInstallBanner />

      {/* Hero */}
      <header className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 gradient-hero opacity-30" />
        <div className="relative container py-8 md:py-12">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center shadow-glow">
              <AppLogo className="w-full h-full" alt={`${SELLER_NAME} Logo`} />
            </div>
            <span className="font-display font-bold tracking-wide text-base uppercase text-foreground">
              {SELLER_NAME}
            </span>
            <Link
              to="/leaderboard"
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/30 text-sm font-semibold text-primary hover:bg-primary/25 transition"
            >
              <Trophy className="w-4 h-4" /> Leaderboard
            </Link>
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-balance">
            Pokémon Cards <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Live Sale</span>
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            {isSaleLive
              ? "Claim as many units as you want — first come, first served while stock lasts."
              : "Get ready! Preview the cards now, the live sale starts soon."}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-5">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/15 border border-success/30">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-sm font-semibold text-success">{availableCount} listings in stock</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/30">
              <span className="text-sm font-semibold text-primary">Total Listed: {CURRENCY}{totalListedValue.toFixed(0)}</span>
            </div>
            {!isSaleLive && saleStartTime && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/30">
                <CountdownTimer targetDate={saleStartTime} onCountdownEnd={() => setIsSaleLive(true)} className="text-primary" />
              </div>
            )}
            {!isSaleLive && !saleStartTime && (
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
        <WhatsAppBanner className="mb-3" />
        <CrossPromoBanner className="mb-6" />

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, set, or card number…"
            className="pl-9 pr-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter pills, facet selects, and Sort dropdown */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {([
            { k: "all", label: `All (${cards.length})` },
            { k: "available", label: `In Stock (${availableCount})` },
            { k: "mine", label: `My Claims (${Object.keys(myClaimsByCard).length})` },
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

          <Button
            size="sm"
            variant="outline"
            onClick={() => setFiltersOpen((v) => !v)}
            className="md:hidden ml-auto"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />
            Filters
            {hasAdvancedFilters && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-primary" />}
          </Button>
        </div>

        <div className={cn("flex-wrap items-center gap-2 mb-5 overflow-x-auto pb-1 md:flex", filtersOpen ? "flex" : "hidden")}>
          {availableItemTypes.length > 1 && (
            <Select value={itemTypeFilter} onValueChange={setItemTypeFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Item type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any item type</SelectItem>
                {availableItemTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {availableSets.length > 0 && (
            <Select value={cardSetFilter} onValueChange={setCardSetFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Set" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any set</SelectItem>
                {availableSets.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {availableCategories.length > 0 && (
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any category</SelectItem>
                {availableCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={conditionFilter} onValueChange={setConditionFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Condition" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any condition</SelectItem>
              {CARD_CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant={preorderOnly ? "default" : "outline"}
            onClick={() => setPreorderOnly((v) => !v)}
            className={preorderOnly ? "bg-secondary hover:bg-secondary/90 text-secondary-foreground font-bold border-0" : ""}
          >
            <Truck className="w-3.5 h-3.5 mr-1" /> Pre-Orders
          </Button>

          <Button
            size="sm"
            variant={vintageOnly ? "default" : "outline"}
            onClick={() => setVintageOnly((v) => !v)}
            className={vintageOnly ? "bg-amber-900 hover:bg-amber-900/90 text-amber-100 font-bold border-0" : ""}
          >
            <History className="w-3.5 h-3.5 mr-1" /> Vintage
          </Button>

          {hasActiveFilters && (
            <Button size="sm" variant="ghost" onClick={clearFilters} className="text-muted-foreground">
              <X className="w-3.5 h-3.5 mr-1" /> Clear
            </Button>
          )}

          <div className="ml-auto">
            <Select value={sortOrder} onValueChange={(value: SortOrder) => setSortOrder(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sort by Price" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Default (Newest)</SelectItem>
                <SelectItem value="price-asc">Price: Low to High</SelectItem>
                <SelectItem value="price-desc">Price: High to Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <AppLogo className="w-12 h-12 mx-auto mb-3 opacity-40" alt={`${SELLER_NAME} Logo`} />
            {cards.length === 0 ? (
              <p className="text-lg">No listings here yet. Check back soon!</p>
            ) : (
              <>
                <p className="text-lg">No listings match your search or filters.</p>
                <Button variant="outline" size="sm" onClick={clearFilters} className="mt-3">
                  Clear filters
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {visible.map((c) => (
              <CardTile
                key={c.id}
                card={c}
                myClaims={myClaimsByCard[c.id] || []}
                onClaim={handleClaim}
                onUnclaim={handleUnclaim}
                disabled={!name && isSaleLive}
                isSaleLive={isSaleLive}
              />
            ))}
          </div>
        )}
      </main>

      <CheckoutSheet myClaims={myPendingClaims} cards={cards} buyerName={name} onUnclaim={handleUnclaim} isSaleLive={isSaleLive} onFinalized={refetchClaims} />
    </div>
  );
};

export default Index;
