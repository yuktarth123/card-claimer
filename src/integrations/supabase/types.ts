export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: number
          monthly_leaderboard_enabled: boolean
          prize_rank_1_image_url: string | null
          prize_rank_1_text: string | null
          prize_rank_2_image_url: string | null
          prize_rank_2_text: string | null
          prize_rank_3_image_url: string | null
          prize_rank_3_text: string | null
          sale_start_time: string | null
          site_wide_sale_active: boolean
          site_wide_sale_percent: number | null
        }
        Insert: {
          id?: number
          monthly_leaderboard_enabled?: boolean
          prize_rank_1_image_url?: string | null
          prize_rank_1_text?: string | null
          prize_rank_2_image_url?: string | null
          prize_rank_2_text?: string | null
          prize_rank_3_image_url?: string | null
          prize_rank_3_text?: string | null
          sale_start_time?: string | null
          site_wide_sale_active?: boolean
          site_wide_sale_percent?: number | null
        }
        Update: {
          id?: number
          monthly_leaderboard_enabled?: boolean
          prize_rank_1_image_url?: string | null
          prize_rank_1_text?: string | null
          prize_rank_2_image_url?: string | null
          prize_rank_2_text?: string | null
          prize_rank_3_image_url?: string | null
          prize_rank_3_text?: string | null
          sale_start_time?: string | null
          site_wide_sale_active?: boolean
          site_wide_sale_percent?: number | null
        }
        Relationships: []
      }
      cards: {
        Row: {
          card_number: string | null
          card_set: string | null
          category: string | null
          condition: string | null
          created_at: string
          id: string
          is_preorder: boolean
          is_vintage: boolean
          item_type: string
          language: string
          name: string
          photo_url: string | null
          photo_urls: string[]
          pre_sale_price: number | null
          price: number
          quantity_available: number
          quantity_total: number
          rarity: string | null
          sale_price: number | null
          tcg_image_url: string | null
          video_url: string | null
        }
        Insert: {
          card_number?: string | null
          card_set?: string | null
          category?: string | null
          condition?: string | null
          created_at?: string
          id?: string
          is_preorder?: boolean
          is_vintage?: boolean
          item_type?: string
          language?: string
          name: string
          photo_url?: string | null
          photo_urls?: string[]
          pre_sale_price?: number | null
          price?: number
          quantity_available?: number
          quantity_total?: number
          rarity?: string | null
          sale_price?: number | null
          tcg_image_url?: string | null
          video_url?: string | null
        }
        Update: {
          card_number?: string | null
          card_set?: string | null
          category?: string | null
          condition?: string | null
          created_at?: string
          id?: string
          is_preorder?: boolean
          is_vintage?: boolean
          item_type?: string
          language?: string
          name?: string
          photo_url?: string | null
          photo_urls?: string[]
          pre_sale_price?: number | null
          price?: number
          quantity_available?: number
          quantity_total?: number
          rarity?: string | null
          sale_price?: number | null
          tcg_image_url?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      claims: {
        Row: {
          buyer_name: string
          buyer_phone: string | null
          buyer_session_id: string
          card_id: string
          claimed_at: string
          created_at: string
          id: string
          quantity: number
          status: string
          unit_price: number
        }
        Insert: {
          buyer_name: string
          buyer_phone?: string | null
          buyer_session_id: string
          card_id: string
          claimed_at?: string
          created_at?: string
          id?: string
          quantity: number
          status?: string
          unit_price: number
        }
        Update: {
          buyer_name?: string
          buyer_phone?: string | null
          buyer_session_id?: string
          card_id?: string
          claimed_at?: string
          created_at?: string
          id?: string
          quantity?: number
          status?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "claims_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          name: string
          prize_image_url: string | null
          prize_text: string | null
          started_at: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          name: string
          prize_image_url?: string | null
          prize_text?: string | null
          started_at?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          name?: string
          prize_image_url?: string | null
          prize_text?: string | null
          started_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          id: number
          is_hot_sale_active: boolean
        }
        Insert: {
          id?: number
          is_hot_sale_active?: boolean
        }
        Update: {
          id?: number
          is_hot_sale_active?: boolean
        }
        Relationships: []
      }
      transactions: {
        Row: {
          buyer_name: string
          buyer_phone: string | null
          buyer_session_id: string | null
          card_name: string
          claim_id: string | null
          final_price: number
          id: string
          order_id: string
          original_card_id: string | null
          photo_url: string | null
          quantity: number
          sale_id: string | null
          transaction_date: string
        }
        Insert: {
          buyer_name: string
          buyer_phone?: string | null
          buyer_session_id?: string | null
          card_name: string
          claim_id?: string | null
          final_price: number
          id?: string
          order_id?: string
          original_card_id?: string | null
          photo_url?: string | null
          quantity?: number
          sale_id?: string | null
          transaction_date?: string
        }
        Update: {
          buyer_name?: string
          buyer_phone?: string | null
          buyer_session_id?: string | null
          card_name?: string
          claim_id?: string | null
          final_price?: number
          id?: string
          order_id?: string
          original_card_id?: string | null
          photo_url?: string | null
          quantity?: number
          sale_id?: string | null
          transaction_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_original_card_id_fkey"
            columns: ["original_card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_release_claim: { Args: { _claim_id: string }; Returns: undefined }
      apply_site_wide_sale: { Args: { _percent: number }; Returns: undefined }
      claim_units: {
        Args: {
          _buyer_name: string
          _buyer_phone?: string
          _card_id: string
          _quantity: number
          _session_id: string
        }
        Returns: {
          buyer_name: string
          buyer_phone: string | null
          buyer_session_id: string
          card_id: string
          claimed_at: string
          created_at: string
          id: string
          quantity: number
          status: string
          unit_price: number
        }
        SetofOptions: {
          from: "*"
          to: "claims"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_my_claims: {
        Args: { _session_id: string }
        Returns: {
          buyer_name: string
          buyer_phone: string | null
          buyer_session_id: string
          card_id: string
          claimed_at: string
          created_at: string
          id: string
          quantity: number
          status: string
          unit_price: number
        }[]
        SetofOptions: {
          from: "*"
          to: "claims"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      end_active_sale: {
        Args: never
        Returns: {
          created_at: string
          ended_at: string | null
          id: string
          name: string
          prize_image_url: string | null
          prize_text: string | null
          started_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      end_site_wide_sale: { Args: never; Returns: undefined }
      finalize_claims: {
        Args: { _session_id: string }
        Returns: {
          buyer_name: string
          buyer_phone: string | null
          buyer_session_id: string
          card_id: string
          claimed_at: string
          created_at: string
          id: string
          quantity: number
          status: string
          unit_price: number
        }[]
        SetofOptions: {
          from: "*"
          to: "claims"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_active_sale_id: { Args: never; Returns: string }
      get_monthly_leaderboard: {
        Args: never
        Returns: {
          buyer_name: string
          purchases: number
          xp: number
        }[]
      }
      get_sale_leaderboard: {
        Args: { _sale_id: string }
        Returns: {
          buyer_name: string
          purchases: number
          xp: number
        }[]
      }
      list_sales: {
        Args: never
        Returns: {
          ended_at: string
          id: string
          name: string
          prize_image_url: string
          prize_text: string
          started_at: string
          total_xp: number
          transaction_count: number
        }[]
      }
      mark_claim_as_sold: {
        Args: {
          _buyer_name: string
          _buyer_phone?: string
          _claim_id: string
          _final_price: number
        }
        Returns: {
          buyer_name: string
          buyer_phone: string | null
          buyer_session_id: string
          card_id: string
          claimed_at: string
          created_at: string
          id: string
          quantity: number
          status: string
          unit_price: number
        }
        SetofOptions: {
          from: "*"
          to: "claims"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_claim: { Args: { _claim_id: string; _session_id: string }; Returns: undefined }
      release_expired_claims: { Args: never; Returns: undefined }
      start_sale: {
        Args: { _name: string }
        Returns: {
          created_at: string
          ended_at: string | null
          id: string
          name: string
          prize_image_url: string | null
          prize_text: string | null
          started_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_hot_sale_status: {
        Args: { _is_active: boolean }
        Returns: {
          id: number
          is_hot_sale_active: boolean
        }
        SetofOptions: {
          from: "*"
          to: "settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_sale_prize: {
        Args: {
          _prize_image_url: string
          _prize_text: string
          _sale_id: string
        }
        Returns: {
          created_at: string
          ended_at: string | null
          id: string
          name: string
          prize_image_url: string | null
          prize_text: string | null
          started_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
