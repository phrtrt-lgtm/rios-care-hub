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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_prompt_versions: {
        Row: {
          ai_settings_id: string | null
          changelog: string | null
          created_at: string
          created_by: string | null
          guardrails: string | null
          id: string
          max_tokens: number
          model: string
          style_guide: string | null
          system_prompt: string
          temperature: number
        }
        Insert: {
          ai_settings_id?: string | null
          changelog?: string | null
          created_at?: string
          created_by?: string | null
          guardrails?: string | null
          id?: string
          max_tokens: number
          model: string
          style_guide?: string | null
          system_prompt: string
          temperature: number
        }
        Update: {
          ai_settings_id?: string | null
          changelog?: string | null
          created_at?: string
          created_by?: string | null
          guardrails?: string | null
          id?: string
          max_tokens?: number
          model?: string
          style_guide?: string | null
          system_prompt?: string
          temperature?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_versions_ai_settings_id_fkey"
            columns: ["ai_settings_id"]
            isOneToOne: false
            referencedRelation: "ai_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_settings: {
        Row: {
          created_at: string
          guardrails: string | null
          id: string
          max_tokens: number
          model: string
          style_guide: string | null
          system_prompt: string
          temperature: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          guardrails?: string | null
          id?: string
          max_tokens?: number
          model?: string
          style_guide?: string | null
          system_prompt?: string
          temperature?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          guardrails?: string | null
          id?: string
          max_tokens?: number
          model?: string
          style_guide?: string | null
          system_prompt?: string
          temperature?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_templates: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          key: string
          label: string
          order_index: number
          template_prompt: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          key: string
          label: string
          order_index?: number
          template_prompt: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          key?: string
          label?: string
          order_index?: number
          template_prompt?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          charge_id: string | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          latency_ms: number | null
          model: string
          request_tokens: number | null
          response_tokens: number | null
          success: boolean
          template_key: string | null
          ticket_id: string | null
        }
        Insert: {
          charge_id?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          latency_ms?: number | null
          model: string
          request_tokens?: number | null
          response_tokens?: number | null
          success?: boolean
          template_key?: string | null
          ticket_id?: string | null
        }
        Update: {
          charge_id?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          latency_ms?: number | null
          model?: string
          request_tokens?: number | null
          response_tokens?: number | null
          success?: boolean
          template_key?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_recipients: {
        Row: {
          broadcast_id: string
          created_at: string
          email: string
          error_message: string | null
          id: string
          owner_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          broadcast_id: string
          created_at?: string
          email: string
          error_message?: string | null
          id?: string
          owner_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          broadcast_id?: string
          created_at?: string
          email?: string
          error_message?: string | null
          id?: string
          owner_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_recipients_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_recipients_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          body_html: string
          created_at: string
          created_by: string
          id: string
          include_rules_link: boolean | null
          recipients_count: number
          subject: string
        }
        Insert: {
          body_html: string
          created_at?: string
          created_by: string
          id?: string
          include_rules_link?: boolean | null
          recipients_count?: number
          subject: string
        }
        Update: {
          body_html?: string
          created_at?: string
          created_by?: string
          id?: string
          include_rules_link?: boolean | null
          recipients_count?: number
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_attachments: {
        Row: {
          charge_id: string | null
          created_at: string
          created_by: string
          duration_sec: number | null
          file_name: string
          file_path: string
          file_size: number | null
          height: number | null
          id: string
          mime_type: string | null
          mime_type_override: string | null
          monday_asset_id: string | null
          poster_path: string | null
          source: string | null
          width: number | null
        }
        Insert: {
          charge_id?: string | null
          created_at?: string
          created_by: string
          duration_sec?: number | null
          file_name: string
          file_path: string
          file_size?: number | null
          height?: number | null
          id?: string
          mime_type?: string | null
          mime_type_override?: string | null
          monday_asset_id?: string | null
          poster_path?: string | null
          source?: string | null
          width?: number | null
        }
        Update: {
          charge_id?: string | null
          created_at?: string
          created_by?: string
          duration_sec?: number | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          height?: number | null
          id?: string
          mime_type?: string | null
          mime_type_override?: string | null
          monday_asset_id?: string | null
          poster_path?: string | null
          source?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "charge_attachments_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_messages: {
        Row: {
          author_id: string
          body: string
          charge_id: string
          created_at: string
          id: string
          is_internal: boolean
        }
        Insert: {
          author_id: string
          body: string
          charge_id: string
          created_at?: string
          id?: string
          is_internal?: boolean
        }
        Update: {
          author_id?: string
          body?: string
          charge_id?: string
          created_at?: string
          id?: string
          is_internal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "charge_messages_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
        ]
      }
      charges: {
        Row: {
          amount_cents: number
          contested_at: string | null
          created_at: string
          currency: string
          debit_notice_at: string | null
          debited_at: string | null
          description: string | null
          due_date: string | null
          id: string
          owner_id: string
          owner_note: string | null
          owner_proof_path: string | null
          paid_at: string | null
          payment_link_url: string | null
          property_id: string | null
          reminder_24h_sent: boolean | null
          reminder_48h_sent: boolean | null
          reminder_day_sent: boolean | null
          status: string
          ticket_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          contested_at?: string | null
          created_at?: string
          currency?: string
          debit_notice_at?: string | null
          debited_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          owner_id: string
          owner_note?: string | null
          owner_proof_path?: string | null
          paid_at?: string | null
          payment_link_url?: string | null
          property_id?: string | null
          reminder_24h_sent?: boolean | null
          reminder_48h_sent?: boolean | null
          reminder_day_sent?: boolean | null
          status?: string
          ticket_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          contested_at?: string | null
          created_at?: string
          currency?: string
          debit_notice_at?: string | null
          debited_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          owner_id?: string
          owner_note?: string | null
          owner_proof_path?: string | null
          paid_at?: string | null
          payment_link_url?: string | null
          property_id?: string | null
          reminder_24h_sent?: boolean | null
          reminder_48h_sent?: boolean | null
          reminder_day_sent?: boolean | null
          status?: string
          ticket_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charges_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          phone: string | null
          photo_url: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name: string
          phone?: string | null
          photo_url?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          photo_url?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_attachments: {
        Row: {
          created_at: string
          file_name: string | null
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          message_id: string
          mime_type: string | null
          name: string | null
          path: string
          size_bytes: number | null
          ticket_id: string | null
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          message_id: string
          mime_type?: string | null
          name?: string | null
          path: string
          size_bytes?: number | null
          ticket_id?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          message_id?: string
          mime_type?: string | null
          name?: string | null
          path?: string
          size_bytes?: number | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ticket_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          is_internal: boolean
          ticket_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to: string | null
          blocked_dates_end: string | null
          blocked_dates_start: string | null
          created_at: string
          created_by: string
          description: string
          first_response_at: string | null
          id: string
          owner_id: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          property_id: string | null
          sla_due_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          ticket_type: Database["public"]["Enums"]["ticket_type"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          blocked_dates_end?: string | null
          blocked_dates_start?: string | null
          created_at?: string
          created_by: string
          description: string
          first_response_at?: string | null
          id?: string
          owner_id: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          property_id?: string | null
          sla_due_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          ticket_type: Database["public"]["Enums"]["ticket_type"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          blocked_dates_end?: string | null
          blocked_dates_start?: string | null
          created_at?: string
          created_by?: string
          description?: string
          first_response_at?: string | null
          id?: string
          owner_id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          property_id?: string | null
          sla_due_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          ticket_type?: Database["public"]["Enums"]["ticket_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_team_member: { Args: { _user_id: string }; Returns: boolean }
      set_session_context: {
        Args: { p_owner_id: string; p_role: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "owner" | "agent" | "admin" | "pending_owner"
      ticket_priority: "normal" | "urgente"
      ticket_status:
        | "novo"
        | "em_analise"
        | "aguardando_info"
        | "em_execucao"
        | "concluido"
        | "cancelado"
      ticket_type:
        | "duvida"
        | "manutencao"
        | "cobranca"
        | "bloqueio_data"
        | "financeiro"
        | "outros"
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
    Enums: {
      app_role: ["owner", "agent", "admin", "pending_owner"],
      ticket_priority: ["normal", "urgente"],
      ticket_status: [
        "novo",
        "em_analise",
        "aguardando_info",
        "em_execucao",
        "concluido",
        "cancelado",
      ],
      ticket_type: [
        "duvida",
        "manutencao",
        "cobranca",
        "bloqueio_data",
        "financeiro",
        "outros",
      ],
    },
  },
} as const
