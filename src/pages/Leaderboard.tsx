import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Crown, Medal, Award, Zap, ChevronLeft, Gift } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AppLogo from "@/components/AppLogo";
import { CURRENCY, SELLER_NAME } from "@/config";
import MediaCarouselDialog from "@/components/MediaCarouselDialog";

type Row = { buyer_name: string; xp: number; purchases: number };
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

const monthLabel = new Date().toLocaleString(undefined, { month: "long", year: "numeric" });
const MONTHLY = "__monthly__";

const rankIcon = (rank: number) => {
  if (rank === 1) return <Crown className="w-5 h-5 text-primary" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-muted-foreground" />;
  if (rank === 3) return <Award className="w-5 h-5 text-accent" />;
  return <span className="text-sm font-bold text-muted-foreground w-5 text-center">{rank}</span>;
};

const Leaderboard = () => {
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [view, setView] = useState<string>(""); // sale id or MONTHLY
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [isPrizeImageCarouselOpen, setIsPrizeImageCarouselOpen] = useState(false);

  // Bootstrap: load sales + prize, pick default view
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: salesData } = await supabase.rpc("list_sales");
      if (!mounted) return;
      const list = ((salesData ?? []) as any[]).map((r) => ({
        ...r,
        transaction_count: Number(r.transaction_count),
        total_xp: Number(r.total_xp),
      })) as SaleRow[];
      setSales(list);

      // Default: active sale → most recent past sale → monthly
      const active = list.find((s) => !s.ended_at);
      const fallback = list[0];
      setView(active?.id ?? fallback?.id ?? MONTHLY);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Load rows whenever view changes
  useEffect(() => {
    if (!view) return;
    let mounted = true;
    setRowsLoading(true);
    (async () => {
      const { data, error } =
        view === MONTHLY
          ? await supabase.rpc("get_monthly_leaderboard")
          : await supabase.rpc("get_sale_leaderboard", { _sale_id: view });
      if (error) console.error(error);
      if (mounted) {
        setRows((data as Row[] | null) ?? []);
        setRowsLoading(false);
      }
    })();

    const ch = supabase
      .channel(`leaderboard-tx-${view}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transactions" },
        async () => {
          const { data } =
            view === MONTHLY
              ? await supabase.rpc("get_monthly_leaderboard")
              : await supabase.rpc("get_sale_leaderboard", { _sale_id: view });
          if (mounted) setRows((data as Row[] | null) ?? []);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [view]);

  const top = rows[0];
  const activeSale = sales.find((s) => !s.ended_at) ?? null;
  const currentSale = view === MONTHLY ? null : sales.find((s) => s.id === view) ?? null;
  const isMonthly = view === MONTHLY;
  const prizeText = currentSale?.prize_text ?? null;
  const prizeImageUrl = currentSale?.prize_image_url ?? null;
  const hasPrize = Boolean(prizeText || prizeImageUrl);

  const subtitle = useMemo(() => {
    if (view === MONTHLY) return `${monthLabel} · monthly`;
    const s = sales.find((x) => x.id === view);
    if (!s) return "";
    return s.ended_at ? `${s.name} · ended ${new Date(s.ended_at).toLocaleDateString()}` : `${s.name} · live now`;
  }, [view, sales]);

  return (
    <div className="min-h-screen pb-12">
      <header className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 gradient-hero opacity-30" />
        <div className="relative container py-6 md:py-10">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
          >
            <ChevronLeft className="w-4 h-4" /> Back to sale
          </Link>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl gradient-gold flex items-center justify-center shadow-glow">
              <Trophy className="w-6 h-6 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl md:text-4xl font-black">Trainer Leaderboard</h1>
              <p className="text-sm text-muted-foreground truncate">
                {SELLER_NAME} • {subtitle || "loading…"} • 1 XP per {CURRENCY}1 spent
              </p>
            </div>
            {!loading && (
              <Select value={view} onValueChange={setView}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Choose leaderboard" />
                </SelectTrigger>
                <SelectContent>
                  {activeSale && (
                    <SelectItem value={activeSale.id}>
                      🔴 {activeSale.name} (live)
                    </SelectItem>
                  )}
                  <SelectItem value={MONTHLY}>📅 This month ({monthLabel})</SelectItem>
                  {sales
                    .filter((s) => s.ended_at)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} · {new Date(s.started_at).toLocaleDateString()}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </header>

      <main className="container py-6 grid lg:grid-cols-3 gap-6">
        {/* Prize panel */}
        <Card className="gradient-card-bg border-border lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-primary" /> Top Trainer Prize
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isMonthly ? (
              <div className="aspect-video w-full rounded-lg border border-dashed border-border flex flex-col items-center justify-center text-center text-muted-foreground p-4 gap-2">
                <AppLogo className="w-8 h-8 opacity-40" alt="" />
                <p className="text-sm font-semibold">Monthly view has no prize</p>
                <p className="text-xs">
                  Prizes are tied to individual sale events. Pick an active or past sale to see its prize.
                </p>
              </div>
            ) : prizeImageUrl ? (
              <div
                className="aspect-video w-full rounded-lg overflow-hidden border border-border bg-muted cursor-pointer"
                onClick={() => setIsPrizeImageCarouselOpen(true)}
              >
                <img
                  src={prizeImageUrl}
                  alt={`${currentSale?.name ?? "Sale"} prize`}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="aspect-video w-full rounded-lg border border-dashed border-border flex flex-col items-center justify-center text-center text-muted-foreground p-4 gap-2">
                <AppLogo className="w-8 h-8 opacity-40" alt="" />
                <p className="text-sm font-semibold">Prize coming soon</p>
                <p className="text-xs">
                  The prize for {currentSale?.name ?? "this sale"} hasn't been announced yet — stay tuned!
                </p>
              </div>
            )}
            {!isMonthly && prizeText && (
              <p className="text-sm whitespace-pre-line">{prizeText}</p>
            )}
            {!isMonthly && !hasPrize && (
              <p className="text-xs text-muted-foreground italic">
                No prize details posted for this sale yet.
              </p>
            )}
            {top && (
              <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Current leader</p>
                <p className="font-bold text-primary">{top.buyer_name}</p>
                <p className="text-xs text-muted-foreground">
                  {Math.round(Number(top.xp))} XP • {top.purchases} card{top.purchases === 1 ? "" : "s"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rankings */}
        <Card className="gradient-card-bg border-border lg:col-span-2">
          <CardHeader>
            <CardTitle>Top Trainers</CardTitle>
          </CardHeader>
          <CardContent>
            {rowsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Trophy className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>No purchases here yet. Be the first to claim the crown!</p>
              </div>
            ) : (
              <ol className="space-y-2">
                {rows.map((r, i) => {
                  const rank = i + 1;
                  const isPodium = rank <= 3;
                  return (
                    <li
                      key={`${r.buyer_name}-${i}`}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${
                        rank === 1
                          ? "border-primary/40 bg-primary/10"
                          : isPodium
                            ? "border-border bg-muted/40"
                            : "border-border bg-background/40"
                      }`}
                    >
                      <div className="w-7 flex justify-center">{rankIcon(rank)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{r.buyer_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.purchases} card{r.purchases === 1 ? "" : "s"} purchased
                        </p>
                      </div>
                      <div className="flex items-center gap-1 font-black text-primary">
                        <Zap className="w-4 h-4" />
                        {Math.round(Number(r.xp)).toLocaleString()}
                        <span className="text-xs font-semibold text-muted-foreground ml-1">XP</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </main>

      {!isMonthly && prizeImageUrl && (
        <MediaCarouselDialog
          open={isPrizeImageCarouselOpen}
          onOpenChange={setIsPrizeImageCarouselOpen}
          mediaUrls={[prizeImageUrl]}
          initialIndex={0}
        />
      )}
    </div>
  );
};

export default Leaderboard;
