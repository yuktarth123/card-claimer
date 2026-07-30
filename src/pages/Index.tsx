import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { NameGate } from "@/components/NameGate";
import { useBuyer } from "@/hooks/useBuyer";
import { toast } from "sonner";
import { Zap, Trophy, PackageOpen } from "lucide-react";
import CountdownTimer from "@/components/CountdownTimer";
import { CURRENCY, SELLER_NAME } from "@/config";
import AppLogo from "@/components/AppLogo";
import PromoBar from "@/components/PromoBar";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/categoryMeta";

// Only the columns needed to compute per-category stock counts and the
// aggregate "Total Listed" value -- the hub is a navigation landing page,
// not a product grid, so it never needs images/media/description columns.
type CountRow = Pick<Database["public"]["Tables"]["cards"]["Row"], "item_type" | "quantity_available" | "price">;

const Index = () => {
  const { name, phone, setName, setIdentity } = useBuyer();
  const [rows, setRows] = useState<CountRow[]>([]);
  const [isSaleLive, setIsSaleLive] = useState(false);
  const [saleStartTime, setSaleStartTime] = useState<string | null>(null);

  const fetchCounts = async () => {
    const { data, error } = await supabase.from("cards").select("item_type, quantity_available, price");
    if (data) setRows(data);
    if (error) console.error("Error fetching listing counts:", error);
  };

  useEffect(() => {
    let mounted = true;

    const fetchInitialData = async () => {
      await fetchCounts();

      const { data: settingsData, error: settingsError } = await supabase
        .from("app_settings")
        .select("sale_start_time")
        .eq("id", 1)
        .single();

      if (mounted) {
        if (settingsError && settingsError.code !== "PGRST116") {
          console.error("Error fetching app settings:", settingsError);
          toast.error("Failed to load sale settings.");
        } else if (settingsData?.sale_start_time) {
          setSaleStartTime(settingsData.sale_start_time);
          setIsSaleLive(new Date() >= new Date(settingsData.sale_start_time));
        } else {
          setSaleStartTime(null);
          setIsSaleLive(false);
        }
      }
    };

    fetchInitialData();

    // Counts are cheap to refetch outright on any change rather than
    // patching the row list incrementally -- this query only pulls 3 columns.
    const cardsChannel = supabase
      .channel("hub-cards-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "cards" }, () => {
        fetchCounts();
      })
      .subscribe();

    const settingsChannel = supabase
      .channel("hub-settings-changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "app_settings", filter: "id=eq.1" },
        (payload) => {
          const newSaleStartTime = (payload.new as Database["public"]["Tables"]["app_settings"]["Row"]).sale_start_time;
          setSaleStartTime(newSaleStartTime);
          setIsSaleLive(newSaleStartTime ? new Date() >= new Date(newSaleStartTime) : false);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(cardsChannel);
      supabase.removeChannel(settingsChannel);
    };
  }, []);

  const countsByType = useMemo(() => {
    const map: Record<string, { available: number; total: number }> = {};
    for (const r of rows) {
      if (!map[r.item_type]) map[r.item_type] = { available: 0, total: 0 };
      map[r.item_type].total += 1;
      if (r.quantity_available > 0) map[r.item_type].available += 1;
    }
    return map;
  }, [rows]);

  const availableCount = useMemo(() => rows.filter((r) => r.quantity_available > 0).length, [rows]);
  const totalListedValue = useMemo(
    () => rows.reduce((sum, r) => sum + Number(r.price) * r.quantity_available, 0),
    [rows]
  );

  return (
    <div className="min-h-screen pb-16">
      <NameGate
        open={!name || !phone}
        initialName={name}
        onSubmit={(n, p) => {
          const wasReturning = Boolean(name);
          setIdentity(n, p);
          toast.success(wasReturning ? `Thanks, ${n}!` : `Welcome, ${n}! 👋`, {
            description: isSaleLive ? "The sale is live — start claiming!" : "Get ready, the sale starts soon.",
          });
        }}
      />
      <PwaInstallBanner />

      {/* Hero */}
      <header className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 gradient-hero opacity-30" />
        <div className="relative container py-8 md:py-12">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center shadow-glow shrink-0">
              <AppLogo className="w-full h-full" alt={`${SELLER_NAME} Logo`} />
            </div>
            <span className="font-display font-bold tracking-wide text-base uppercase text-foreground">
              {SELLER_NAME}
            </span>
            <Link
              to="/breaks"
              className="sm:ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/30 text-sm font-semibold text-primary hover:bg-primary/25 transition"
            >
              <PackageOpen className="w-4 h-4" /> Box Breaks
            </Link>
            <Link
              to="/leaderboard"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/30 text-sm font-semibold text-primary hover:bg-primary/25 transition"
            >
              <Trophy className="w-4 h-4" /> Leaderboard
            </Link>
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-balance">
            Pokémon Cards <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Live Sale</span>
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            {isSaleLive
              ? "Claim as many units as you want — first come, first served while stock lasts."
              : "Get ready! Preview the cards now, the live sale starts soon."}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-5">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/15 border border-success/30">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-sm font-semibold text-success">{availableCount} listings in stock</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/30">
              <span className="text-sm font-semibold text-primary">Total Listed: {CURRENCY}{totalListedValue.toFixed(0)}</span>
            </div>
            {!isSaleLive && saleStartTime && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/30">
                <CountdownTimer targetDate={saleStartTime} onCountdownEnd={() => setIsSaleLive(true)} className="text-primary" />
              </div>
            )}
            {!isSaleLive && !saleStartTime && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/15 border border-primary/30">
                <span className="text-sm font-semibold text-primary">Sale time not set yet!</span>
              </div>
            )}
            {name && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="text-sm">Trainer: <strong>{name}</strong></span>
                <button onClick={() => setName("")} className="text-xs text-muted-foreground hover:text-foreground underline ml-1">change</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container py-6">
        <PromoBar className="mb-6" />

        <h2 className="text-lg font-bold mb-3">Shop by category</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {CATEGORY_ORDER.map((itemType) => {
            const meta = CATEGORY_META[itemType];
            const counts = countsByType[itemType] ?? { available: 0, total: 0 };
            return (
              <Link
                key={itemType}
                to={meta.route}
                className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 hover:border-primary/50 hover:shadow-glow transition"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center group-hover:bg-primary/25 transition">
                  <meta.icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-display font-bold text-lg">{meta.label}</p>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{meta.description}</p>
                </div>
                <div className="mt-auto flex items-center gap-2 pt-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/15 border border-success/30 text-xs font-semibold text-success">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                    {counts.available} in stock
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default Index;
