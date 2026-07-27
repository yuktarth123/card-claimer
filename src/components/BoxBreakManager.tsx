import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Play, StopCircle, RotateCcw, Trash2, Upload, X, Package, ChevronDown, ChevronUp, Check } from "lucide-react";
import { CURRENCY } from "@/config";
import { extractYouTubeId } from "@/lib/youtube";
import { parseStorageUrl } from "@/lib/utils";

type BoxBreak = Database["public"]["Tables"]["box_breaks"]["Row"];
type BreakSlotClaim = Database["public"]["Tables"]["break_slot_claims"]["Row"];

const statusLabel: Record<string, string> = { upcoming: "Upcoming", live: "🔴 Live", ended: "Ended" };

export function BoxBreakManager() {
  const [breaks, setBreaks] = useState<BoxBreak[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [title, setTitle] = useState("");
  const [totalSlots, setTotalSlots] = useState("36");
  const [pricePerSlot, setPricePerSlot] = useState("");
  const [youtubeVideoId, setYoutubeVideoId] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [claimsByBreak, setClaimsByBreak] = useState<Record<string, BreakSlotClaim[]>>({});
  const [videoIdDrafts, setVideoIdDrafts] = useState<Record<string, string>>({});
  const [savingVideoId, setSavingVideoId] = useState<string | null>(null);

  const refresh = async () => {
    const { data, error } = await supabase.from("box_breaks").select("*").order("created_at", { ascending: false });
    if (error) toast.error("Failed to load breaks");
    else if (data) setBreaks(data);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("admin-box-breaks")
      .on("postgres_changes", { event: "*", schema: "public", table: "box_breaks" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadClaims = async (breakId: string) => {
    const { data, error } = await supabase
      .from("break_slot_claims")
      .select("*")
      .eq("break_id", breakId)
      .order("slot_number", { ascending: true });
    if (error) toast.error("Failed to load slot claims");
    else if (data) setClaimsByBreak((prev) => ({ ...prev, [breakId]: data }));
  };

  const toggleExpand = (breakId: string) => {
    if (expandedId === breakId) {
      setExpandedId(null);
    } else {
      setExpandedId(breakId);
      loadClaims(breakId);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `break-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("break-images").upload(path, file, { upsert: true });
    if (error) {
      toast.error(error.message);
    } else {
      const { data } = supabase.storage.from("break-images").getPublicUrl(path);
      setImageUrl(data.publicUrl);
    }
    setUploading(false);
  };

  const handleCreate = async () => {
    const slots = parseInt(totalSlots, 10);
    const price = parseFloat(pricePerSlot);
    if (!title.trim()) return toast.error("Give the break a title");
    if (!slots || slots <= 0) return toast.error("Total slots must be a positive number");
    if (isNaN(price) || price < 0) return toast.error("Enter a valid price per slot");

    setCreating(true);
    const { error } = await supabase.from("box_breaks").insert({
      title: title.trim(),
      total_slots: slots,
      price_per_slot: price,
      youtube_video_id: youtubeVideoId.trim() ? extractYouTubeId(youtubeVideoId) : null,
      image_url: imageUrl,
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Break "${title.trim()}" created`);
      setTitle("");
      setTotalSlots("36");
      setPricePerSlot("");
      setYoutubeVideoId("");
      setImageUrl(null);
    }
  };

  const saveVideoId = async (breakId: string) => {
    const draft = videoIdDrafts[breakId] ?? "";
    const cleaned = draft.trim() ? extractYouTubeId(draft) : null;
    setSavingVideoId(breakId);
    const { error } = await supabase.from("box_breaks").update({ youtube_video_id: cleaned }).eq("id", breakId);
    setSavingVideoId(null);
    if (error) toast.error(error.message);
    else toast.success(cleaned ? "Video updated" : "Video cleared");
  };

  const setStatus = async (breakId: string, status: string) => {
    const { error } = await supabase.from("box_breaks").update({ status }).eq("id", breakId);
    if (error) toast.error(error.message);
  };

  const deleteBreak = async (breakRow: BoxBreak) => {
    if (!confirm(`Delete "${breakRow.title}"? This also removes its slot claims and chat history.`)) return;
    const { error } = await supabase.from("box_breaks").delete().eq("id", breakRow.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Break deleted");

    // Best-effort, same as the card-listing delete flow: the break is
    // already gone (and its claims/chat cascaded via FK), so a storage
    // hiccup here shouldn't block the admin -- it just leaves an orphaned
    // cover image to clean up later instead of a broken break they can't
    // remove.
    if (breakRow.image_url) {
      const parsed = parseStorageUrl(breakRow.image_url);
      if (parsed) {
        const { error: storageError } = await supabase.storage.from(parsed.bucket).remove([parsed.path]);
        if (storageError) console.error(`Failed to delete break image for ${breakRow.id}:`, storageError);
      }
    }
  };

  const markSold = async (claimId: string, breakId: string) => {
    const { error } = await supabase.rpc("admin_mark_break_slot_sold", { _claim_id: claimId });
    if (error) toast.error(error.message);
    else loadClaims(breakId);
  };

  const releaseClaim = async (claimId: string, breakId: string) => {
    const { error } = await supabase.rpc("admin_release_break_slot_claim", { _claim_id: claimId });
    if (error) toast.error(error.message);
    else loadClaims(breakId);
  };

  return (
    <div className="space-y-6">
      <Card className="gradient-card-bg border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" /> Create a Box Break
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Title</Label>
              <Input placeholder="e.g. Scarlet & Violet Booster Box Break" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Total slots</Label>
              <Input type="number" min={1} value={totalSlots} onChange={(e) => setTotalSlots(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Price per slot ({CURRENCY})</Label>
              <Input type="number" min={0} value={pricePerSlot} onChange={(e) => setPricePerSlot(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>YouTube video URL or ID</Label>
              <Input
                placeholder="Paste the full youtube.com/watch?v=... link, or just the ID"
                value={youtubeVideoId}
                onChange={(e) => setYoutubeVideoId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Leave blank until you start the YouTube live stream, then paste the link in below and set status to Live.</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Cover image</Label>
              {imageUrl ? (
                <div className="relative w-32 h-20 rounded-md overflow-hidden border border-border">
                  <img src={imageUrl} alt="Cover" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setImageUrl(null)} className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <label className="inline-flex items-center gap-2 cursor-pointer text-xs px-3 py-1.5 rounded-md border border-dashed border-border hover:bg-muted">
                  {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  {uploading ? "Uploading…" : "Upload image"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} disabled={uploading} />
                </label>
              )}
            </div>
          </div>
          <Button onClick={handleCreate} disabled={creating} className="gradient-gold text-primary-foreground font-bold">
            {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Break
          </Button>
        </CardContent>
      </Card>

      <Card className="gradient-card-bg border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" /> Your Breaks
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : breaks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No breaks yet — create one above.</p>
          ) : (
            <ul className="space-y-2">
              {breaks.map((b) => {
                const claims = claimsByBreak[b.id] ?? [];
                const isExpanded = expandedId === b.id;
                return (
                  <li key={b.id} className="border border-border rounded-lg bg-background/40 overflow-hidden">
                    <div className="p-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold truncate">{b.title}</p>
                          <Badge
                            className={
                              b.status === "live"
                                ? "bg-success text-success-foreground border-0"
                                : b.status === "ended"
                                  ? "bg-muted text-muted-foreground border-0"
                                  : "bg-primary/15 text-primary border border-primary/30"
                            }
                          >
                            {statusLabel[b.status]}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {b.total_slots} slots · {CURRENCY}{Number(b.price_per_slot).toFixed(0)} each
                        </p>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Input
                            className="h-7 text-xs max-w-xs"
                            placeholder="Paste YouTube link once live…"
                            value={videoIdDrafts[b.id] ?? b.youtube_video_id ?? ""}
                            onChange={(e) => setVideoIdDrafts((prev) => ({ ...prev, [b.id]: e.target.value }))}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            disabled={savingVideoId === b.id}
                            onClick={() => saveVideoId(b.id)}
                          >
                            {savingVideoId === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {b.status !== "live" && (
                          <Button size="sm" variant="outline" onClick={() => setStatus(b.id, "live")}>
                            <Play className="w-3.5 h-3.5 mr-1" /> Go Live
                          </Button>
                        )}
                        {b.status === "live" && (
                          <Button size="sm" variant="outline" onClick={() => setStatus(b.id, "ended")}>
                            <StopCircle className="w-3.5 h-3.5 mr-1" /> End
                          </Button>
                        )}
                        {b.status === "ended" && (
                          <Button size="sm" variant="outline" onClick={() => setStatus(b.id, "upcoming")}>
                            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reopen
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => toggleExpand(b.id)}>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          Slots
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteBreak(b)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-border p-3 bg-muted/30">
                        {claims.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No slots claimed yet.</p>
                        ) : (
                          <ul className="space-y-1.5 max-h-72 overflow-y-auto">
                            {claims.map((c) => (
                              <li key={c.id} className="flex items-center justify-between gap-2 text-sm border border-border rounded-md px-2 py-1.5 bg-background/60">
                                <span>
                                  Slot <strong>{c.slot_number}</strong> — {c.buyer_name}{" "}
                                  <span className={c.status === "checked_out" ? "text-success" : "text-muted-foreground"}>
                                    ({c.status === "checked_out" ? "sold" : "pending"})
                                  </span>
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {c.status === "claimed" && (
                                    <Button size="sm" variant="outline" onClick={() => markSold(c.id, b.id)}>
                                      Mark Sold
                                    </Button>
                                  )}
                                  <Button size="sm" variant="ghost" onClick={() => releaseClaim(c.id, b.id)}>
                                    Release
                                  </Button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
