import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CalendarIcon, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, setHours, setMinutes, setSeconds } from "date-fns";
import { toZonedTime, toUtc } from 'date-fns-tz'; // Corrected: Both are named exports from main package

const IST_TIMEZONE = 'Asia/Kolkata'; // Indian Standard Time

export function SaleTimeManager() {
  const [saleStartTime, setSaleStartTime] = useState<Date | undefined>(undefined);
  const [timeInput, setTimeInput] = useState("00:00");
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSaleStartTime();
  }, []);

  const fetchSaleStartTime = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("app_settings")
      .select("sale_start_time")
      .eq("id", 1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found, which is fine for initial setup
      console.error("Error fetching sale start time:", error);
      toast.error("Failed to load sale start time.");
    } else if (data?.sale_start_time) {
      // Convert UTC time from Supabase to IST for display
      const utcDate = parseISO(data.sale_start_time);
      const istDate = toZonedTime(utcDate, IST_TIMEZONE);
      setSaleStartTime(istDate);
      setTimeInput(format(istDate, "HH:mm"));
    } else {
      // If no time is set, default to current date in IST
      const nowInIST = toZonedTime(new Date(), IST_TIMEZONE);
      setSaleStartTime(nowInIST);
      setTimeInput(format(nowInIST, "HH:mm"));
    }
    setLoading(false);
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) {
      setSaleStartTime(undefined);
      return;
    }
    // Preserve time when changing date
    const currentSaleTime = saleStartTime || toZonedTime(new Date(), IST_TIMEZONE);
    const newDateWithTime = setSeconds(setMinutes(setHours(date, currentSaleTime.getHours()), currentSaleTime.getMinutes()), 0);
    setSaleStartTime(newDateWithTime);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    setTimeInput(newTime);
    const [hours, minutes] = newTime.split(":").map(Number);

    if (saleStartTime && !isNaN(hours) && !isNaN(minutes)) {
      const newDateWithTime = setSeconds(setMinutes(setHours(saleStartTime, hours), minutes), 0);
      setSaleStartTime(newDateWithTime);
    }
  };

  const saveSaleStartTime = async () => {
    if (!saleStartTime) {
      toast.error("Please select a date and time.");
      return;
    }

    setIsSaving(true);
    // Convert IST date to UTC for Supabase storage
    const utcTimestamp = toUtc(saleStartTime, { timeZone: IST_TIMEZONE }).toISOString();

    const { error } = await supabase
      .from("app_settings")
      .upsert({ id: 1, sale_start_time: utcTimestamp }, { onConflict: "id" });

    if (error) {
      console.error("Error saving sale start time:", error);
      toast.error("Failed to save sale start time.");
    } else {
      toast.success("Sale start time updated!");
    }
    setIsSaving(false);
  };

  return (
    <div className="space-y-4">
      <Label htmlFor="sale-start-time">Sale Start Time (IST)</Label>
      {loading ? (
        <div className="flex items-center justify-center h-24">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !saleStartTime && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {saleStartTime ? format(saleStartTime, "PPP") : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={saleStartTime}
                onSelect={handleDateSelect}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <div className="relative w-full sm:w-auto">
            <Input
              id="sale-start-time"
              type="time"
              value={timeInput}
              onChange={(e) => handleTimeChange(e)}
              className="pl-9"
            />
            <Clock className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>
          <Button onClick={saveSaleStartTime} disabled={isSaving || !saleStartTime} className="w-full sm:w-auto">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save
          </Button>
        </div>
      )}
      {saleStartTime && (
        <p className="text-sm text-muted-foreground">
          Current sale start: {format(saleStartTime, "PPP 'at' HH:mm (O)")}
        </p>
      )}
    </div>
  );
}