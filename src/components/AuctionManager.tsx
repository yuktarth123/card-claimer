import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Camera, Loader2, X, Video, Upload, Gavel, Trash2, StopCircle, Ban, ShieldOff, Trophy, Clock, Pencil, Save,
} from "lucide-react";
import { CURRENCY, DEFAULT_STARTING_PRICE, DEFAULT_BID_INCREMENT } from "@/config";
import { AdditionalPhotosField } from "@/components/AdditionalPhotosField";
import { prepareVideoForUpload, isPayloadTooLargeError } from "@/lib/videoUpload";
import { parseStorageUrl } from "@/lib/utils";
import { effectiveAuctionStatus, formatCountdown } from "@/lib/auction";

type DbCard = Database["public"]["Tables"]["cards"]["Row"];
type AuctionItem = Database["public"]["Tables"]["auction_items"]["Row"];
type BlockedBidder = Database["public"]["Tables"]["blocked_bidders"]["Row"];

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AuctionManager({ cards }: { cards: DbCard[] }) {
  const [items, setItems] = useState<AuctionItem[]>([]);
  const [blocked, setBlocked] = useState<BlockedBidder[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<"new" | "existing">("new");
  const [selectedCardId, setSelectedCardId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startingPrice, setStartingPrice] = useState(String(DEFAULT_STARTING_PRICE));
  const [bidIncrement, setBidIncrement] = useState(String(DEFAULT_BID_INCREMENT));
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

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
  const photoFileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);

  const [blockPhone, setBlockPhone] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [blockBusy, setBlockBusy] = useState(false);

  const fetchItems = async () => {
    const { data, error } = await supabase.from("auction_items").select("*").order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      toast.error("Failed to load auctions");
    } else if (data) setItems(data);
    setLoading(false);
  };

  const fetchBlocked = async () => {
    const { data, error } = await supabase.from("blocked_bidders").select("*").order("blocked_at", { ascending: false });
    if (error) console.error(error);
    else if (data) setBlocked(data);
  };

  useEffect(() => {
    fetchItems();
    fetchBlocked();
    const tick = setInterval(() => setNow(Date.now()), 1000);

    const itemsChannel = supabase
      .channel("admin-auction-items")
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_items" }, fetchItems)
      .subscribe();
    const blockedChannel = supabase
      .channel("admin-blocked-bidders")
      .on("postgres_changes", { event: "*", schema: "public", table: "blocked_bidders" }, fetchBlocked)
      .subscribe();

    return () => {
      clearInterval(tick);
      supabase.removeChannel(itemsChannel);
      supabase.removeChannel(blockedChannel);
    };
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setMode("new");
    setSelectedCardId("");
    setTitle("");
    setDescription("");
    setStartingPrice(String(DEFAULT_STARTING_PRICE));
    setBidIncrement(String(DEFAULT_BID_INCREMENT));
    setStartAt("");
    setEndAt("");
    setPhotoFile(null);
    setPhotoPreview(null);
    setExistingPhotoUrl(null);
    setPhotoUrlInput("");
    setExtraPhotoUrls([]);
    setVideoFile(null);
    setVideoPreview(null);
    setExistingVideoUrl(null);
    if (photoFileRef.current) photoFileRef.current.value = "";
    if (videoFileRef.current) videoFileRef.current.value = "";
  };

  const onSelectCard = (cardId: string) => {
    setSelectedCardId(cardId);
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    setTitle(card.name);
    setStartingPrice(String(Math.max(DEFAULT_STARTING_PRICE, Math.round(Number(card.price)))));
    setPhotoFile(null);
    setPhotoPreview(card.photo_url);
    setExistingPhotoUrl(card.photo_url);
    setExtraPhotoUrls(card.photo_urls ?? []);
    setVideoFile(null);
    setVideoPreview(card.video_url);
    setExistingVideoUrl(card.video_url);
  };

  const startEdit = (item: AuctionItem) => {
    setEditingId(item.id);
    setMode("new");
    setSelectedCardId("");
    setTitle(item.title);
    setDescription(item.description ?? "");
    setStartingPrice(String(item.starting_price));
    setBidIncrement(String(item.bid_increment));
    setStartAt(toDatetimeLocal(item.start_time));
    setEndAt(toDatetimeLocal(item.end_time));
    setPhotoFile(null);
    setPhotoPreview(item.photo_url);
    setExistingPhotoUrl(item.photo_url);
    setExtraPhotoUrls(item.photo_urls ?? []);
    setVideoFile(null);
    setVideoPreview(item.video_url);
    setExistingVideoUrl(item.video_url);
    if (photoFileRef.current) photoFileRef.current.value = "";
    if (videoFileRef.current) videoFileRef.current.value = "";
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onPickPhoto = (file: File | null) => {
    setPhotoFile(file);
    setExistingPhotoUrl(null);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
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

  const publish = async () => {
    if (!title.trim()) {
      toast.error("Add a title");
      return;
    }
    const parsedStarting = Number(startingPrice);
    const parsedIncrement = Number(bidIncrement);
    if (!parsedStarting || parsedStarting < 100) {
      toast.error("Starting price must be at least ₹100");
      return;
    }
    if (!parsedIncrement || parsedIncrement < 100) {
      toast.error("Bid increment must be at least ₹100");
      return;
    }
    if (!startAt || !endAt) {
      toast.error("Set both a start and end time");
      return;
    }
    const startIso = new Date(startAt).toISOString();
    const endIso = new Date(endAt).toISOString();
    if (new Date(endIso) <= new Date(startIso)) {
      toast.error("End time must be after start time");
      return;
    }

    setPublishing(true);
    let photo_url: string | null = existingPhotoUrl;
    let video_url: string | null = existingVideoUrl;

    if (photoFile) {
      const path = `card-images/${Date.now()}-${Math.random().toString(36).slice(2)}.${photoFile.name.split(".").pop() || "jpg"}`;
      const { error: upErr } = await supabase.storage.from("card-images").upload(path, photoFile, { cacheControl: "3600", upsert: false });
      if (upErr) {
        toast.error("Photo upload failed");
        setPublishing(false);
        return;
      }
      photo_url = supabase.storage.from("card-images").getPublicUrl(path).data.publicUrl;
    }

    if (videoFile) {
      const path = `card-videos/${Date.now()}-${Math.random().toString(36).slice(2)}.${videoFile.name.split(".").pop() || "mp4"}`;
      const { error: upErr } = await supabase.storage.from("card-videos").upload(path, videoFile, { cacheControl: "3600", upsert: false });
      if (upErr) {
        toast.error(isPayloadTooLargeError(upErr) ? "Video is too large (max 50MB)." : "Video upload failed");
        setPublishing(false);
        return;
      }
      video_url = supabase.storage.from("card-videos").getPublicUrl(path).data.publicUrl;
    }

    if (editingId) {
      const { error } = await supabase
        .from("auction_items")
        .update({
          title: title.trim(),
          description: description.trim() || null,
          photo_url,
          photo_urls: extraPhotoUrls,
          video_url,
          starting_price: parsedStarting,
          bid_increment: parsedIncrement,
          start_time: startIso,
          end_time: endIso,
        })
        .eq("id", editingId);
      setPublishing(false);
      if (error) {
        console.error(error);
        toast.error("Couldn't save changes");
      } else {
        toast.success(`Auction updated: ${title}`);
        resetForm();
      }
      return;
    }

    const { error } = await supabase.from("auction_items").insert({
      source_card_id: mode === "existing" ? selectedCardId || null : null,
      title: title.trim(),
      description: description.trim() || null,
      photo_url,
      photo_urls: extraPhotoUrls,
      video_url,
      starting_price: parsedStarting,
      bid_increment: parsedIncrement,
      start_time: startIso,
      end_time: endIso,
      status: "scheduled",
    });
    setPublishing(false);
    if (error) {
      console.error(error);
      toast.error("Couldn't create auction");
    } else {
      toast.success(`Auction created: ${title}`);
      resetForm();
    }
  };

  const cancelAuction = async (item: AuctionItem) => {
    if (!confirm(`Cancel the auction for "${item.title}"? Bids already placed stay on record but no winner will be declared.`)) return;
    const { error } = await supabase.from("auction_items").update({ status: "cancelled" }).eq("id", item.id);
    if (error) toast.error("Failed to cancel");
    else toast.success("Auction cancelled");
  };

  const endNow = async (item: AuctionItem) => {
    if (!confirm(`End "${item.title}" right now and declare the current highest bidder the winner?`)) return;
    const { error } = await supabase.from("auction_items").update({ end_time: new Date().toISOString() }).eq("id", item.id);
    if (error) {
      toast.error("Failed to end auction");
      return;
    }
    await supabase.rpc("sync_auction_statuses");
    toast.success("Auction ended");
  };

  const deleteAuction = async (item: AuctionItem) => {
    if (!confirm(`Delete the auction "${item.title}"? This removes all its bid history too.`)) return;
    const { error } = await supabase.from("auction_items").delete().eq("id", item.id);
    if (error) {
      toast.error("Delete failed");
      return;
    }
    toast("Deleted");

    // Only clean up storage for media uploaded specifically for this
    // auction -- if it was copied from an existing card (source_card_id
    // set), that file is still owned by the card and must stay.
    if (!item.source_card_id) {
      const mediaUrls = [item.video_url, item.photo_url, ...(item.photo_urls ?? [])].filter((u): u is string => !!u);
      const pathsByBucket = new Map<string, string[]>();
      for (const url of mediaUrls) {
        const parsed = parseStorageUrl(url);
        if (!parsed) continue;
        pathsByBucket.set(parsed.bucket, [...(pathsByBucket.get(parsed.bucket) ?? []), parsed.path]);
      }
      for (const [bucket, paths] of pathsByBucket) {
        const { error: storageError } = await supabase.storage.from(bucket).remove(paths);
        if (storageError) console.error(`Failed to delete ${bucket} files for auction ${item.id}:`, storageError);
      }
    }
  };

  const addBlock = async () => {
    const digits = blockPhone.replace(/\D/g, "");
    if (digits.length < 10) {
      toast.error("Enter a valid phone number");
      return;
    }
    setBlockBusy(true);
    const { error } = await supabase.from("blocked_bidders").upsert(
      { phone: digits, reason: blockReason.trim() || null, blocked_at: new Date().toISOString() },
      { onConflict: "phone" }
    );
    setBlockBusy(false);
    if (error) toast.error("Failed to block");
    else {
      toast.success(`Blocked ${digits}`);
      setBlockPhone("");
      setBlockReason("");
    }
  };

  const removeBlock = async (b: BlockedBidder) => {
    if (!confirm(`Unblock ${b.phone}?`)) return;
    const { error } = await supabase.from("blocked_bidders").delete().eq("id", b.id);
    if (error) toast.error("Failed to unblock");
    else toast.success("Unblocked");
  };

  const blockWinner = async (item: AuctionItem) => {
    if (!item.winner_session_id) return;
    const { data, error } = await supabase
      .from("auction_bids")
      .select("buyer_phone")
      .eq("auction_item_id", item.id)
      .eq("buyer_session_id", item.winner_session_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data?.buyer_phone) {
      toast.error("Couldn't find a phone number for this winner");
      return;
    }
    if (!confirm(`Block ${item.winner_name} (${data.buyer_phone}) from bidding again for not paying "${item.title}"?`)) return;
    const { error: blockError } = await supabase.from("blocked_bidders").upsert(
      { phone: data.buyer_phone, reason: `Didn't pay for "${item.title}"`, blocked_at: new Date().toISOString() },
      { onConflict: "phone" }
    );
    if (blockError) toast.error("Failed to block");
    else toast.success(`${item.winner_name} blocked from future bidding`);
  };

  const statusLabel = (item: AuctionItem) => {
    const s = effectiveAuctionStatus(item, now);
    if (s === "scheduled") return { text: `Starts in ${formatCountdown(new Date(item.start_time).getTime() - now)}`, cls: "bg-secondary text-secondary-foreground" };
    if (s === "live") return { text: `Live — ends in ${formatCountdown(new Date(item.end_time).getTime() - now)}`, cls: "bg-success text-success-foreground" };
    if (s === "cancelled") return { text: "Cancelled", cls: "bg-destructive/20 text-destructive" };
    return { text: "Ended", cls: "bg-muted text-muted-foreground" };
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6 [&>*]:min-w-0">
      <Card className="gradient-card-bg border-border" ref={formRef}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {editingId ? <Pencil className="w-5 h-5 text-primary" /> : <Gavel className="w-5 h-5 text-primary" />}
            {editingId ? "Edit Auction" : "Create an Auction"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!editingId && (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={mode === "new" ? "default" : "outline"} onClick={() => setMode("new")} className="flex-1">
                New Item
              </Button>
              <Button type="button" size="sm" variant={mode === "existing" ? "default" : "outline"} onClick={() => setMode("existing")} className="flex-1">
                Existing Card
              </Button>
            </div>
          )}

          {mode === "existing" && !editingId && (
            <div className="space-y-2">
              <Label>Pick a listing</Label>
              <Select value={selectedCardId} onValueChange={onSelectCard}>
                <SelectTrigger><SelectValue placeholder="Choose a card…" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {cards.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} — {CURRENCY}{Number(c.price).toFixed(0)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Photo</Label>
            {photoPreview ? (
              <div className="relative aspect-[4/3] max-w-[220px] rounded-xl overflow-hidden border border-border">
                <img src={photoPreview} alt="preview" className="w-full h-full object-cover" />
                <Button size="icon" variant="destructive" className="absolute top-2 right-2 h-7 w-7" onClick={() => onPickPhoto(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2 flex-wrap">
                  <Button type="button" variant="outline" onClick={() => photoFileRef.current?.click()} className="flex-1 min-w-[140px]">
                    <Camera className="w-4 h-4 mr-2" /> Take / Choose Photo
                  </Button>
                  <input ref={photoFileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPickPhoto(e.target.files?.[0] || null)} />
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
                  <Button type="button" variant="secondary" onClick={() => { if (photoUrlInput.trim()) { onPickPhotoUrl(photoUrlInput.trim()); setPhotoUrlInput(""); } }}>
                    Use URL
                  </Button>
                </div>
              </div>
            )}
          </div>

          <AdditionalPhotosField urls={extraPhotoUrls} onChange={setExtraPhotoUrls} />

          <div className="space-y-2">
            <Label>Video (optional)</Label>
            {videoPreview ? (
              <div className="relative aspect-[4/3] max-w-[220px] rounded-xl overflow-hidden border border-border bg-black flex items-center justify-center">
                <video src={videoPreview} controls muted className="w-full h-full object-contain" />
                <Button size="icon" variant="destructive" className="absolute top-2 right-2 h-7 w-7" onClick={() => onPickVideo(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                <Button type="button" variant="outline" onClick={() => videoFileRef.current?.click()} disabled={isProcessingVideo} className="flex-1 min-w-[140px]">
                  {isProcessingVideo ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Compressing…</> : <><Video className="w-4 h-4 mr-2" /> Record / Choose Video</>}
                </Button>
                <input ref={videoFileRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => onPickVideo(e.target.files?.[0] || null)} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Charizard VMAX — PSA 10" />
          </div>
          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Condition notes, backstory, what makes it special…" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Starting Price ({CURRENCY})</Label>
              <Input type="number" inputMode="numeric" min={100} value={startingPrice} onChange={(e) => setStartingPrice(e.target.value)} />
            </div>
            <div>
              <Label>Bid Increment ({CURRENCY})</Label>
              <Input type="number" inputMode="numeric" min={100} value={bidIncrement} onChange={(e) => setBidIncrement(e.target.value)} />
            </div>
            <div>
              <Label>Start Time</Label>
              <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </div>
            <div>
              <Label>End Time</Label>
              <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-2">
            {editingId && (
              <Button type="button" variant="outline" onClick={resetForm} className="h-12">
                Cancel
              </Button>
            )}
            <Button onClick={publish} disabled={publishing || isProcessingVideo} className="flex-1 h-12 gradient-gold text-primary-foreground font-bold text-base">
              {publishing ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : editingId ? (
                <Save className="w-4 h-4 mr-2" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {editingId ? "Save Changes" : "Create Auction"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="gradient-card-bg border-border">
          <CardHeader>
            <CardTitle>Auctions ({items.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No auctions yet.</p>
              ) : (
                items.map((item) => {
                  const label = statusLabel(item);
                  const status = effectiveAuctionStatus(item, now);
                  return (
                    <div key={item.id} className="rounded-lg border border-border bg-background/40 p-2.5">
                      <div className="flex items-start gap-3">
                        {(item.photo_url || item.video_url) && (
                          <div className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-muted">
                            {item.video_url ? (
                              <video src={item.video_url} className="w-full h-full object-cover" muted playsInline preload="none" />
                            ) : (
                              <img src={item.photo_url!} alt={item.title} className="w-full h-full object-cover" />
                            )}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{item.title}</p>
                          <span className={`inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${label.cls}`}>
                            <Clock className="w-2.5 h-2.5" /> {label.text}
                          </span>
                          <p className="text-xs text-muted-foreground mt-1">
                            {item.current_bid != null ? `Current: ${CURRENCY}${Number(item.current_bid).toFixed(0)} by ${item.current_bid_name}` : `Starting at ${CURRENCY}${Number(item.starting_price).toFixed(0)}`}
                            {" · "}{item.bid_count} bid{item.bid_count === 1 ? "" : "s"}
                          </p>
                          {status === "ended" && item.winner_name && (
                            <p className="text-xs font-semibold text-primary flex items-center gap-1 mt-0.5">
                              <Trophy className="w-3 h-3" /> {item.winner_name} won for {CURRENCY}{Number(item.winner_amount).toFixed(0)}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={() => startEdit(item)}>
                            <Pencil className="w-4 h-4 text-muted-foreground" />
                          </Button>
                          {(status === "scheduled" || status === "live") && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="End now" onClick={() => endNow(item)}>
                              <StopCircle className="w-4 h-4 text-primary" />
                            </Button>
                          )}
                          {(status === "scheduled" || status === "live") && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Cancel" onClick={() => cancelAuction(item)}>
                              <Ban className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                          {status === "ended" && item.winner_name && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Block winner (didn't pay)" onClick={() => blockWinner(item)}>
                              <ShieldOff className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Delete" onClick={() => deleteAuction(item)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card-bg border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldOff className="w-5 h-5 text-primary" /> Blocked Bidders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Input placeholder="Phone number" value={blockPhone} onChange={(e) => setBlockPhone(e.target.value)} className="flex-1 min-w-[140px]" />
              <Input placeholder="Reason (optional)" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} className="flex-1 min-w-[140px]" />
              <Button onClick={addBlock} disabled={blockBusy} variant="destructive">
                {blockBusy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Ban className="w-4 h-4 mr-1.5" />} Block
              </Button>
            </div>
            {blocked.length === 0 ? (
              <p className="text-sm text-muted-foreground">No one is blocked.</p>
            ) : (
              <ul className="space-y-1.5 max-h-60 overflow-y-auto">
                {blocked.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 text-sm border border-border rounded-md p-2 bg-background/40">
                    <div className="min-w-0">
                      <p className="font-medium">{b.phone}</p>
                      {b.reason && <p className="text-xs text-muted-foreground truncate">{b.reason}</p>}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => removeBlock(b)}>Unblock</Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
