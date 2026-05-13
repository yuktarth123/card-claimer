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
          sale_start_time: string | null
        }
        Insert: {
          id?: number
          sale_start_time?: string | null
        }
        Update: {
          id?: number
          sale_start_time?: string | null
        }
        Relationships: []
      }
      cards: {
        Row: {
          buyer_session_id: string | null
          card_number: string | null
          card_set: string | null
          claimed_at: string | null
          claimed_by: string | null
          condition: string | null
          created_at: string
          id: string
          name: string
          photo_url: string | null
          price: number
          rarity: string | null
          status: string
          tcg_image_url: string | null
          video_url: string | null
        }
        Insert: {
          buyer_session_id?: string | null
          card_number?: string | null
          card_set?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          condition?: string | null
          created_at?: string
          id?: string
          name: string
          photo_url?: string | null
          price?: number
          rarity?: string | null
          status?: string
          tcg_image_url?: string | null
          video_url?: string | null
        }
        Update: {
          buyer_session_id?: string | null
          card_number?: string | null
          card_set?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          condition?: string | null
          created_at?: string
          id?: string
          name?: string
          photo_url?: string | null
          price?: number
          rarity?: string | null
          status?: string
          tcg_image_url?: string | null
          video_url?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_card: {
        Args: { _buyer_name: string; _card_id: string; _session_id: string }
        Returns: {
          buyer_session_id: string | null
          card_number: string | null
          card_set: string | null
          claimed_at: string | null
          claimed_by: string | null
          condition: string | null
          created_at: string
          id: string
          name: string
          photo_url: string | null
          price: number
          rarity: string | null
          status: string
          tcg_image_url: string | null
          video_url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_claims: {
        Args: { _session_id: string }
        Returns: {
          buyer_session_id: string | null
          card_number: string | null
          card_set: string | null
          claimed_at: string | null
          claimed_by: string | null
          condition: string | null
          created_at: string
          id: string
          name: string
          photo_url: string | null
          price: number
          rarity: string | null
          status: string
          tcg_image_url: string | null
          video_url: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "cards"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      unclaim_card: {
        Args: { _card_id: string; _session_id: string }
        Returns: {
          buyer_session_id: string | null
          card_number: string | null
          card_set: string | null
          claimed_at: string | null
          claimed_by: string | null
          condition: string | null
          created_at: string
          id: string
          name: string
          photo_url: string | null
          price: number
          rarity: string | null
          status: string
          tcg_image_url: string | null
          video_url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "cards"
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
