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

    console.log("useAppSettings: Effect mounted, initial loading state:", loading);

    const fetchSettings = async () => {
      console.log("useAppSettings: Initiating fetchSettings...");
      setLoading(true); // Ensure loading is true during fetch
      const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
      if (mounted) {
        if (error) {
          console.error("useAppSettings: Error fetching app settings:", error);
          toast.error("Failed to load app settings.");
          setSettings({ isHotSaleActive: false });
        } else if (data) {
          console.log("useAppSettings: Settings fetched successfully:", data);
          setSettings({ isHotSaleActive: data.is_hot_sale_active });
        }
        setLoading(false);
        console.log("useAppSettings: Initial fetch complete, loading set to false.");
      }
    };

    fetchSettings();

    const setupRealtimeChannel = async () => {
      console.log("useAppSettings: Setting up realtime channel...");
      const existingChannel = supabase.getChannels().find(c => c.topic === "realtime:app-settings-changes");
      if (existingChannel) {
        console.log("useAppSettings: Removing existing realtime channel.");
        await supabase.removeChannel(existingChannel);
      }

      channel = supabase
        .channel("app-settings-changes")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "settings", filter: "id=eq.1" },
          (payload) => {
            if (mounted) {
              const newStatus = (payload.new as { is_hot_sale_active: boolean }).is_hot_sale_active;
              console.log("useAppSettings: Realtime update received, new status:", newStatus);
              setSettings({ isHotSaleActive: newStatus });
              toast.info("Hot Sale status updated by another admin.");
            }
          }
        )
        .subscribe();
      console.log("useAppSettings: Realtime channel subscribed.");
    };

    setupRealtimeChannel();

    return () => {
      mounted = false;
      if (channel) {
        console.log("useAppSettings: Cleaning up realtime channel on unmount.");
        supabase.removeChannel(channel);
      }
      console.log("useAppSettings: Effect unmounted.");
    };
  }, []);

  const updateHotSaleStatus = async (isActive: boolean) => {
    console.log("useAppSettings: Attempting to update hot sale status to:", isActive);
    setLoading(true);
    const { error } = await supabase.rpc("update_hot_sale_status", { _is_active: isActive });
    if (error) {
      console.error("useAppSettings: Error updating hot sale status via RPC:", error);
      toast.error("Failed to update Hot Sale status.");
      // Revert the UI state if the update failed
      setSettings((prev) => ({ ...prev, isHotSaleActive: !isActive }));
    } else {
      console.log("useAppSettings: Hot sale status updated successfully via RPC to:", isActive);
      toast.success(`Hot Sale ${isActive ? "activated" : "deactivated"}!`);
      setSettings((prev) => ({ ...prev, isHotSaleActive: isActive })); // Update state directly
    }
    setLoading(false);
    console.log("useAppSettings: updateHotSaleStatus complete, loading set to false.");
  };

  return { settings, loading, updateHotSaleStatus };
}