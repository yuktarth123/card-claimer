import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner"; // Import toast for notifications

interface AppSettings {
  isHotSaleActive: boolean;
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>({ isHotSaleActive: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let channel: any = null;

    const fetchSettings = async () => {
      const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
      if (mounted) {
        if (error) {
          console.error("Error fetching app settings:", error);
          toast.error("Failed to load app settings."); // Notify user of fetch error
          setSettings({ isHotSaleActive: false });
        } else if (data) {
          setSettings({ isHotSaleActive: data.is_hot_sale_active });
        }
        setLoading(false);
      }
    };

    fetchSettings();

    const setupRealtimeChannel = async () => {
      const existingChannel = supabase.getChannels().find(c => c.topic === "realtime:app-settings-changes");
      if (existingChannel) {
        await supabase.removeChannel(existingChannel);
      }

      channel = supabase
        .channel("app-settings-changes")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "settings", filter: "id=eq.1" },
          (payload) => {
            if (mounted) {
              setSettings({ isHotSaleActive: (payload.new as { is_hot_sale_active: boolean }).is_hot_sale_active });
              toast.info("Hot Sale status updated by another admin."); // Notify if changed externally
            }
          }
        )
        .subscribe();
    };

    setupRealtimeChannel();

    return () => {
      mounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const updateHotSaleStatus = async (isActive: boolean) => {
    setLoading(true);
    const { error } = await supabase.rpc("update_hot_sale_status", { _is_active: isActive });
    if (error) {
      console.error("Error updating hot sale status:", error);
      toast.error("Failed to update Hot Sale status."); // Notify user of update error
      // Revert the UI state if the update failed
      setSettings((prev) => ({ ...prev, isHotSaleActive: !isActive }));
    } else {
      toast.success(`Hot Sale ${isActive ? "activated" : "deactivated"}!`); // Notify user of success
      setSettings((prev) => ({ ...prev, isHotSaleActive: isActive })); // Update state directly
    }
    setLoading(false);
  };

  return { settings, loading, updateHotSaleStatus };
}