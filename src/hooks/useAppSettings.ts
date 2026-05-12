import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Database } from "@/integrations/supabase/types"; // Import Database type

const SETTINGS_ID = "00000000-0000-0000-0000-000000000000"; // The fixed ID for the single settings row

type AppSettingsRow = Database["public"]["Tables"]["app_settings"]["Row"];

export function useAppSettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<AppSettingsRow, Error, AppSettingsRow, string[]>({
    queryKey: ["appSettings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", SETTINGS_ID)
        .single();

      if (error) {
        console.error("Error fetching app settings:", error);
        // Return a default state if there's an error, assuming sale is off
        return { id: SETTINGS_ID, is_sale_active: false, updated_at: new Date().toISOString() };
      }
      return data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes // Changed from cacheTime to gcTime
  });

  const updateSaleStatusMutation = useMutation({
    mutationFn: async (isSaleActive: boolean) => {
      const { data, error } = await supabase
        .from("app_settings")
        .update({ is_sale_active: isSaleActive, updated_at: new Date().toISOString() })
        .eq("id", SETTINGS_ID)
        .select()
        .single();

      if (error) {
        throw error;
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["appSettings"] });
      toast.success(`Sale is now ${data.is_sale_active ? "active" : "inactive"}.`);
    },
    onError: (error) => {
      toast.error("Failed to update sale status.");
      console.error("Error updating sale status:", error);
    },
  });

  return {
    isSaleActive: settings?.is_sale_active || false,
    isLoadingSettings: isLoading,
    toggleSale: updateSaleStatusMutation.mutate,
    isUpdatingSale: updateSaleStatusMutation.isPending,
  };
}