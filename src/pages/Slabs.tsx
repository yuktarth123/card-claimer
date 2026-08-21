import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { NameGate } from "@/components/NameGate";
import { CheckoutSheet } from "@/components/CheckoutSheet";
import { CategoryGrid } from "@/components/CategoryGrid";
import { useBuyer } from "@/hooks/useBuyer";
import { useCategoryListing } from "@/hooks/useCategoryListing";
import { toast } from "sonner";
import { ChevronLeft, Search, X, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AppLogo from "@/components/AppLogo";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SELLER_NAME, VISUAL_TIERS } from "@/config";
import { CATEGORY_META } from "@/lib/categoryMeta";
import { cn } from "@/lib/utils";

type SortOrder = "none" | "price-asc" | "price-desc";
const ALL = "__all__";
const meta = CATEGORY_META.slab;

const Slabs = () => {
  const { name, phone, setIdentity } = useBuyer();
  const {
    cards,
    loading,
    isSaleLive,
    myClaimsByCard,
    myPendingClaims,
    refetchClaims,
    handleClaim,
    handleUnclaim,
  } = useCategoryListing("slab");

  const [search, setSearch] = useState("");
  const [gradingCompanyFilter, setGradingCompanyFilter] = useState(ALL);
  const [rarityFilter, setRarityFilter] = useState(ALL);
  const [visualTierFilter, setVisualTierFilter] = useState(ALL);
  const [sortOrder, setSortOrder] = useState<SortOrder>("none");
  const [filtersOpen, setFiltersOpen] = useState(false);

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

    // Out-of-stock listings sink to the bottom, but a stable sort keeps
    // everything else in whatever order the block above produced.
    filteredCards = [...filteredCards].sort((a, b) =>
      (a.quantity_available > 0 ? 0 : 1) - (b.quantity_available > 0 ? 0 : 1)
    );

    return filteredCards;
  }, [cards, search, gradingCompanyFilter, rarityFilter, visualTierFilter, sortOrder]);

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
            <Link
              to="/"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/30 text-sm font-semibold text-primary hover:bg-primary/25 transition"
            >
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
            <meta.icon className="w-8 h-8 md:w-10 md:h-10 text-amber-400" />
            The Slab Vault
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl">{meta.description}</p>
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

        <CategoryGrid
          cards={cards}
          visible={visible}
          loading={loading}
          myClaimsByCard={myClaimsByCard}
          onClaim={handleClaim}
          onUnclaim={handleUnclaim}
          buyerName={name}
          isSaleLive={isSaleLive}
          emptyIcon={meta.icon}
          emptyMessage={meta.emptyMessage}
          noMatchMessage={meta.noMatchMessage}
          onClearFilters={clearFilters}
        />
      </main>

      <CheckoutSheet myClaims={myPendingClaims} cards={cards} buyerName={name} onUnclaim={handleUnclaim} isSaleLive={isSaleLive} onFinalized={refetchClaims} />
    </div>
  );
};

export default Slabs;
