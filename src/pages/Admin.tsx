import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { searchPokemonCards, TCGCard } from "@/lib/pokemontcg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Camera, Upload, Search, Trash2, Plus, X, Loader2, Lock, Clock, Edit, Video } from "lucide-react";
import { CURRENCY, USD_TO_INR_RATE, SELLER_NAME } from "@/config"; // Import SELLER_NAME
import { SaleTimeManager } from "@/components/SaleTimeManager";
import AppLogo from "@/components/AppLogo"; // Import AppLogo
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Import Select components
import { EditCardDialog } from "@/components/EditCardDialog"; // Import EditCardDialog

type DbCard = Database["public"]["Tables"]["cards"]["Row"];

const Admin = () => {
  const [cards, setCards] = useState<DbCard[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [condition, setCondition] = useState<string>("Near Mint");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null); // New state for video file
  const [videoPreview, setVideoPreview] = useState<string | null>(null); // New state for video preview
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TCGCard[]>([]);
  const [selectedTcg, setSelectedTcg] = useState<TCGCard | null>(null);
  const [publishing, setPublishing] = useState(false);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null); // Ref for video input

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<DbCard | null>(null);

  const fetchCards = async () => {
    const { data: cardsData, error: cardsError } = await supabase
      .from("cards")
      .select("*")
      .order("created_at", { ascending: false });

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
  }, []);

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
      price: Number(price),
      condition: condition,
      photo_url,
      video_url, // Include video_url in the insert
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

  const handleEditClick = (card: DbCard) => {
    setEditingCard(card);
    setIsEditDialogOpen(true);
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
          <a href="/" className="text-sm text-muted-foreground underline">View sale →</a>
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
                    <Camera className="w-4 h-4 mr-2" /> Upload Photo
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
                    <Video className="w-4 h-4 mr-2" /> Upload Video
                  </Button>
                  <input
                    ref={videoFileRef}
                    type="file"
                    accept="video/*"
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

        {/* Listed cards */}
        <Card className="gradient-card-bg border-border">
          <CardHeader>
            <CardTitle>Live Listings ({cards.length})</CardTitle>
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
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5">Available</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => handleEditClick(c)}>
                      <Edit className="w-4 h-4 text-muted-foreground" />
                    </Button>
                    {c.status === "claimed" && (
                      <Button size="icon" variant="ghost" onClick={() => handleAdminUnclaim(c.id)}>
                        <Lock className="w-4 h-4 text-primary" />
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
          onSave={fetchCards} // Re-fetch cards after saving
        />
      )}
    </div>
  );
};

export default Admin;