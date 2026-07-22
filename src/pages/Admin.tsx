import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { searchPokemonCards, TCGCard } from "@/lib/pokemontcg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Camera, Upload, Search, Trash2, Plus, X, Loader2, Lock, Clock, Edit, Video, Wrench, Filter, ArrowDownWideNarrow, ArrowUpWideNarrow, CheckCircle2, Gift, Trophy, PackageCheck, LogOut, Copy } from "lucide-react";
import { CURRENCY, USD_TO_INR_RATE, SELLER_NAME, CARD_CONDITIONS, ITEM_TYPES, PREORDER_MIN_DAYS, PREORDER_MAX_DAYS } from "@/config";
import { ComboSelect } from "@/components/ComboSelect";
import { SaleTimeManager } from "@/components/SaleTimeManager";
import AppLogo from "@/components/AppLogo";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EditCardDialog } from "@/components/EditCardDialog";
import { AdditionalPhotosField } from "@/components/AdditionalPhotosField";
import { Textarea } from "@/components/ui/textarea";
import { SaleManager } from "@/components/SaleManager";
import { SiteWideSaleManager } from "@/components/SiteWideSaleManager";
import { SalesHistory } from "@/components/SalesHistory";
import { CardScanner, ScannedCard } from "@/components/CardScanner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useAdminSession } from "@/hooks/useAdminSession";
import { AdminLogin } from "@/components/AdminLogin";
import { cn } from "@/lib/utils";
import { prepareVideoForUpload, isPayloadTooLargeError } from "@/lib/videoUpload";

type DbCard = Database["public"]["Tables"]["cards"]["Row"];
type DbClaim = Database["public"]["Tables"]["claims"]["Row"];
type PriceFilter = "all" | "under-100" | "100-500" | "500-1000" | "1000-plus";
type SortOrder = "newest" | "price-asc" | "price-desc";

// Best-effort match between a vision-identified card and the TCG API's
// search results for that name -- prefers an exact number match (most
// specific), then a set-name match, else the API's own top result (already
// ordered by -set.releaseDate).
function pickBestTcgMatch(results: TCGCard[], visionSet: string | null, visionNumber: string | null): TCGCard | null {
  if (results.length === 0) return null;
  if (visionNumber) {
    const byNumber = results.find((r) => r.number === visionNumber);
    if (byNumber) return byNumber;
  }
  if (visionSet) {
    const setKey = visionSet.toLowerCase();
    const bySet = results.find((r) => r.set?.name?.toLowerCase().includes(setKey));
    if (bySet) return bySet;
  }
  return results[0];
}

const Admin = () => {
  const { session, loading: authLoading } = useAdminSession();
  const [cards, setCards] = useState<DbCard[]>([]);
  const [claims, setClaims] = useState<DbClaim[]>([]);
  const [name, setName] = useState("");
  const [itemType, setItemType] = useState<string>("card");
  const [cardSet, setCardSet] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [rarity, setRarity] = useState("");
  const [category, setCategory] = useState("");
  const [language, setLanguage] = useState("English");
  const [isPreorder, setIsPreorder] = useState(false);
  const [isVintage, setIsVintage] = useState(false);
  const [price, setPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [condition, setCondition] = useState<string>(CARD_CONDITIONS[0]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [photoUrlInput, setPhotoUrlInput] = useState("");
  const [extraPhotoUrls, setExtraPhotoUrls] = useState<string[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [existingVideoUrl, setExistingVideoUrl] = useState<string | null>(null);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [isUpdatingConditions, setIsUpdatingConditions] = useState(false);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const addCardFormRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TCGCard[]>([]);
  const [selectedTcg, setSelectedTcg] = useState<TCGCard | null>(null);
  const [tcgImageUrl, setTcgImageUrl] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<DbCard | null>(null);
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  const fetchCards = async () => {
    let query = supabase.from("cards").select("*");

    if (priceFilter === "under-100") {
      query = query.lt("price", 100);
    } else if (priceFilter === "100-500") {
      query = query.gte("price", 100).lte("price", 500);
    } else if (priceFilter === "500-1000") {
      query = query.gte("price", 500).lte("price", 1000);
    } else if (priceFilter === "1000-plus") {
      query = query.gte("price", 1000);
    }

    if (sortOrder === "price-asc") {
      query = query.order("price", { ascending: true });
    } else if (sortOrder === "price-desc") {
      query = query.order("price", { ascending: false });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    const { data: cardsData, error: cardsError } = await query;

    if (cardsError) {
      console.error("Error fetching listings:", cardsError);
      toast.error("Failed to load listings.");
    } else if (cardsData) {
      setCards(cardsData);
    }
  };

  const fetchClaims = async () => {
    const { data, error } = await supabase
      .from("claims")
      .select("*")
      .order("claimed_at", { ascending: false });
    if (error) {
      console.error("Error fetching claims:", error);
    } else if (data) {
      setClaims(data);
    }
  };

  useEffect(() => {
    fetchCards();
    fetchClaims();

    const cardsChannel = supabase
      .channel("admin-cards-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "cards" }, () => {
        fetchCards();
      })
      .subscribe();

    const claimsChannel = supabase
      .channel("admin-claims-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "claims" }, () => {
        fetchClaims();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(cardsChannel);
      supabase.removeChannel(claimsChannel);
    };
  }, [priceFilter, sortOrder]);

  // Belt-and-suspenders alongside the same sweep on the storefront: releases
  // claims left stale after a buyer closes their tab without checking out,
  // so it isn't solely dependent on someone else claiming something.
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

  const distinct = (key: keyof DbCard) =>
    Array.from(new Set(cards.map((c) => c[key]).filter(Boolean))) as string[];
  const knownCardSets = useMemo(() => distinct("card_set"), [cards]);
  const knownCategories = useMemo(() => distinct("category"), [cards]);
  const knownLanguages = useMemo(() => {
    const seen = new Set(distinct("language"));
    // Always offer these regardless of what's already been listed, since
    // they're this shop's common non-English stock (Japanese/Chinese bulk
    // lots seen in Live Listings) even before any card of that language has
    // been added through this form yet.
    ["English", "Japanese", "Chinese", "Korean"].forEach((l) => seen.add(l));
    return Array.from(seen);
  }, [cards]);

  const onPickPhoto = (file: File | null) => {
    setPhotoFile(file);
    setExistingPhotoUrl(null);
    if (file) {
      const url = URL.createObjectURL(file);
      setPhotoPreview(url);
    } else {
      setPhotoPreview(null);
    }
  };

  const onPickPhotoUrl = (url: string) => {
    setPhotoFile(null);
    setExistingPhotoUrl(url);
    setPhotoPreview(url);
  };

  const onPickVideo = async (file: File | null) => {
    if (!file) {
      setVideoFile(null);
      setExistingVideoUrl(null);
      setVideoPreview(null);
      return;
    }

    setExistingVideoUrl(null);
    setIsProcessingVideo(true);
    const { file: prepared, error } = await prepareVideoForUpload(file);
    setIsProcessingVideo(false);

    if (error) {
      toast.error(error);
      if (videoFileRef.current) videoFileRef.current.value = "";
      return;
    }

    setVideoFile(prepared);
    setVideoPreview(URL.createObjectURL(prepared!));
  };

  const runSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    const r = await searchPokemonCards(search);
    setResults(r);
    setSearching(false);
  };

  const pickTcg = (c: TCGCard) => {
    setSelectedTcg(c);
    setName(c.name);
    setCardSet(c.set?.name ?? "");
    setCardNumber(c.number ?? "");
    setRarity(c.rarity ?? "");
    setLanguage("English"); // pokemontcg.io only indexes English prints
    setTcgImageUrl(c.images?.large || c.images?.small || null);
    if (!photoFile && !existingPhotoUrl && (c.images?.large || c.images?.small)) {
      onPickPhotoUrl(c.images.large || c.images.small!);
    }
    setResults([]);

    let usdPrice: number | undefined;
    if (c.tcgplayer?.prices?.averageSellPrice) {
      usdPrice = c.tcgplayer.prices.averageSellPrice;
    } else if (c.cardmarket?.prices?.averageSellPrice) {
      usdPrice = c.cardmarket.prices.averageSellPrice;
    }

    if (usdPrice) {
      const inrPrice = usdPrice * USD_TO_INR_RATE;
      setPrice(inrPrice.toFixed(0));
      toast.success(`Price auto-filled: ${CURRENCY}${inrPrice.toFixed(0)}`);
    } else {
      toast.info("No price found for this card from the TCG API.");
    }
  };

  const handleScanned = async (scanned: ScannedCard) => {
    setSearching(true);
    const results = await searchPokemonCards(scanned.name);
    setSearching(false);

    const isEnglish = !scanned.language || scanned.language.toLowerCase() === "english";
    // pokemontcg.io only carries English prints. For any other language the
    // API's "best" match is a different physical release entirely (different
    // set, card number, artwork, and price) -- not just a wrong price, so we
    // don't apply that match at all and instead keep what the photo itself
    // told us (name translated for readability, but set/number as printed
    // on THIS card).
    const match = isEnglish ? pickBestTcgMatch(results, scanned.set, scanned.number) : null;

    if (match) {
      pickTcg(match);
    } else {
      setName(scanned.name);
      setCardSet(scanned.set ?? "");
      setCardNumber(scanned.number ?? "");
      setLanguage(scanned.language || "English");
      if (isEnglish) {
        toast.info("Identified the card, but couldn't find it in the TCG database — price and set need a manual check.");
      } else if (scanned.priceSuggestionInr && scanned.priceSuggestionSource === "gemini_search") {
        // Only the cited web-search estimate gets pre-filled -- the
        // Japanese-proxy fallback has been observed matching the wrong
        // print/rarity (no way to confirm it found the same parallel), so
        // that one is shown in the scanner as a reference only, never
        // written into the form. Still always paired with a toast making
        // clear this needs verifying either way.
        setPrice(scanned.priceSuggestionInr.toFixed(0));
        toast.warning(`${scanned.priceSuggestionLabel}: ${CURRENCY}${scanned.priceSuggestionInr.toFixed(0)} — verify before publishing, set/card # also need a manual check.`);
      } else {
        toast.warning(`${scanned.language} print — the TCG database only has English-print data, so set/card #/price weren't auto-matched. Enter them manually.`);
      }
    }

    // Applied last (and unconditionally) so the real photo of the physical
    // card always wins over any stock image pickTcg/setDefault might have
    // just set -- setPhotoFile above is stale within this same tick, so
    // ordering here (not a guard inside pickTcg) is what makes this correct.
    const photoFile = new File([scanned.photoBlob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" });
    onPickPhoto(photoFile);
  };

  // Only the per-listing fields reset after publishing -- Condition usually
  // stays the same across a whole shipment, so keeping it prefilled saves
  // re-typing for every listing.
  const resetForm = () => {
    setName("");
    setCardSet("");
    setCardNumber("");
    setRarity("");
    setCategory("");
    setIsPreorder(false);
    setIsVintage(false);
    setPrice("");
    setSalePrice("");
    setQuantity("1");
    setPhotoFile(null);
    setPhotoPreview(null);
    setExistingPhotoUrl(null);
    setPhotoUrlInput("");
    setExtraPhotoUrls([]);
    setVideoFile(null);
    setVideoPreview(null);
    setExistingVideoUrl(null);
    setSearch("");
    setResults([]);
    setSelectedTcg(null);
    setTcgImageUrl(null);
    if (photoFileRef.current) photoFileRef.current.value = "";
    if (videoFileRef.current) videoFileRef.current.value = "";
  };

  const duplicateListing = (c: DbCard) => {
    setItemType(c.item_type);
    setCardSet(c.card_set ?? "");
    setCardNumber(c.card_number ?? "");
    setRarity(c.rarity ?? "");
    setCategory(c.category ?? "");
    setCondition(c.condition ?? CARD_CONDITIONS[0]);
    setLanguage(c.language || "English");
    setName(c.name);
    setIsPreorder(c.is_preorder);
    setIsVintage(c.is_vintage);
    setPrice(String(c.price));
    setSalePrice(c.sale_price !== null ? String(c.sale_price) : "");
    setQuantity(String(c.quantity_total));
    setPhotoFile(null);
    setPhotoPreview(c.photo_url);
    setExistingPhotoUrl(c.photo_url);
    setExtraPhotoUrls(c.photo_urls ?? []);
    setVideoFile(null);
    setVideoPreview(c.video_url);
    setExistingVideoUrl(c.video_url);
    setSearch("");
    setResults([]);
    setSelectedTcg(null);
    setTcgImageUrl(null);
    if (photoFileRef.current) photoFileRef.current.value = "";
    if (videoFileRef.current) videoFileRef.current.value = "";
    addCardFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast.info("Copied into the form below — adjust and publish.");
  };

  const publish = async () => {
    if (!name.trim() || !price) {
      toast.error("Add a name and price");
      return;
    }

    const parsedPrice = Number(price);
    const parsedSalePrice = salePrice ? Number(salePrice) : null;
    const parsedQuantity = Math.max(1, Math.floor(Number(quantity) || 1));

    if (parsedSalePrice !== null && parsedSalePrice > parsedPrice) {
      toast.error("Sale price cannot be greater than the original price.");
      return;
    }

    setPublishing(true);
    let photo_url: string | null = existingPhotoUrl;
    let video_url: string | null = existingVideoUrl;

    if (photoFile) {
      const path = `card-images/${Date.now()}-${Math.random().toString(36).slice(2)}.${photoFile.name.split(".").pop() || "jpg"}`;
      const { error: upErr } = await supabase.storage.from("card-images").upload(path, photoFile, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) {
        toast.error("Photo upload failed");
        setPublishing(false);
        return;
      }
      const { data } = supabase.storage.from("card-images").getPublicUrl(path);
      photo_url = data.publicUrl;
    }

    if (videoFile) {
      const path = `card-videos/${Date.now()}-${Math.random().toString(36).slice(2)}.${videoFile.name.split(".").pop() || "mp4"}`;
      const { error: upErr } = await supabase.storage.from("card-videos").upload(path, videoFile, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) {
        toast.error(isPayloadTooLargeError(upErr) ? "Video is too large for upload (max 50MB). Try a shorter clip." : "Video upload failed");
        setPublishing(false);
        return;
      }
      const { data } = supabase.storage.from("card-videos").getPublicUrl(path);
      video_url = data.publicUrl;
    }

    const { error } = await supabase.from("cards").insert({
      name: name.trim(),
      item_type: itemType,
      card_set: cardSet.trim() || null,
      card_number: itemType === "card" ? cardNumber.trim() || null : null,
      rarity: itemType === "card" ? rarity.trim() || null : null,
      category: category.trim() || null,
      is_preorder: isPreorder,
      is_vintage: isVintage,
      language: language.trim() || "English",
      price: parsedPrice,
      sale_price: parsedSalePrice,
      condition,
      quantity_total: parsedQuantity,
      quantity_available: parsedQuantity,
      photo_url,
      photo_urls: extraPhotoUrls,
      video_url,
      tcg_image_url: tcgImageUrl,
    });
    setPublishing(false);
    if (error) {
      console.error(error);
      toast.error("Couldn't publish");
    } else {
      toast.success(`Published ${name}!`);
      resetForm();
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this listing? Any pending claims on it will be removed too.")) return;
    const { error } = await supabase.from("cards").delete().eq("id", id);
    if (error) toast.error("Delete failed");
    else toast("Deleted");
  };

  const handleReleaseClaim = async (claimId: string) => {
    if (!confirm("Release this claim and return the units to stock?")) return;
    const { error } = await supabase.rpc("admin_release_claim", { _claim_id: claimId });
    if (error) {
      console.error(error);
      toast.error("Failed to release claim.");
    } else {
      toast.success("Claim released, stock restored.");
    }
  };

  const handleMarkClaimSold = async (claim: DbClaim) => {
    const finalPrice = Number(claim.quantity) * Number(claim.unit_price);
    if (!confirm(`Mark ${claim.quantity} unit(s) as SOLD to ${claim.buyer_name} for ${CURRENCY}${finalPrice.toFixed(0)}?`)) return;
    const { error } = await supabase.rpc("mark_claim_as_sold", {
      _claim_id: claim.id,
      _buyer_name: claim.buyer_name,
      _final_price: finalPrice,
      _buyer_phone: claim.buyer_phone ?? null,
    });
    if (error) {
      console.error(error);
      toast.error("Failed to mark as sold");
    } else {
      toast.success(`Sold to ${claim.buyer_name}!`);
    }
  };

  const handleEditClick = (card: DbCard) => {
    setEditingCard(card);
    setIsEditDialogOpen(true);
  };

  const setDefaultConditions = async () => {
    if (!confirm(`Are you sure you want to set '${CARD_CONDITIONS[0]}' as the condition for ALL listings that currently have no condition set? This cannot be undone.`)) return;

    setIsUpdatingConditions(true);
    const { error } = await supabase
      .from("cards")
      .update({ condition: CARD_CONDITIONS[0] })
      .is("condition", null);

    if (error) {
      console.error("Error setting default conditions:", error);
      toast.error("Failed to set default conditions.");
    } else {
      toast.success("All listings without a condition are now set!");
      fetchCards();
    }
    setIsUpdatingConditions(false);
  };

  const claimsForCard = (cardId: string) => claims.filter((c) => c.card_id === cardId);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return <AdminLogin />;
  }

  return (
    <div className="min-h-screen pb-12">
      <header className="border-b border-border">
        <div className="container py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-xl gradient-gold flex items-center justify-center shadow-glow">
              <AppLogo className="w-full h-full" alt={`${SELLER_NAME} Logo`} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-black truncate">{SELLER_NAME} Console</h1>
              <p className="text-xs text-muted-foreground">Quick-list cards & sealed product for the live drop</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <a href="/leaderboard" className="text-muted-foreground hover:text-foreground underline">Leaderboard</a>
            <a href="/" className="text-muted-foreground underline">View sale →</a>
            <Button size="sm" variant="ghost" onClick={() => supabase.auth.signOut()}>
              <LogOut className="w-4 h-4 mr-1.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <Tabs defaultValue="listings">
          <TabsList className="mb-6">
            <TabsTrigger value="listings">Listings</TabsTrigger>
            <TabsTrigger value="sales">Sales History</TabsTrigger>
            <TabsTrigger value="setup">Sale Setup</TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="grid lg:grid-cols-2 gap-6 [&>*]:min-w-0">
        {/* Sale Time Manager */}
        <Card className="gradient-card-bg border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" /> Manage Sale Start Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SaleTimeManager />
          </CardContent>
        </Card>

        {/* Utility Card for default condition */}
        <Card className="gradient-card-bg border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-primary" /> Utilities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Set Default Condition</Label>
              <p className="text-sm text-muted-foreground">
                Click this button to set the condition of all listings that currently have no condition specified.
              </p>
              <Button
                onClick={setDefaultConditions}
                disabled={isUpdatingConditions}
                variant="secondary"
                className="w-full sm:w-auto"
              >
                {isUpdatingConditions ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Set All Unspecified Conditions to "{CARD_CONDITIONS[0]}"
              </Button>
            </div>
          </CardContent>
        </Card>

        <PrizeEditor />

        <SaleManager />

        <SiteWideSaleManager />
          </TabsContent>

          <TabsContent value="listings" className="grid lg:grid-cols-2 gap-6 [&>*]:min-w-0">
        {/* Quick list form */}
        <Card className="gradient-card-bg border-border" ref={addCardFormRef}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" /> Add a Listing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Item Type */}
            <div className="space-y-2">
              <Label>Listing Type</Label>
              <Select value={itemType} onValueChange={setItemType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ITEM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* TCG database search -- single cards only */}
            {itemType === "card" && (
              <div className="space-y-2">
                <Label>Search Pokémon TCG Database</Label>
                <div className="flex gap-2">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Charizard, or base1 4"
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), runSearch())}
                  />
                  <Button type="button" variant="secondary" onClick={runSearch} disabled={searching}>
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
                <Button type="button" variant="outline" onClick={() => setScannerOpen(true)} className="w-full">
                  <Camera className="w-4 h-4 mr-2" /> Scan Card with Camera
                </Button>
                {results.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-64 overflow-y-auto p-1 border border-border rounded-lg">
                    {results.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => pickTcg(c)}
                        className="text-left rounded-lg overflow-hidden border border-border hover:border-primary transition-colors"
                      >
                        {c.images?.small && <img src={c.images.small} alt={c.name} className="w-full aspect-[2/3] object-cover" />}
                        <p className="text-[10px] px-1 py-0.5 truncate">{c.name}</p>
                      </button>
                    ))}
                  </div>
                )}
                {selectedTcg && (
                  <p className="text-xs text-muted-foreground">
                    Selected: {selectedTcg.name} · {selectedTcg.set?.name} · {selectedTcg.rarity}
                  </p>
                )}
              </div>
            )}

            {/* Photo Upload */}
            <div className="space-y-2">
              <Label>Photo</Label>
              {photoPreview ? (
                <div className="relative aspect-[3/4] max-w-[200px] rounded-xl overflow-hidden border border-border">
                  <img src={photoPreview} alt="preview" className="w-full h-full object-cover" />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-2 right-2 h-7 w-7"
                    onClick={() => onPickPhoto(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => photoFileRef.current?.click()}
                      className="flex-1 min-w-[140px]"
                    >
                      <Camera className="w-4 h-4 mr-2" /> Take Photo / Choose Photo
                    </Button>
                    <input
                      ref={photoFileRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => onPickPhoto(e.target.files?.[0] || null)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={photoUrlInput}
                      onChange={(e) => setPhotoUrlInput(e.target.value)}
                      placeholder="…or paste an image URL"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && photoUrlInput.trim()) {
                          e.preventDefault();
                          onPickPhotoUrl(photoUrlInput.trim());
                          setPhotoUrlInput("");
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        if (!photoUrlInput.trim()) return;
                        onPickPhotoUrl(photoUrlInput.trim());
                        setPhotoUrlInput("");
                      }}
                    >
                      Use URL
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <AdditionalPhotosField urls={extraPhotoUrls} onChange={setExtraPhotoUrls} />

            {/* Video Upload */}
            <div className="space-y-2">
              <Label>Video (Optional)</Label>
              {videoPreview ? (
                <div className="relative aspect-[3/4] max-w-[200px] rounded-xl overflow-hidden border border-border bg-black flex items-center justify-center">
                  <video src={videoPreview} controls className="w-full h-full object-contain" />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-2 right-2 h-7 w-7"
                    onClick={() => onPickVideo(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => videoFileRef.current?.click()}
                    disabled={isProcessingVideo}
                    className="flex-1 min-w-[140px]"
                  >
                    {isProcessingVideo ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Compressing video…</>
                    ) : (
                      <><Video className="w-4 h-4 mr-2" /> Record Video / Choose Video</>
                    )}
                  </Button>
                  <input
                    ref={videoFileRef}
                    type="file"
                    accept="video/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => onPickVideo(e.target.files?.[0] || null)}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="col-span-1 sm:col-span-2">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={itemType === "card" ? "Charizard ex" : itemType === "sealed_product" ? "Obsidian Flames Booster Box" : "Sleeves, Playmat, Binder..."}
                />
              </div>
              <div>
                <Label>Set</Label>
                <ComboSelect value={cardSet} onChange={setCardSet} options={knownCardSets} placeholder="Obsidian Flames, Base Set..." />
              </div>
              {itemType === "card" && (
                <>
                  <div>
                    <Label>Card #</Label>
                    <Input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="4/102" />
                  </div>
                  <div>
                    <Label>Rarity</Label>
                    <Input value={rarity} onChange={(e) => setRarity(e.target.value)} placeholder="Rare Holo" />
                  </div>
                </>
              )}
              <div>
                <Label>Category</Label>
                <ComboSelect value={category} onChange={setCategory} options={knownCategories} placeholder="Booster Box, ETB, Tin..." />
              </div>
              <div>
                <Label>Language</Label>
                <ComboSelect value={language} onChange={setLanguage} options={knownLanguages} placeholder="English" />
              </div>
              <div>
                <Label>Price ({CURRENCY})</Label>
                <Input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="500" />
              </div>
              <div>
                <Label>Sale Price ({CURRENCY})</Label>
                <Input type="number" inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <Label>Quantity in Stock</Label>
                <Input type="number" inputMode="numeric" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="1" />
              </div>
              <div>
                <Label htmlFor="condition">Condition</Label>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger id="condition">
                    <SelectValue placeholder="Select condition" />
                  </SelectTrigger>
                  <SelectContent>
                    {CARD_CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1 sm:col-span-2 flex items-center justify-between rounded-lg border border-border p-3 bg-background/40">
                <div className="min-w-0 pr-3">
                  <Label className="text-sm">Pre-Order</Label>
                  <p className="text-xs text-muted-foreground">
                    Ships in {PREORDER_MIN_DAYS}-{PREORDER_MAX_DAYS} days from today instead of being in-hand.
                  </p>
                </div>
                <Switch checked={isPreorder} onCheckedChange={setIsPreorder} />
              </div>
              <div className="col-span-1 sm:col-span-2 flex items-center justify-between rounded-lg border border-border p-3 bg-background/40">
                <div className="min-w-0 pr-3">
                  <Label className="text-sm">Vintage</Label>
                  <p className="text-xs text-muted-foreground">
                    Flag this as an older/especially collectible print.
                  </p>
                </div>
                <Switch checked={isVintage} onCheckedChange={setIsVintage} />
              </div>
            </div>

            <Button
              onClick={publish}
              disabled={publishing || isProcessingVideo}
              className="w-full h-12 gradient-gold text-primary-foreground font-bold text-base"
            >
              {publishing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              Publish to Live Sale
            </Button>
          </CardContent>
        </Card>

        {/* Live Listings */}
        <Card className="gradient-card-bg border-border">
          <CardHeader>
            <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span>Live Listings ({cards.length})</span>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Price Filter */}
                <div className="flex items-center gap-1">
                  <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
                  <Select value={priceFilter} onValueChange={(value: PriceFilter) => setPriceFilter(value)}>
                    <SelectTrigger className="w-[140px] sm:w-[160px]">
                      <SelectValue placeholder="Filter by Price" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Prices</SelectItem>
                      <SelectItem value="under-100">Under {CURRENCY}100</SelectItem>
                      <SelectItem value="100-500">{CURRENCY}100 - {CURRENCY}500</SelectItem>
                      <SelectItem value="500-1000">{CURRENCY}500 - {CURRENCY}1000</SelectItem>
                      <SelectItem value="1000-plus">{CURRENCY}1000+</SelectItem>
                    </SelectContent>
                  </Select>
                </div >
                {/* Sort Order */}
                <div className="flex items-center gap-1">
                  {sortOrder === "price-asc" ? (
                    <ArrowUpWideNarrow className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : sortOrder === "price-desc" ? (
                    <ArrowDownWideNarrow className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : null}
                  <Select value={sortOrder} onValueChange={(value: SortOrder) => setSortOrder(value)}>
                    <SelectTrigger className="w-[140px] sm:w-[160px]">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest First</SelectItem>
                      <SelectItem value="price-asc">Price: Low to High</SelectItem>
                      <SelectItem value="price-desc">Price: High to Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[70vh] overflow-y-auto">
              {cards.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No listings yet.</p>
              )}
              {cards.map((c) => {
                const cardClaims = claimsForCard(c.id);
                return (
                  <div key={c.id} className="rounded-lg border border-border bg-background/40 overflow-hidden">
                    <div className="flex items-center gap-3 p-2">
                      {(c.photo_url || c.video_url) && (
                        <div className="w-12 h-16 flex-shrink-0 rounded overflow-hidden bg-muted flex items-center justify-center">
                          {c.video_url ? (
                            <video src={c.video_url} className="w-full h-full object-cover" muted playsInline />
                          ) : (
                            <img src={c.photo_url!} alt={c.name} className="w-full h-full object-cover" />
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">
                          {c.name}
                          {c.item_type !== "card" && (
                            <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full align-middle bg-secondary text-secondary-foreground">
                              {ITEM_TYPES.find((t) => t.value === c.item_type)?.label ?? c.item_type}
                            </span>
                          )}
                          {c.is_preorder && (
                            <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full align-middle bg-secondary text-secondary-foreground">
                              Pre-Order
                            </span>
                          )}
                          {c.is_vintage && (
                            <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full align-middle bg-amber-900 text-amber-100">
                              Vintage
                            </span>
                          )}
                          {c.language && c.language !== "English" && (
                            <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full align-middle bg-secondary text-secondary-foreground">
                              {c.language}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {c.card_set || "—"} • {CURRENCY}{Number(c.price).toFixed(0)} • {c.condition || "N/A"}
                          {c.category ? ` • ${c.category}` : ""}
                        </p>
                        {(c.card_number || c.rarity) && (
                          <p className="text-xs text-muted-foreground">
                            {c.card_number ? `#${c.card_number}` : "—"} {c.rarity ? `• ${c.rarity}` : ""}
                          </p>
                        )}
                        <p className="text-xs font-semibold mt-0.5">
                          <PackageCheck className="inline-block w-3 h-3 mr-1 text-primary" />
                          {c.quantity_available} / {c.quantity_total} in stock
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => duplicateListing(c)} title="Duplicate as a new listing">
                          <Copy className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleEditClick(c)} title="Edit">
                          <Edit className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(c.id)} title="Delete">
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {cardClaims.length > 0 && (
                      <div className="border-t border-border bg-muted/20 p-2 space-y-1">
                        {cardClaims.map((claim) => (
                          <div key={claim.id} className="flex items-center justify-between gap-2 text-xs px-1">
                            <div className="min-w-0">
                              <span className="font-semibold">{claim.buyer_name}</span>{" "}
                              <span className="text-muted-foreground">
                                claimed {claim.quantity} unit{claim.quantity === 1 ? "" : "s"} — {CURRENCY}
                                {(Number(claim.quantity) * Number(claim.unit_price)).toFixed(0)}
                              </span>
                              {claim.status === "checked_out" ? (
                                <span className="ml-1 text-success font-semibold">✓ Sold</span>
                              ) : (
                                <span className="ml-1 text-primary font-semibold">Pending checkout</span>
                              )}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleReleaseClaim(claim.id)} title="Release back to stock">
                                <Lock className="w-3.5 h-3.5 text-primary" />
                              </Button>
                              {claim.status === "claimed" && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleMarkClaimSold(claim)} title="Mark as sold">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="sales">
            <SalesHistory />
          </TabsContent>
        </Tabs>
      </main>

      {editingCard && (
        <EditCardDialog
          card={editingCard}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onSave={fetchCards}
        />
      )}

      <CardScanner open={scannerOpen} onOpenChange={setScannerOpen} onIdentified={handleScanned} />
    </div>
  );
};

export default Admin;

function PrizeEditor() {
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("prize_rank_1_text, prize_rank_1_image_url, monthly_leaderboard_enabled")
        .eq("id", 1)
        .maybeSingle();
      if (data) {
        setText(data.prize_rank_1_text ?? "");
        setImageUrl(data.prize_rank_1_image_url ?? null);
        setEnabled((data as any).monthly_leaderboard_enabled ?? true);
      }
    })();
  }, []);

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    const path = `prize-${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split(".").pop() || "jpg"}`;
    const { error: upErr } = await supabase.storage.from("prize-images").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (upErr) {
      toast.error("Image upload failed");
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("prize-images").getPublicUrl(path);
    setImageUrl(data.publicUrl);
    setUploading(false);
    toast.success("Image uploaded");
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ id: 1, prize_rank_1_text: text, prize_rank_1_image_url: imageUrl }, { onConflict: "id" });
    setSaving(false);
    if (error) {
      console.error(error);
      toast.error("Failed to save prize");
    } else {
      toast.success("Prize updated!");
    }
  };

  const toggleEnabled = async (next: boolean) => {
    setTogglingEnabled(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ id: 1, monthly_leaderboard_enabled: next } as any, { onConflict: "id" });
    setTogglingEnabled(false);
    if (error) {
      toast.error("Failed to update visibility");
    } else {
      setEnabled(next);
      toast.success(next ? "Monthly leaderboard is now visible" : "Monthly leaderboard hidden");
    }
  };

  return (
    <Card className="gradient-card-bg border-border lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" /> Monthly Leaderboard Prize
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-background/40">
          <div className="min-w-0">
            <Label className="text-sm">Show monthly leaderboard publicly</Label>
            <p className="text-xs text-muted-foreground">
              When off, the monthly tab and prize are hidden on /leaderboard. Per-sale leaderboards stay visible.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={toggleEnabled} disabled={togglingEnabled} />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Prize Description</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Surprise booster box + a graded chase pull for the top spending trainer of the month!"
              rows={5}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">Shown publicly on /leaderboard.</p>
          </div>
          <div className="space-y-2">
            <Label>Prize Image</Label>
            {imageUrl ? (
              <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-border">
                <img src={imageUrl} alt="Prize" className="w-full h-full object-cover" />
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute top-2 right-2 h-7 w-7"
                  onClick={() => setImageUrl(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Gift className="w-4 h-4 mr-2" />}
                Upload prize image
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleUpload(e.target.files?.[0] || null)}
            />
          </div>
        </div>
        <Button onClick={save} disabled={saving} className="gradient-gold text-primary-foreground font-bold">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Save Prize
        </Button>
      </CardContent>
    </Card>
  );
}
