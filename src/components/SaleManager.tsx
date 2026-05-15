import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Play, StopCircle, Calendar } from "lucide-react";

type SaleRow = {
  id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
  transaction_count: number;
  total_xp: number;
};

export function SaleManager() {
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");

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

  return (
    <Card className="gradient-card-bg border-border lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" /> Sale Events
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {active ? (
          <div className="rounded-lg border border-success/40 bg-success/10 p-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Active sale</p>
              <p className="font-bold">{active.name}</p>
              <p className="text-xs text-muted-foreground">
                {active.transaction_count} sales · {Math.round(active.total_xp)} XP awarded
              </p>
            </div>
            <Button onClick={handleEnd} variant="destructive" disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <StopCircle className="w-4 h-4 mr-2" />}
              End sale & reset leaderboard
            </Button>
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
                    className="flex items-center justify-between text-sm border border-border rounded-md p-2 bg-background/40"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(s.started_at).toLocaleDateString()} →{" "}
                        {s.ended_at ? new Date(s.ended_at).toLocaleDateString() : "—"}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground text-right shrink-0 ml-3">
                      {s.transaction_count} sales · {Math.round(s.total_xp)} XP
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
