import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Eye, Users, Clock, CalendarDays, Smartphone, Chrome, MonitorSmartphone, Link2, FileText } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { format } from "date-fns";

interface Overview {
  total_visits: number;
  unique_visitors: number;
  avg_duration_seconds: number;
  visits_today: number;
  visits_last_7_days: number;
}

interface Row {
  label: string;
  visits: number;
}

const DAY_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
] as const;

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function StatTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="gradient-card-bg border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1.5">
          {icon}
          <span>{label}</span>
        </div>
        <p className="text-2xl font-black tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function BreakdownCard({ title, icon, rows, emptyLabel }: { title: string; icon: React.ReactNode; rows: Row[]; emptyLabel: string }) {
  const max = Math.max(...rows.map((r) => r.visits), 1);
  return (
    <Card className="gradient-card-bg border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          rows.map((r) => (
            <div key={r.label} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{r.label}</span>
                <span className="font-semibold tabular-nums shrink-0">{r.visits}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(r.visits / max) * 100}%` }} />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

const chartConfig: ChartConfig = {
  visits: { label: "Visits", color: "hsl(var(--primary))" },
};

export function AnalyticsDashboard() {
  const [days, setDays] = useState("30");
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [deviceRows, setDeviceRows] = useState<Row[]>([]);
  const [browserRows, setBrowserRows] = useState<Row[]>([]);
  const [osRows, setOsRows] = useState<Row[]>([]);
  const [pageRows, setPageRows] = useState<Row[]>([]);
  const [referrerRows, setReferrerRows] = useState<Row[]>([]);
  const [dailyRows, setDailyRows] = useState<{ visit_date: string; visits: number }[]>([]);

  useEffect(() => {
    let mounted = true;
    const _days = Number(days);

    const load = async () => {
      setLoading(true);
      const [ov, dev, br, os, daily, pages, refs] = await Promise.all([
        supabase.rpc("get_visitor_overview", { _days }),
        supabase.rpc("get_device_breakdown", { _days }),
        supabase.rpc("get_browser_breakdown", { _days }),
        supabase.rpc("get_os_breakdown", { _days }),
        supabase.rpc("get_daily_visits", { _days }),
        supabase.rpc("get_top_entry_pages", { _days }),
        supabase.rpc("get_referrer_breakdown", { _days }),
      ]);
      if (!mounted) return;

      if (ov.error) console.error("Error fetching visitor overview:", ov.error);
      else if (ov.data?.[0]) setOverview(ov.data[0]);

      if (dev.data) setDeviceRows(dev.data.map((d: { device_type: string; visits: number }) => ({ label: d.device_type, visits: d.visits })));
      if (br.data) setBrowserRows(br.data.map((d: { browser: string; visits: number }) => ({ label: d.browser, visits: d.visits })));
      if (os.data) setOsRows(os.data.map((d: { os: string; visits: number }) => ({ label: d.os, visits: d.visits })));
      if (pages.data) setPageRows(pages.data.map((d: { entry_path: string; visits: number }) => ({ label: d.entry_path, visits: d.visits })));
      if (refs.data) setReferrerRows(refs.data.map((d: { referrer: string; visits: number }) => ({ label: d.referrer, visits: d.visits })));
      if (daily.data) setDailyRows(daily.data);

      setLoading(false);
    };

    load();
    return () => {
      mounted = false;
    };
  }, [days]);

  if (loading && !overview) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Site Statistics</h2>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DAY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile label="Total visits" value={formatCompact(overview?.total_visits ?? 0)} icon={<Eye className="w-3.5 h-3.5" />} />
        <StatTile label="Unique visitors" value={formatCompact(overview?.unique_visitors ?? 0)} icon={<Users className="w-3.5 h-3.5" />} />
        <StatTile label="Avg. time on site" value={formatDuration(overview?.avg_duration_seconds ?? 0)} icon={<Clock className="w-3.5 h-3.5" />} />
        <StatTile label="Visits today" value={formatCompact(overview?.visits_today ?? 0)} icon={<CalendarDays className="w-3.5 h-3.5" />} />
        <StatTile label="Visits (7d)" value={formatCompact(overview?.visits_last_7_days ?? 0)} icon={<CalendarDays className="w-3.5 h-3.5" />} />
      </div>

      <Card className="gradient-card-bg border-border">
        <CardHeader>
          <CardTitle className="text-base">Visits over time</CardTitle>
        </CardHeader>
        <CardContent>
          {dailyRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No visit data yet.</p>
          ) : (
            <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
              <AreaChart data={dailyRows} margin={{ left: -12, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                <XAxis
                  dataKey="visit_date"
                  tickFormatter={(v: string) => format(new Date(v), "MMM d")}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                />
                <YAxis tickLine={false} axisLine={false} tickMargin={4} allowDecimals={false} width={32} />
                <ChartTooltip
                  cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                  content={<ChartTooltipContent labelFormatter={(v) => format(new Date(v as string), "MMM d, yyyy")} />}
                />
                <Area type="monotone" dataKey="visits" stroke="hsl(var(--primary))" strokeWidth={2} fill="hsl(var(--primary))" fillOpacity={0.12} />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <BreakdownCard title="Device Type" icon={<MonitorSmartphone className="w-4 h-4 text-primary" />} rows={deviceRows} emptyLabel="No device data yet." />
        <BreakdownCard title="Browser" icon={<Chrome className="w-4 h-4 text-primary" />} rows={browserRows} emptyLabel="No browser data yet." />
        <BreakdownCard title="Operating System" icon={<Smartphone className="w-4 h-4 text-primary" />} rows={osRows} emptyLabel="No OS data yet." />
        <BreakdownCard title="Referral Source" icon={<Link2 className="w-4 h-4 text-primary" />} rows={referrerRows} emptyLabel="No referrer data yet." />
        <BreakdownCard title="Top Entry Pages" icon={<FileText className="w-4 h-4 text-primary" />} rows={pageRows} emptyLabel="No page data yet." />
      </div>
    </div>
  );
}
