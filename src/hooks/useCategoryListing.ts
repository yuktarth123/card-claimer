import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { useBuyer } from "@/hooks/useBuyer";
import { toast } from "sonner";

type Card = Database["public"]["Tables"]["cards"]["Row"];
type Claim = Database["public"]["Tables"]["claims"]["Row"];
type ItemType = Card["item_type"];

// Data layer shared by every single-category listing page (Singles, Slabs,
// Sealed, Accessories): fetch that category's cards + the buyer's claims,
// keep both live via realtime, sweep expired claims, and expose the
// claim/unclaim RPC calls. Each page still owns its own filter UI/state
// since the facets differ (e.g. Slabs filters by grader/tier, others by
// set/category/rarity/condition).
export function useCategoryListing(itemType: ItemType) {
  const { name, phone, sessionId } = useBuyer();
  const [cards, setCards] = useState<Card[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaleLive, setIsSaleLive] = useState(false);
  const [saleStartTime, setSaleStartTime] = useState<string | null>(null);

  const refetchClaims = async () => {
    if (!sessionId) return;
    const { data, error } = await supabase.rpc("get_my_claims", { _session_id: sessionId });
    if (data) setClaims(data);
    if (error) console.error("Error fetching claims:", error);
  };

  useEffect(() => {
    let mounted = true;

    const fetchInitialData = async () => {
      const { data: cardsData, error: cardsError } = await supabase
        .from("cards")
        .select("*")
        .eq("item_type", itemType)
        .order("created_at", { ascending: false });

      if (mounted && cardsData) setCards(cardsData);
      if (cardsError) console.error(`Error fetching ${itemType} cards:`, cardsError);

      const { data: claimsData, error: claimsError } = await supabase.rpc("get_my_claims", {
        _session_id: sessionId || "",
      });

      if (mounted && claimsData) setClaims(claimsData);
      if (claimsError) console.error("Error fetching claims:", claimsError);

      const { data: settingsData, error: settingsError } = await supabase
        .from("app_settings")
        .select("sale_start_time")
        .eq("id", 1)
        .single();

      if (mounted) {
        if (settingsError && settingsError.code !== "PGRST116") {
          console.error("Error fetching app settings:", settingsError);
          toast.error("Failed to load sale settings.");
        } else if (settingsData?.sale_start_time) {
          setSaleStartTime(settingsData.sale_start_time);
          setIsSaleLive(new Date() >= new Date(settingsData.sale_start_time));
        } else {
          setSaleStartTime(null);
          setIsSaleLive(false);
        }
      }
      setLoading(false);
    };

    if (sessionId) {
      fetchInitialData();
    }

    const cardsChannel = supabase
      .channel(`category-${itemType}-cards-changes`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cards" },
        (payload) => {
          setCards((prev) => {
            if (payload.eventType === "INSERT") {
              const next = payload.new as Card;
              return next.item_type === itemType ? [next, ...prev] : prev;
            }
            if (payload.eventType === "UPDATE") {
              const next = payload.new as Card;
              const exists = prev.some((c) => c.id === next.id);
              if (next.item_type !== itemType) {
                return exists ? prev.filter((c) => c.id !== next.id) : prev;
              }
              return exists ? prev.map((c) => (c.id === next.id ? next : c)) : [next, ...prev];
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((c) => c.id !== (payload.old as Card).id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    // Same rationale as the old per-page implementations: claims SELECT is
    // admin-only via RLS, so an anon realtime subscription on that table
    // would never fire -- refetch explicitly after every claim action instead.

    const settingsChannel = supabase
      .channel(`category-${itemType}-settings-changes`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "app_settings", filter: "id=eq.1" },
        (payload) => {
          const newSaleStartTime = (payload.new as Database["public"]["Tables"]["app_settings"]["Row"]).sale_start_time;
          setSaleStartTime(newSaleStartTime);
          setIsSaleLive(newSaleStartTime ? new Date() >= new Date(newSaleStartTime) : false);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(cardsChannel);
      supabase.removeChannel(settingsChannel);
    };
  }, [sessionId, itemType]);

  // release_expired_claims() only ever runs as a side effect inside
  // claim_units() -- sweep on an interval so abandoned claims free up stock
  // on their own as long as anyone has this category's page open.
  useEffect(() => {
    const sweep = () => {
      supabase.rpc("release_expired_claims").then(({ error }) => {
        if (error) console.error("Error releasing expired claims:", error);
      });
    };
    sweep();
    const interval = setInterval(sweep, 30_000);
    return () => clearInterval(interval);
  }, []);

  const myClaimsByCard = useMemo(() => {
    const map: Record<string, Claim[]> = {};
    for (const claim of claims) {
      if (!map[claim.card_id]) map[claim.card_id] = [];
      map[claim.card_id].push(claim);
    }
    return map;
  }, [claims]);

  const myPendingClaims = useMemo(() => claims.filter((c) => c.status === "claimed"), [claims]);

  const handleClaim = async (card: Card, quantity: number) => {
    if (!isSaleLive) {
      toast.info("The sale hasn't started yet! Stay tuned.");
      return;
    }
    if (!name) return;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(20);
    }
    const { error } = await supabase.rpc("claim_units", {
      _card_id: card.id,
      _buyer_name: name,
      _session_id: sessionId,
      _quantity: quantity,
      _buyer_phone: phone || null,
    });
    if (error) {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.([40, 30, 40]);
      }
      toast.error(error.message?.includes("left in stock") ? error.message : "Too late! Someone beat you to it.");
    } else {
      toast.success(`Claimed ${quantity} × ${card.name}!`, { description: "Open your cart to checkout." });
      await refetchClaims();
    }
  };

  const handleUnclaim = async (claim: Claim, toastIdToDismiss?: string | number) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(10);
    }
    const { error } = await supabase.rpc("release_claim", { _claim_id: claim.id, _session_id: sessionId });
    if (error) {
      toast.error("Couldn't unclaim");
    } else {
      toast("Released");
      if (toastIdToDismiss) toast.dismiss(toastIdToDismiss);
      await refetchClaims();
    }
  };

  return {
    cards,
    claims,
    loading,
    isSaleLive,
    saleStartTime,
    myClaimsByCard,
    myPendingClaims,
    refetchClaims,
    handleClaim,
    handleUnclaim,
  };
}
