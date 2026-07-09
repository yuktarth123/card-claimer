import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Play, StopCircle, Calendar, Gift, Upload, X } from "lucide-react";

type SaleRow = {
  id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
  transaction_count: number;
  total_xp: number;
  prize_text: string | null;
  prize_image_url: string | null;
};

export function SaleManager() {
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [prizeText, setPrizeText] = useState("");
  const [prizeImageUrl, setPrizeImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingPrize, setSavingPrize] = useState(false);

  const refresh = async () => {
    const { data, error } = await supabase.rpc("list_sales");
    if (error) {
      toast.error("Failed to load sales");
    } else {
      setSales(
        ((data ?? []) as any[]).map((r) => ({
          ...r,
          transaction_count: Number(r.transaction_count),
          total_xp: Number(r.total_xp),
        }))
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();

    // Keep transaction_count/total_xp live -- a sale can be marked sold from
    // elsewhere in the console (the Live Listings panel), which wouldn't
    // otherwise touch this component's state.
    const channel = supabase
      .channel("sale-manager-transactions")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => {
        refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const active = sales.find((s) => !s.ended_at) ?? null;

  const handleStart = async () => {
    if (!newName.trim()) {
      toast.error("Name your sale first (e.g. 'May Drop')");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("start_sale", { _name: newName.trim() });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`Sale started: ${newName.trim()}`);
      setNewName("");
      refresh();
    }
  };

  const handleEnd = async () => {
    if (!active) return;
    if (!confirm(`End "${active.name}"? Per-sale leaderboard will be archived. Monthly view is unaffected.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("end_active_sale");
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Sale ended. Leaderboard reset for the next sale.");
      refresh();
    }
  };

  const openPrizeEditor = (sale: SaleRow) => {
    setEditingId(sale.id);
    setPrizeText(sale.prize_text ?? "");
    setPrizeImageUrl(sale.prize_image_url ?? null);
  };

  const closePrizeEditor = () => {
    setEditingId(null);
    setPrizeText("");
    setPrizeImageUrl(null);
  };

  const handleUpload = async (file: File) => {
    if (!file || !editingId) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `sale-${editingId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("prize-images").upload(path, file, { upsert: true });
    if (error) {
      toast.error(error.message);
    } else {
      const { data } = supabase.storage.from("prize-images").getPublicUrl(path);
      setPrizeImageUrl(data.publicUrl);
    }
    setUploading(false);
  };

  const handleSavePrize = async () => {
    if (!editingId) return;
    setSavingPrize(true);
    const { error } = await supabase.rpc("update_sale_prize", {
      _sale_id: editingId,
      _prize_text: prizeText.trim() || null,
      _prize_image_url: prizeImageUrl,
    });
    setSavingPrize(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Prize saved for this sale");
      closePrizeEditor();
      refresh();
    }
  };

  const renderPrizeEditor = (sale: SaleRow) => (
    <div className="mt-3 space-y-2 rounded-md border border-border bg-background/60 p-3">
      <Label className="text-xs">Prize description</Label>
      <Textarea
        rows={2}
        placeholder="e.g. Limited-edition booster box + ₹1,000 store credit"
        value={prizeText}
        onChange={(e) => setPrizeText(e.target.value)}
      />
      <Label className="text-xs">Prize image</Label>
      {prizeImageUrl ? (
        <div className="relative w-32 h-20 rounded-md overflow-hidden border border-border">
          <img src={prizeImageUrl} alt="Prize" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => setPrizeImageUrl(null)}
            className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <label className="inline-flex items-center gap-2 cursor-pointer text-xs px-3 py-1.5 rounded-md border border-dashed border-border hover:bg-muted">
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          {uploading ? "Uploading…" : "Upload image"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            disabled={uploading}
          />
        </label>
      )}
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSavePrize} disabled={savingPrize}>
          {savingPrize && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          Save prize
        </Button>
        <Button size="sm" variant="ghost" onClick={closePrizeEditor}>
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <Card className="gradient-card-bg border-border lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" /> Sale Events
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {active ? (
          <div className="rounded-lg border border-success/40 bg-success/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Active sale</p>
                <p className="font-bold">{active.name}</p>
                <p className="text-xs text-muted-foreground">
                  {active.transaction_count} sales · {Math.round(active.total_xp)} XP awarded
                  {active.prize_text || active.prize_image_url ? " · 🎁 prize set" : " · no prize set"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => openPrizeEditor(active)} variant="outline" size="sm">
                  <Gift className="w-4 h-4 mr-1" /> Prize
                </Button>
                <Button onClick={handleEnd} variant="destructive" disabled={busy}>
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <StopCircle className="w-4 h-4 mr-2" />}
                  End sale & reset leaderboard
                </Button>
              </div>
            </div>
            {editingId === active.id && renderPrizeEditor(active)}
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Start a new sale</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Sale name (e.g. May Drop)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Button onClick={handleStart} disabled={busy} className="gradient-gold text-primary-foreground font-bold">
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                Start
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Transactions made while a sale is active count toward that sale's leaderboard.
            </p>
          </div>
        )}

        <div>
          <Label className="mb-2 block">Past sales</Label>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : sales.filter((s) => s.ended_at).length === 0 ? (
            <p className="text-sm text-muted-foreground">No past sales yet.</p>
          ) : (
            <ul className="space-y-1.5 max-h-60 overflow-y-auto">
              {sales
                .filter((s) => s.ended_at)
                .map((s) => (
                  <li
                    key={s.id}
                    className="text-sm border border-border rounded-md p-2 bg-background/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {s.name}
                          {(s.prize_text || s.prize_image_url) && <span className="ml-1">🎁</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(s.started_at).toLocaleDateString()} →{" "}
                          {s.ended_at ? new Date(s.ended_at).toLocaleDateString() : "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {s.transaction_count} sales · {Math.round(s.total_xp)} XP
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => openPrizeEditor(s)}>
                          <Gift className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    {editingId === s.id && renderPrizeEditor(s)}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
