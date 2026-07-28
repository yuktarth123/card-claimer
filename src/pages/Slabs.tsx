import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { CardTile } from "@/components/CardTile";
import { NameGate } from "@/components/NameGate";
import { CheckoutSheet } from "@/components/CheckoutSheet";
import { useBuyer } from "@/hooks/useBuyer";
import { toast } from "sonner";
import { ChevronLeft, Award, Search, X, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AppLogo from "@/components/AppLogo";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCY, SELLER_NAME, VISUAL_TIERS } from "@/config";
import { cn } from "@/lib/utils";

type Card = Database["public"]["Tables"]["cards"]["Row"];
type Claim = Database["public"]["Tables"]["claims"]["Row"];
type SortOrder = "none" | "price-asc" | "price-desc";
const ALL = "__all__";

const Slabs = () => {
  const { name, phone, sessionId, setIdentity } = useBuyer();
  const [cards, setCards] = useState<Card[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [gradingCompanyFilter, setGradingCompanyFilter] = useState(ALL);
  const [rarityFilter, setRarityFilter] = useState(ALL);
  const [visualTierFilter, setVisualTierFilter] = useState(ALL);
  const [sortOrder, setSortOrder] = useState<SortOrder>("none");
  const [isSaleLive, setIsSaleLive] = useState(false);
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
        .eq("item_type", "slab")
        .order("created_at", { ascending: false });

      if (mounted && cardsData) setCards(cardsData);
      if (cardsError) console.error("Error fetching slabs:", cardsError);

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
        if (settingsError && settingsError.code !== "PGRST116") {
          console.error("Error fetching app settings:", settingsError);
        } else if (settingsData?.sale_start_time) {
          setIsSaleLive(new Date() >= new Date(settingsData.sale_start_time));
        }
      }
      setLoading(false);
    };

    if (sessionId) {
      fetchInitialData();
    }

    const cardsChannel = supabase
      .channel("slabs-cards-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cards" },
        (payload) => {
          setCards((prev) => {
            if (payload.eventType === "INSERT") {
              const next = payload.new as Card;
              return next.item_type === "slab" ? [next, ...prev] : prev;
            }
            if (payload.eventType === "UPDATE") {
              const next = payload.new as Card;
              const exists = prev.some((c) => c.id === next.id);
              if (next.item_type !== "slab") {
                return exists ? prev.filter((c) => c.id !== next.id) : prev;
              }
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

    const settingsChannel = supabase
      .channel("slabs-settings-changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "app_settings", filter: "id=eq.1" },
        (payload) => {
          const newSaleStartTime = (payload.new as Database["public"]["Tables"]["app_settings"]["Row"]).sale_start_time;
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

  // Same expiry sweep as the main storefront -- a slab claimed and abandoned
  // shouldn't stay locked out of stock just because this is a separate page.
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

  const myPendingClaims = useMemo(() => claims.filter((c) => c.status === "claimed"), [claims]);

  const availableGradingCompanies = useMemo(
    () => Array.from(new Set(cards.map((c) => c.grading_company).filter(Boolean))).sort((a, b) => a.localeCompare(b)) as string[],
    [cards]
  );
  const availableRarities = useMemo(
    () => Array.from(new Set(cards.map((c) => c.rarity).filter(Boolean))).sort((a, b) => a.localeCompare(b)) as string[],
    [cards]
  );

  const hasActiveFilters = search.trim() !== "" || gradingCompanyFilter !== ALL || rarityFilter !== ALL || visualTierFilter !== ALL;

  const clearFilters = () => {
    setSearch("");
    setGradingCompanyFilter(ALL);
    setRarityFilter(ALL);
    setVisualTierFilter(ALL);
  };

  const visible = useMemo(() => {
    let filteredCards = cards;

    const q = search.trim().toLowerCase();
    if (q) {
      filteredCards = filteredCards.filter((c) =>
        [c.name, c.card_set, c.card_number, c.rarity, c.grading_company, c.grade].filter(Boolean).some((f) => f!.toLowerCase().includes(q))
      );
    }
    if (gradingCompanyFilter !== ALL) filteredCards = filteredCards.filter((c) => c.grading_company === gradingCompanyFilter);
    if (rarityFilter !== ALL) filteredCards = filteredCards.filter((c) => c.rarity === rarityFilter);
    if (visualTierFilter !== ALL) filteredCards = filteredCards.filter((c) => c.visual_tier === visualTierFilter);

    if (sortOrder === "price-asc") {
      filteredCards = [...filteredCards].sort((a, b) => Number(a.price) - Number(b.price));
    } else if (sortOrder === "price-desc") {
      filteredCards = [...filteredCards].sort((a, b) => Number(b.price) - Number(a.price));
    }

    return filteredCards;
  }, [cards, search, gradingCompanyFilter, rarityFilter, visualTierFilter, sortOrder]);

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
    const { error } = await supabase.rpc("release_claim", { _claim_id: claim.id, _session_id: sessionId });
    if (error) {
      toast.error("Couldn't unclaim");
    } else {
      toast("Released");
      if (toastIdToDismiss) toast.dismiss(toastIdToDismiss);
      await refetchClaims();
    }
  };

  return (
    <div className="min-h-screen pb-28">
      <NameGate
        open={!name || !phone}
        initialName={name}
        onSubmit={(n, p) => {
          setIdentity(n, p);
          toast.success(`Welcome, ${n}! 👋`);
        }}
      />

      <header className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 gradient-hero opacity-20" />
        <div className="relative container py-8 md:py-12">
          <div className="flex items-center gap-3 mb-4">
            <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ChevronLeft className="w-4 h-4" /> Back to Store
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-gold flex items-center justify-center shadow-glow">
                <AppLogo className="w-full h-full" alt={`${SELLER_NAME} Logo`} />
              </div>
              <span className="font-display font-bold text-sm uppercase">{SELLER_NAME}</span>
            </div>
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-balance flex items-center gap-3">
            <Award className="w-8 h-8 md:w-10 md:h-10 text-amber-400" />
            The Slab Vault
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            Graded, certified, and one-of-a-kind. Gold-ringed listings are top-graded gems; holo-ringed ones are the low-population grails.
          </p>
        </div>
      </header>

      <main className="container py-6">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, set, grader, or grade…"
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

        <div className="flex flex-wrap items-center gap-2 mb-5">
          <Button size="sm" variant="outline" onClick={() => setFiltersOpen((v) => !v)} className="sm:hidden">
            <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" /> Filters
          </Button>

          <div className={cn("flex-wrap items-center gap-2 sm:flex", filtersOpen ? "flex" : "hidden")}>
            {availableGradingCompanies.length > 0 && (
              <Select value={gradingCompanyFilter} onValueChange={setGradingCompanyFilter}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Grader" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Any grader</SelectItem>
                  {availableGradingCompanies.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {availableRarities.length > 0 && (
              <Select value={rarityFilter} onValueChange={setRarityFilter}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Rarity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Any rarity</SelectItem>
                  {availableRarities.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={visualTierFilter} onValueChange={setVisualTierFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any tier</SelectItem>
                {VISUAL_TIERS.filter((t) => t.value !== "standard").map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button size="sm" variant="ghost" onClick={clearFilters} className="text-muted-foreground">
                <X className="w-3.5 h-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>

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
            <Award className="w-12 h-12 mx-auto mb-3 opacity-40" />
            {cards.length === 0 ? (
              <p className="text-lg">No slabs listed yet. Check back soon!</p>
            ) : (
              <>
                <p className="text-lg">No slabs match your search or filters.</p>
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

export default Slabs;
