import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AppSettings {
  isHotSaleActive: boolean;
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>({ isHotSaleActive: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchSettings = async () => {
      const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
      if (mounted) {
        if (error) {
          console.error("Error fetching app settings:", error);
          setSettings({ isHotSaleActive: false });
        } else if (data) {
          setSettings({ isHotSaleActive: data.is_hot_sale_active });
        }
        setLoading(false);
      }
    };

    fetchSettings();

    const channel = supabase
      .channel("app-settings-changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "settings", filter: "id=eq.1" },
        (payload) => {
          if (mounted) {
            setSettings({ isHotSaleActive: (payload.new as { is_hot_sale_active: boolean }).is_hot_sale_active });
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const updateHotSaleStatus = async (isActive: boolean) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("update_hot_sale_status", { _is_active: isActive });
    if (error) {
      console.error("Error updating hot sale status:", error);
      // Optionally revert UI state or show error toast
    } else if (data) {
      setSettings({ isHotSaleActive: data.is_hot_sale_active });
    }
    setLoading(false);
  };

  return { settings, loading, updateHotSaleStatus };
}