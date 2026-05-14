import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Crown, Medal, Award, Zap, ChevronLeft, Gift } from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { CURRENCY, SELLER_NAME } from "@/config";

type Row = { buyer_name: string; xp: number; purchases: number };
type Prize = {
  prize_rank_1_text: string | null;
  prize_rank_1_image_url: string | null;
};

const monthLabel = new Date().toLocaleString(undefined, { month: "long", year: "numeric" });

const rankIcon = (rank: number) => {
  if (rank === 1) return <Crown className="w-5 h-5 text-primary" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-muted-foreground" />;
  if (rank === 3) return <Award className="w-5 h-5 text-accent" />;
  return <span className="text-sm font-bold text-muted-foreground w-5 text-center">{rank}</span>;
};

const Leaderboard = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [prize, setPrize] = useState<Prize | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [{ data: lbData, error: lbErr }, { data: settingsData }] = await Promise.all([
        supabase.rpc("get_monthly_leaderboard"),
        supabase
          .from("app_settings")
          .select("prize_rank_1_text, prize_rank_1_image_url")
          .eq("id", 1)
          .maybeSingle(),
      ]);
      if (lbErr) console.error(lbErr);
      if (mounted) {
        setRows((lbData as Row[] | null) ?? []);
        setPrize((settingsData as Prize | null) ?? null);
        setLoading(false);
      }
    })();

    const ch = supabase
      .channel("leaderboard-tx")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transactions" },
        async () => {
          const { data } = await supabase.rpc("get_monthly_leaderboard");
          if (mounted) setRows((data as Row[] | null) ?? []);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, []);

  const top = rows[0];

  return (
    <div className="min-h-screen pb-12">
      <header className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 gradient-hero opacity-30" />
        <div className="relative container py-6 md:py-10">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
            <ChevronLeft className="w-4 h-4" /> Back to sale
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl gradient-gold flex items-center justify-center shadow-glow">
              <Trophy className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl md:text-4xl font-black">Trainer Leaderboard</h1>
              <p className="text-sm text-muted-foreground">
                {SELLER_NAME} • {monthLabel} • 1 XP per {CURRENCY}1 spent
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 grid lg:grid-cols-3 gap-6">
        {/* Prize panel */}
        <Card className="gradient-card-bg border-border lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-primary" /> This Month's Prize
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {prize?.prize_rank_1_image_url ? (
              <div className="aspect-video w-full rounded-lg overflow-hidden border border-border bg-muted">
                <img
                  src={prize.prize_rank_1_image_url}
                  alt="Monthly top trainer prize"
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="aspect-video w-full rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground">
                <AppLogo className="w-10 h-10 opacity-40" alt="" />
              </div>
            )}
            <p className="text-sm whitespace-pre-line">
              {prize?.prize_rank_1_text ||
                "The top spending trainer of the month wins an exclusive prize. Keep claiming to climb the ranks!"}
            </p>
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
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Trophy className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>No purchases yet this month. Be the first to claim the crown!</p>
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
    </div>
  );
};

export default Leaderboard;