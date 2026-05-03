import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { searchPokemonCards, TCGCard } from "@/lib/pokemontcg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Camera, Upload, Search, Trash2, Plus, X, Loader2, Sparkles } from "lucide-react";
import { CURRENCY, USD_TO_INR_RATE } from "@/config";

type DbCard = Database["public"]["Tables"]["cards"]["Row"];

const Admin = () => {
  const [cards, setCards] = useState<DbCard[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TCGCard[]>([]);
  const [selectedTcg, setSelectedTcg] = useState<TCGCard | null>(null);
  const [publishing, setPublishing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase
      .from("cards")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => data && setCards(data));

    const channel = supabase
      .channel("admin-cards")
      .on("postgres_changes", { event: "*", schema: "public", table: "cards" }, () => {
        supabase
          .from("cards")
          .select("*")
          .order("created_at", { ascending: false })
          .then(({ data }) => data && setCards(data));
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

    // Auto-populate price with USD to INR conversion
    let usdPrice: number | undefined;
    if (c.tcgplayer?.prices?.averageSellPrice) {
      usdPrice = c.tcgplayer.prices.averageSellPrice;
    } else if (c.cardmarket?.prices?.averageSellPrice) {
      usdPrice = c.cardmarket.prices.averageSellPrice;
    }

    if (usdPrice) {
      const inrPrice = usdPrice * USD_TO_INR_RATE;
      setPrice(inrPrice.toFixed(0)); // Set as string, rounded to nearest whole number
      toast.success(`Price auto-filled: ${CURRENCY}${inrPrice.toFixed(0)}`);
    } else {
      toast.info("No price found for this card from TCG API.");
    }
  };

  const reset = () => {
    setName("");
    setPrice("");
    setPhotoFile(null);
    setPhotoPreview(null);
    setSearch("");
    setResults([]);
    setSelectedTcg(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const publish = async () => {
    if (!name.trim() || !price) {
      toast.error("Add a name and price");
      return;
    }
    setPublishing(true);
    let photo_url: string | null = null;

    if (photoFile) {
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${photoFile.name.split(".").pop() || "jpg"}`;
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

    const { error } = await supabase.from("cards").insert({
      name: name.trim(),
      price: Number(price),
      photo_url,
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
      reset();
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this card?")) return;
    const { error } = await supabase.from("cards").delete().eq("id", id);
    if (error) toast.error("Delete failed");
    else toast("Deleted");
  };

  return (
    <div className="min-h-screen pb-12">
      <header className="border-b border-border">
        <div className="container py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center shadow-glow">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-black">Seller Console</h1>
              <p className="text-xs text-muted-foreground">Quick-list cards for the live drop</p>
            </div>
          </div>
          <a href="/" className="text-sm text-muted-foreground underline">View sale →</a>
        </div>
      </header>

      <main className="container py-6 grid lg:grid-cols-2 gap-6">
        {/* Quick list form */}
        <Card className="gradient-card-bg border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" /> Add a Card
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Photo */}
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
                    onClick={() => fileRef.current?.click()}
                    className="flex-1 min-w-[140px]"
                  >
                    <Camera className="w-4 h-4 mr-2" /> Scan with Camera
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => onPickPhoto(e.target.files?.[0] || null)}
                  />
                </div>
              )}
            </div>

            {/* TCG search */}
            <div className="space-y-2">
              <Label>Auto-fill from Pokémon TCG</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. Charizard, 114 M2"
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
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
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
                  {(c.tcg_image_url || c.photo_url) && (
                    <img src={c.tcg_image_url || c.photo_url!} alt={c.name} className="w-12 h-16 object-cover rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.card_set || "—"} • {CURRENCY}{Number(c.price).toFixed(0)}
                    </p>
                    {c.status === "claimed" ? (
                      <p className="text-xs text-success font-semibold mt-0.5">✓ Claimed by {c.claimed_by}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5">Available</p>
                    )}
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => remove(c.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Admin;