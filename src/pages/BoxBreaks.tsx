import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import AppLogo from "@/components/AppLogo";
import { ChevronLeft, Package, Loader2 } from "lucide-react";
import { CURRENCY, SELLER_NAME } from "@/config";

type BoxBreak = Database["public"]["Tables"]["box_breaks"]["Row"];

const statusOrder: Record<string, number> = { live: 0, upcoming: 1, ended: 2 };
const statusLabel: Record<string, string> = { upcoming: "Starting Soon", live: "🔴 Live Now", ended: "Ended" };

const BoxBreaks = () => {
  const [breaks, setBreaks] = useState<BoxBreak[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase
      .from("box_breaks")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error("Error fetching breaks:", error);
        if (mounted && data) setBreaks(data);
        if (mounted) setLoading(false);
      });

    const channel = supabase
      .channel("box-breaks-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "box_breaks" }, () => {
        supabase
          .from("box_breaks")
          .select("*")
          .order("created_at", { ascending: false })
          .then(({ data }) => data && mounted && setBreaks(data));
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const sorted = [...breaks].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  return (
    <div className="min-h-screen pb-12">
      <header className="border-b border-border">
        <div className="container py-5 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" /> Back
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-gold flex items-center justify-center shadow-glow">
              <AppLogo className="w-full h-full" alt={`${SELLER_NAME} Logo`} />
            </div>
            <span className="font-display font-bold text-sm uppercase">{SELLER_NAME}</span>
          </div>
        </div>
      </header>

      <main className="container py-8">
        <h1 className="text-3xl font-black mb-1">Box Breaks</h1>
        <p className="text-muted-foreground mb-6">Watch live, pick your slots, and see what you pull.</p>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-lg">No breaks scheduled yet. Check back soon!</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((b) => (
              <Link
                key={b.id}
                to={`/breaks/${b.id}`}
                className="group rounded-2xl overflow-hidden border border-border gradient-card-bg shadow-card-pop transition-all hover:ring-2 hover:ring-primary"
              >
                <div className="aspect-video w-full bg-muted overflow-hidden relative">
                  {b.image_url ? (
                    <img src={b.image_url} alt={b.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Package className="w-8 h-8" />
                    </div>
                  )}
                  <Badge
                    className={
                      "absolute top-2 right-2 border-0 shadow-md " +
                      (b.status === "live"
                        ? "bg-success text-success-foreground animate-pulse"
                        : b.status === "ended"
                          ? "bg-muted-foreground/80 text-background"
                          : "bg-primary/90 text-primary-foreground")
                    }
                  >
                    {statusLabel[b.status]}
                  </Badge>
                </div>
                <div className="p-3">
                  <h3 className="font-bold truncate">{b.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {b.total_slots} slots · {CURRENCY}{Number(b.price_per_slot).toFixed(0)} each
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default BoxBreaks;
