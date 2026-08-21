import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { NameGate } from "@/components/NameGate";
import { CheckoutSheet } from "@/components/CheckoutSheet";
import { CategoryGrid } from "@/components/CategoryGrid";
import { useBuyer } from "@/hooks/useBuyer";
import { useCategoryListing } from "@/hooks/useCategoryListing";
import { toast } from "sonner";
import { ChevronLeft, Search, X, Truck, SlidersHorizontal, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AppLogo from "@/components/AppLogo";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CARD_CONDITIONS, SELLER_NAME } from "@/config";
import { CATEGORY_META } from "@/lib/categoryMeta";
import { cn } from "@/lib/utils";

type SortOrder = "none" | "price-asc" | "price-desc";
const ALL = "__all__";
const meta = CATEGORY_META.sealed_product;

const Sealed = () => {
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
  } = useCategoryListing("sealed_product");

  const [search, setSearch] = useState("");
  const [cardSetFilter, setCardSetFilter] = useState(ALL);
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [conditionFilter, setConditionFilter] = useState(ALL);
  const [preorderOnly, setPreorderOnly] = useState(false);
  const [vintageOnly, setVintageOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("none");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const availableSets = useMemo(
    () => Array.from(new Set(cards.map((c) => c.card_set).filter(Boolean))).sort((a, b) => a.localeCompare(b)) as string[],
    [cards]
  );
  const availableCategories = useMemo(
    () => Array.from(new Set(cards.map((c) => c.category).filter(Boolean))).sort((a, b) => a.localeCompare(b)) as string[],
    [cards]
  );

  const hasActiveFilters =
    search.trim() !== "" ||
    cardSetFilter !== ALL ||
    categoryFilter !== ALL ||
    conditionFilter !== ALL ||
    preorderOnly ||
    vintageOnly;

  const clearFilters = () => {
    setSearch("");
    setCardSetFilter(ALL);
    setCategoryFilter(ALL);
    setConditionFilter(ALL);
    setPreorderOnly(false);
    setVintageOnly(false);
  };

  const visible = useMemo(() => {
    let filteredCards = cards;

    const q = search.trim().toLowerCase();
    if (q) {
      filteredCards = filteredCards.filter((c) =>
        [c.name, c.card_set].filter(Boolean).some((f) => f!.toLowerCase().includes(q))
      );
    }
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

    // Out-of-stock listings sink to the bottom, but a stable sort keeps
    // everything else in whatever order the block above produced.
    filteredCards = [...filteredCards].sort((a, b) =>
      (a.quantity_available > 0 ? 0 : 1) - (b.quantity_available > 0 ? 0 : 1)
    );

    return filteredCards;
  }, [cards, search, cardSetFilter, categoryFilter, conditionFilter, preorderOnly, vintageOnly, sortOrder]);

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
            <meta.icon className="w-8 h-8 md:w-10 md:h-10 text-primary" />
            {meta.label}
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
            placeholder="Search by name or set…"
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

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFiltersOpen((v) => !v)}
            className="md:hidden ml-auto"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />
            Filters
            {hasActiveFilters && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-primary" />}
          </Button>
        </div>

        <div className={cn("flex-wrap items-center gap-2 mb-5 overflow-x-auto pb-1 md:flex", filtersOpen ? "flex" : "hidden")}>
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

export default Sealed;
