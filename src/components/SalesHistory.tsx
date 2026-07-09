import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Receipt, Search, MessageCircle, PackageCheck, Sparkles } from "lucide-react";
import { CURRENCY, SELLER_NAME } from "@/config";
import { buildWhatsAppLink, cn } from "@/lib/utils";
import { format } from "date-fns";
import MediaCarouselDialog from "./MediaCarouselDialog";

type Transaction = Database["public"]["Tables"]["transactions"]["Row"];

interface Order {
  order_id: string;
  buyer_name: string;
  buyer_phone: string | null;
  transaction_date: string;
  sale_id: string | null;
  items: Transaction[];
  total: number;
}

const ALL = "__all__";
const NO_SALE = "__none__";

// Everything checked out together (one WhatsApp finalize, or one manual
// "mark as sold") shares an order_id -- group line items back into orders.
function groupIntoOrders(transactions: Transaction[]): Order[] {
  const map = new Map<string, Order>();
  for (const t of transactions) {
    const existing = map.get(t.order_id);
    if (existing) {
      existing.items.push(t);
      existing.total += Number(t.final_price);
    } else {
      map.set(t.order_id, {
        order_id: t.order_id,
        buyer_name: t.buyer_name,
        buyer_phone: t.buyer_phone,
        transaction_date: t.transaction_date,
        sale_id: t.sale_id,
        items: [t],
        total: Number(t.final_price),
      });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
  );
}

export function SalesHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [sales, setSales] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saleFilter, setSaleFilter] = useState(ALL);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const fetchTransactions = async () => {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("transaction_date", { ascending: false })
      .limit(1000);
    if (error) console.error("Error fetching sales history:", error);
    else if (data) setTransactions(data);
    setLoading(false);
  };

  const fetchSales = async () => {
    const { data, error } = await supabase.rpc("list_sales");
    if (error) console.error("Error fetching sales list:", error);
    else if (data) setSales((data as any[]).map((s) => ({ id: s.id, name: s.name })));
  };

  useEffect(() => {
    fetchTransactions();
    fetchSales();

    const channel = supabase
      .channel("sales-history-transactions")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => {
        fetchTransactions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const saleNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sales) map[s.id] = s.name;
    return map;
  }, [sales]);

  const orders = useMemo(() => groupIntoOrders(transactions), [transactions]);

  const filtered = useMemo(() => {
    let rows = orders;

    if (saleFilter === NO_SALE) rows = rows.filter((o) => !o.sale_id);
    else if (saleFilter !== ALL) rows = rows.filter((o) => o.sale_id === saleFilter);

    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((o) =>
        [o.buyer_name, o.buyer_phone].filter(Boolean).some((f) => f!.toLowerCase().includes(q))
      );
    }

    return rows;
  }, [orders, search, saleFilter]);

  const totalRevenue = useMemo(() => filtered.reduce((sum, o) => sum + o.total, 0), [filtered]);

  const whatsAppLinkFor = (o: Order) => {
    if (!o.buyer_phone) return null;
    const itemSummary = o.items.length === 1 ? o.items[0].card_name : `${o.items.length} items`;
    const message = `Hi ${o.buyer_name}, this is ${SELLER_NAME} regarding your order of ${itemSummary} (${CURRENCY}${o.total.toFixed(0)}).`;
    return buildWhatsAppLink(o.buyer_phone, message);
  };

  return (
    <>
      <Card className="gradient-card-bg border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" /> Sales History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search buyer name or phone…"
                className="pl-9"
              />
            </div>
            {sales.length > 0 && (
              <Select value={saleFilter} onValueChange={setSaleFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Sale event" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All sale events</SelectItem>
                  <SelectItem value={NO_SALE}>No sale event</SelectItem>
                  {sales.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <PackageCheck className="w-3.5 h-3.5 text-primary" />
              {filtered.length} order{filtered.length === 1 ? "" : "s"}
            </span>
            <span className="font-display font-bold text-primary tabular-nums">
              {CURRENCY}{totalRevenue.toFixed(0)} total
            </span>
          </div>

          <div className="space-y-2 max-h-[70vh] overflow-y-auto">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {orders.length === 0 ? "No sales yet." : "No orders match your search."}
              </p>
            ) : (
              filtered.map((o) => {
                const link = whatsAppLinkFor(o);
                const thumb = o.items.find((i) => i.photo_url)?.photo_url;
                return (
                  <div
                    key={o.order_id}
                    className="flex items-center gap-3 p-2 rounded-lg border border-border bg-background/40 cursor-pointer hover:border-primary/50 transition"
                    onClick={() => setSelectedOrder(o)}
                  >
                    <div className="w-10 h-12 flex-shrink-0 rounded overflow-hidden bg-muted flex items-center justify-center">
                      {thumb ? (
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">
                        {o.buyer_name}
                        {o.buyer_phone && <span className="text-muted-foreground font-normal"> • {o.buyer_phone}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {o.items.length} item{o.items.length === 1 ? "" : "s"} — {CURRENCY}{o.total.toFixed(0)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {format(new Date(o.transaction_date), "MMM d, yyyy 'at' h:mm a")}
                        {o.sale_id && saleNameById[o.sale_id] ? ` • ${saleNameById[o.sale_id]}` : ""}
                      </p>
                    </div>
                    {link ? (
                      <Button
                        asChild
                        size="sm"
                        className="bg-success hover:bg-success/90 text-success-foreground flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <a href={link} target="_blank" rel="noopener noreferrer">
                          <MessageCircle className="w-4 h-4 mr-1.5" /> WhatsApp
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground flex-shrink-0">No phone</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle>Order details</DialogTitle>
                <DialogDescription>
                  {format(new Date(selectedOrder.transaction_date), "MMM d, yyyy 'at' h:mm a")}
                  {selectedOrder.sale_id && saleNameById[selectedOrder.sale_id]
                    ? ` • ${saleNameById[selectedOrder.sale_id]}`
                    : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-background/40">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{selectedOrder.buyer_name}</p>
                  {selectedOrder.buyer_phone && (
                    <p className="text-sm text-muted-foreground">{selectedOrder.buyer_phone}</p>
                  )}
                </div>
                {whatsAppLinkFor(selectedOrder) && (
                  <Button asChild size="sm" className="bg-success hover:bg-success/90 text-success-foreground flex-shrink-0">
                    <a href={whatsAppLinkFor(selectedOrder)!} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="w-4 h-4 mr-1.5" /> WhatsApp
                    </a>
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg border border-border">
                    <div
                      className={cn(
                        "w-14 h-20 flex-shrink-0 rounded overflow-hidden bg-muted flex items-center justify-center",
                        item.photo_url && "cursor-pointer"
                      )}
                      onClick={() => item.photo_url && setLightboxUrl(item.photo_url)}
                    >
                      {item.photo_url ? (
                        <img src={item.photo_url} alt={item.card_name} className="w-full h-full object-cover" />
                      ) : (
                        <Sparkles className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{item.card_name}</p>
                      <p className="text-xs text-muted-foreground">Qty {item.quantity}</p>
                    </div>
                    <p className="font-display font-bold text-primary tabular-nums">
                      {CURRENCY}{Number(item.final_price).toFixed(0)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-border">
                <span className="font-semibold">Total</span>
                <span className="font-display text-xl font-bold text-primary tabular-nums">
                  {CURRENCY}{selectedOrder.total.toFixed(0)}
                </span>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <MediaCarouselDialog
        open={!!lightboxUrl}
        onOpenChange={(open) => !open && setLightboxUrl(null)}
        mediaUrls={lightboxUrl ? [lightboxUrl] : []}
      />
    </>
  );
}
