import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { searchPokemonCards, TCGCard } from "@/lib/pokemontcg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Camera, Upload, Search, Trash2, Plus, X, Loader2, Lock, Clock, Edit, Video, Wrench, Filter, ArrowDownWideNarrow, ArrowUpWideNarrow, CheckCircle2, Gift, Trophy } from "lucide-react";
import { CURRENCY, USD_TO_INR_RATE, SELLER_NAME } from "@/config";
import { SaleTimeManager } from "@/components/SaleTimeManager";
import AppLogo from "@/components/AppLogo";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EditCardDialog } from "@/components/EditCardDialog";
import { Textarea } from "@/components/ui/textarea";
import { SaleManager } from "@/components/SaleManager";

type DbCard = Database["public"]["Tables"]["cards"]["Row"];
type PriceFilter = "all" | "under-100" | "100-500" | "500-1000" | "1000-plus";
type SortOrder = "newest" | "price-asc" | "price-desc"; // New type for sort order

const Admin = () => {
  const [cards, setCards] = useState<DbCard[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [condition, setCondition] = useState<string>("Near Mint");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TCGCard[]>([]);
  const [selectedTcg, setSelectedTcg] = useState<TCGCard | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [isUpdatingConditions, setIsUpdatingConditions] = useState(false);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<DbCard | null>(null);
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest"); // New state for sort order

  const fetchCards = async () => {
    let query = supabase.from("cards").select("*");

    // Apply price filter
    if (priceFilter === "under-100") {
      query = query.lt("price", 100);
    } else if (priceFilter === "100-500") {
      query = query.gte("price", 100).lte("price", 500);
    } else if (priceFilter === "500-1000") {
      query = query.gte("price", 500).lte("price", 1000);
    } else if (priceFilter === "1000-plus") {
      query = query.gte("price", 1000);
    }

    // Apply sort order
    if (sortOrder === "price-asc") {
      query = query.order("price", { ascending: true });
    } else if (sortOrder === "price-desc") {
      query = query.order("price", { ascending: false });
    } else {
      // Default to newest
      query = query.order("created_at", { ascending: false });
    }

    const { data: cardsData, error: cardsError } = await query;

    if (cardsError) {
      console.error("Error fetching cards:", cardsError);
      toast.error("Failed to load cards.");
    } else if (cardsData) {
      setCards(cardsData);
    }
  };

  useEffect(() => {
    fetchCards();

    const channel = supabase
      .channel("admin-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "cards" }, () => {
        fetchCards(); // Re-fetch cards on any change
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [priceFilter, sortOrder]); // Re-fetch when priceFilter or sortOrder changes

  const onPickPhoto = (file: File | null) => {
    setPhotoFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setPhotoPreview(url);
    } else {
      setPhotoPreview(null);
    }
  };

  const onPickVideo = (file: File | null) => {
    setVideoFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoPreview(url);
    } else {
      setVideoPreview(null);
    }
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
      toast.info("No price found for this card from TCG API.");
    }
  };

  const resetForm = () => {
    setName("");
    setPrice("");
    setSalePrice("");
    setCondition("Near Mint");
    setPhotoFile(null);
    setPhotoPreview(null);
    setVideoFile(null);
    setVideoPreview(null);
    setSearch("");
    setResults([]);
    setSelectedTcg(null);
    if (photoFileRef.current) photoFileRef.current.value = "";
    if (videoFileRef.current) videoFileRef.current.value = "";
  };

  const publish = async () => {
    if (!name.trim() || !price) {
      toast.error("Add a name and price");
      return;
    }

    const parsedPrice = Number(price);
    const parsedSalePrice = salePrice ? Number(salePrice) : null;

    if (parsedSalePrice !== null && parsedSalePrice > parsedPrice) {
      toast.error("Sale price cannot be greater than the original price.");
      return;
    }

    setPublishing(true);
    let photo_url: string | null = null;
    let video_url: string | null = null;

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
        toast.error("Video upload failed");
        setPublishing(false);
        return;
      }
      const { data } = supabase.storage.from("card-videos").getPublicUrl(path);
      video_url = data.publicUrl;
    }

    const { error } = await supabase.from("cards").insert({
      name: name.trim(),
      price: parsedPrice,
      sale_price: parsedSalePrice,
      condition: condition,
      photo_url,
      video_url,
      tcg_image_url: selectedTcg?.images?.large || selectedTcg?.images?.small || null,
      card_set: selectedTcg?.set?.name || null,
      card_number: selectedTcg?.number || null,
      rarity: selectedTcg?.rarity || null,
    });
    setPublishing(false);
    if (error) {
      toast.error("Couldn't publish");
    } else {
      toast.success(`Published ${name}!`);
      resetForm();
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this card?")) return;
    const { error } = await supabase.from("cards").delete().eq("id", id);
    if (error) toast.error("Delete failed");
    else toast("Deleted");
  };

  const handleAdminUnclaim = async (cardId: string) => {
    if (!confirm("Are you sure you want to unclaim this card and make it available again?")) return;
    const { error } = await supabase
      .from("cards")
      .update({
        status: "available",
        claimed_by: null,
        buyer_session_id: null,
        claimed_at: null,
      })
      .eq("id", cardId);

    if (error) {
      toast.error("Failed to unclaim card.");
      console.error("Error unclaiming card:", error);
    } else {
      toast.success("Card successfully unclaimed and made available.");
    }
  };

  const handleMarkAsSold = async (card: DbCard) => {
    const buyerName = card.claimed_by?.trim();
    if (!buyerName) {
      toast.error("This card has no claimed trainer. Unclaim and re-claim it first, or edit it.");
      return;
    }
    const finalPrice =
      card.sale_price !== null && Number(card.sale_price) < Number(card.price)
        ? Number(card.sale_price)
        : Number(card.price);

    if (!confirm(`Mark "${card.name}" as SOLD to ${buyerName} for ${CURRENCY}${finalPrice.toFixed(0)}?\n\nThis records the transaction and awards XP on the leaderboard.`)) return;

    const { error } = await supabase.rpc("mark_card_as_sold", {
      _card_id: card.id,
      _buyer_name: buyerName,
      _final_price: finalPrice,
      _buyer_phone: card.buyer_phone ?? null,
    });
    if (error) {
      console.error(error);
      toast.error("Failed to mark as sold");
    } else {
      toast.success(`Sold ${card.name} to ${buyerName}!`);
    }
  };

  const handleEditClick = (card: DbCard) => {
    setEditingCard(card);
    setIsEditDialogOpen(true);
  };

  const setDefaultConditions = async () => {
    if (!confirm("Are you sure you want to set 'Near Mint' as the condition for ALL cards that currently have no condition set? This cannot be undone.")) return;

    setIsUpdatingConditions(true);
    const { error } = await supabase
      .from("cards")
      .update({ condition: "Near Mint" })
      .is("condition", null);

    if (error) {
      console.error("Error setting default conditions:", error);
      toast.error("Failed to set default conditions.");
    } else {
      toast.success("All cards without a condition are now 'Near Mint'!");
      fetchCards();
    }
    setIsUpdatingConditions(false);
  };

  return (
    <div className="min-h-screen pb-12">
      <header className="border-b border-border">
        <div className="container py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center shadow-glow">
              <AppLogo className="w-full h-full" alt="Yanks TCG Logo" />
            </div>
            <div>
              <h1 className="text-xl font-black">{SELLER_NAME} Console</h1>
              <p className="text-xs text-muted-foreground">Quick-list cards for the live drop</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <a href="/leaderboard" className="text-muted-foreground hover:text-foreground underline">Leaderboard</a>
            <a href="/" className="text-muted-foreground underline">View sale →</a>
          </div>
        </div>
      </header>

      <main className="container py-6 grid lg:grid-cols-2 gap-6">
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
              <Label>Set Default Card Conditions</Label>
              <p className="text-sm text-muted-foreground">
                Click this button to set the condition of all cards that currently have no condition specified to "Near Mint".
              </p>
              <Button
                onClick={setDefaultConditions}
                disabled={isUpdatingConditions}
                variant="secondary"
                className="w-full sm:w-auto"
              >
                {isUpdatingConditions ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Set All Unspecified Conditions to "Near Mint"
              </Button>
            </div>
          </CardContent>
        </Card>

        <PrizeEditor />

        <SaleManager />

        {/* Quick list form */}
        <Card className="gradient-card-bg border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" /> Add a Card
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Photo Upload */}
            <div className="space-y-2">
              <Label>Card Photo</Label>
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
              )}
            </div>

            {/* Video Upload */}
            <div className="space-y-2">
              <Label>Card Video (Optional)</Label>
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
                    className="flex-1 min-w-[140px]"
                  >
                    <Video className="w-4 h-4 mr-2" /> Record Video / Choose Video
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

            {/* TCG search */}
            <div className="space-y-2">
              <Label>Auto-fill from Pokémon TCG</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. Charizard, base1 4 (for Base Set Charizard)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                />
                <Button type="button" variant="secondary" onClick={runSearch} disabled={searching}>
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
              {results.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto p-2 rounded-lg border border-border bg-muted/20">
                  {results.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => pickTcg(c)}
                      className="text-left rounded-md overflow-hidden border border-border hover:border-primary transition"
                    >
                      {c.images?.small && <img src={c.images.small} alt={c.name} className="w-full aspect-[3/4] object-cover" />}
                      <div className="p-1">
                        <p className="text-xs font-semibold truncate">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{c.set?.name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {selectedTcg && (
                <div className="flex items-center gap-2 text-xs p-2 rounded bg-primary/10 border border-primary/30">
                  <AppLogo className="w-3.5 h-3.5" alt="Yanks TCG Logo" />
                  <span>{selectedTcg.set?.name} • {selectedTcg.rarity || "—"} • #{selectedTcg.number}</span>
                  <button onClick={() => setSelectedTcg(null)} className="ml-auto text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Card Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Charizard VMAX" />
              </div>
              <div className="col-span-2">
                <Label>Price ({CURRENCY})</Label>
                <Input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="500" />
              </div>
              <div className="col-span-2">
                <Label>Sale Price ({CURRENCY})</Label>
                <Input type="number" inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="Optional sale price" />
              </div>
              <div className="col-span-2">
                <Label htmlFor="condition">Condition</Label>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger id="condition">
                    <SelectValue placeholder="Select condition" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Near Mint">Near Mint</SelectItem>
                    <SelectItem value="Lightly Played">Lightly Played</SelectItem>
                    <SelectItem value="Moderately Played">Moderately Played</SelectItem>
                    <SelectItem value="Heavily Played">Heavily Played</SelectItem>
                    <SelectItem value="Damaged">Damaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={publish}
              disabled={publishing}
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
            <CardTitle className="flex items-center justify-between">
              <span>Live Listings ({cards.length})</span>
              <div className="flex items-center gap-2">
                {/* Price Filter */}
                <div className="flex items-center gap-1">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <Select value={priceFilter} onValueChange={(value: PriceFilter) => setPriceFilter(value)}>
                    <SelectTrigger className="w-[160px]">
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
                    <ArrowUpWideNarrow className="w-4 h-4 text-muted-foreground" />
                  ) : sortOrder === "price-desc" ? (
                    <ArrowDownWideNarrow className="w-4 h-4 text-muted-foreground" />
                  ) : null}
                  <Select value={sortOrder} onValueChange={(value: SortOrder) => setSortOrder(value)}>
                    <SelectTrigger className="w-[160px]">
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
                <p className="text-sm text-muted-foreground text-center py-8">No cards listed yet.</p>
              )}
              {cards.map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg border border-border bg-background/40">
                  {(c.tcg_image_url || c.photo_url || c.video_url) && (
                    <div className="w-12 h-16 flex-shrink-0 rounded overflow-hidden bg-muted flex items-center justify-center">
                      {c.video_url ? (
                        <video src={c.video_url} className="w-full h-full object-cover" muted playsInline />
                      ) : (
                        <img src={c.tcg_image_url || c.photo_url!} alt={c.name} className="w-full h-full object-cover" />
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.card_set || "—"} • {CURRENCY}{Number(c.price).toFixed(0)} • {c.condition || "N/A"}
                    </p>
                    {c.status === "claimed" ? (
                      <p className="text-xs text-success font-semibold mt-0.5">✓ Claimed by {c.claimed_by}</p>
                    ) : c.status === "checked_out" ? (
                      <p className="text-xs text-primary font-semibold mt-0.5">💰 Sold to {c.claimed_by}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5">Available</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => handleEditClick(c)}>
                      <Edit className="w-4 h-4 text-muted-foreground" />
                    </Button>
                    {(c.status === "claimed" || c.status === "checked_out") && (
                      <Button size="icon" variant="ghost" onClick={() => handleAdminUnclaim(c.id)}>
                        <Lock className="w-4 h-4 text-primary" />
                      </Button>
                    )}
                    {c.status === "claimed" && (
                      <Button size="icon" variant="ghost" onClick={() => handleMarkAsSold(c)} title="Mark as sold">
                        <CheckCircle2 className="w-4 h-4 text-success" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => remove(c.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>

      {editingCard && (
        <EditCardDialog
          card={editingCard}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onSave={fetchCards}
        />
      )}
    </div>
  );
};

export default Admin;

function PrizeEditor() {
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("prize_rank_1_text, prize_rank_1_image_url")
        .eq("id", 1)
        .maybeSingle();
      if (data) {
        setText(data.prize_rank_1_text ?? "");
        setImageUrl(data.prize_rank_1_image_url ?? null);
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

  return (
    <Card className="gradient-card-bg border-border lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" /> Monthly Leaderboard Prize
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Prize Description</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Surprise booster box + exclusive promo card for the top spending trainer of the month!"
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