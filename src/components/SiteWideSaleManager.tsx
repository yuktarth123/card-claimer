import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Percent, StopCircle, Tag } from "lucide-react";

export function SiteWideSaleManager() {
  const [active, setActive] = useState(false);
  const [percent, setPercent] = useState<number | null>(null);
  const [input, setInput] = useState("30");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("site_wide_sale_active, site_wide_sale_percent")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      toast.error("Failed to load site-wide sale settings");
    } else if (data) {
      setActive(!!data.site_wide_sale_active);
      setPercent(data.site_wide_sale_percent ? Number(data.site_wide_sale_percent) : null);
      if (data.site_wide_sale_percent) setInput(String(Number(data.site_wide_sale_percent)));
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleApply = async () => {
    const p = Number(input);
    if (!Number.isFinite(p) || p <= 0 || p >= 100) {
      toast.error("Enter a discount between 1 and 99");
      return;
    }
    if (
      !confirm(
        active
          ? `Update site-wide sale to ${p}% off? All card sale prices will be recalculated.`
          : `Apply ${p}% off to every card? Current sale prices will be backed up and restored when you end the sale.`
      )
    )
      return;
    setBusy(true);
    const { error } = await supabase.rpc("apply_site_wide_sale", { _percent: p });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`Site-wide sale active: ${p}% off everything`);
      refresh();
    }
  };

  const handleEnd = async () => {
    if (!confirm("End site-wide sale and restore original prices?")) return;
    setBusy(true);
    const { error } = await supabase.rpc("end_site_wide_sale");
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Site-wide sale ended. Original prices restored.");
      refresh();
    }
  };

  return (
    <Card className="gradient-card-bg border-border lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-primary" /> Site-wide Sale
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : active ? (
          <div className="rounded-lg border border-success/40 bg-success/10 p-3 space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Active</p>
              <p className="font-bold">{percent}% off every listing</p>
              <p className="text-xs text-muted-foreground">
                Original sale prices are backed up and will be restored when you end the sale.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Update discount (%)</Label>
                <Input
                  type="number"
                  min={1}
                  max={99}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="w-28"
                />
              </div>
              <Button onClick={handleApply} disabled={busy} variant="outline">
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Percent className="w-4 h-4 mr-2" />}
                Update
              </Button>
              <Button onClick={handleEnd} disabled={busy} variant="destructive">
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <StopCircle className="w-4 h-4 mr-2" />}
                End sale & restore prices
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Discount percent</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                max={99}
                placeholder="30"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-32"
              />
              <Button onClick={handleApply} disabled={busy} className="gradient-gold text-primary-foreground font-bold">
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Percent className="w-4 h-4 mr-2" />}
                Apply to all cards
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Sets every card's sale price to <code>price × (1 − %)</code>. Existing per-card sale prices are saved
              and automatically restored when you end the site-wide sale.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}