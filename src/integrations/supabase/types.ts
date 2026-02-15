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
      alert_attachments: {
        Row: {
          alert_id: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
        }
        Insert: {
          alert_id: string
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
        }
        Update: {
          alert_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_attachments_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_recipients: {
        Row: {
          alert_id: string
          created_at: string
          id: string
          is_read: boolean
          read_at: string | null
          user_id: string
        }
        Insert: {
          alert_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          read_at?: string | null
          user_id: string
        }
        Update: {
          alert_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_recipients_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          has_attachments: boolean | null
          id: string
          is_active: boolean
          message: string
          target_audience: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          has_attachments?: boolean | null
          id?: string
          is_active?: boolean
          message: string
          target_audience: string
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          has_attachments?: boolean | null
          id?: string
          is_active?: boolean
          message?: string
          target_audience?: string
          title?: string
          type?: string
        }
        Relationships: []
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
          created_by: string | null
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
          created_by?: string | null
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
          created_by?: string | null
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
      charge_message_attachments: {
        Row: {
          charge_id: string
          created_at: string
          created_by: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          message_id: string
          mime_type: string | null
        }
        Insert: {
          charge_id: string
          created_at?: string
          created_by: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          message_id: string
          mime_type?: string | null
        }
        Update: {
          charge_id?: string
          created_at?: string
          created_by?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          message_id?: string
          mime_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "charge_message_attachments_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_message_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "charge_messages"
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
            foreignKeyName: "charge_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_messages_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_payments: {
        Row: {
          amount_cents: number
          applies_to: string
          charge_id: string
          created_at: string
          created_by: string
          id: string
          method: string | null
          note: string | null
          payment_date: string
          proof_file_url: string | null
        }
        Insert: {
          amount_cents: number
          applies_to?: string
          charge_id: string
          created_at?: string
          created_by: string
          id?: string
          method?: string | null
          note?: string | null
          payment_date?: string
          proof_file_url?: string | null
        }
        Update: {
          amount_cents?: number
          applies_to?: string
          charge_id?: string
          created_at?: string
          created_by?: string
          id?: string
          method?: string | null
          note?: string | null
          payment_date?: string
          proof_file_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "charge_payments_charge_id_fkey"
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
          archived_at: string | null
          category: string | null
          contested_at: string | null
          cost_responsible: string | null
          created_at: string
          currency: string
          debit_notice_at: string | null
          debited_at: string | null
          description: string | null
          due_date: string | null
          id: string
          maintenance_date: string | null
          management_contribution_cents: number
          mercadopago_payment_id: string | null
          mercadopago_preference_id: string | null
          owner_id: string
          owner_note: string | null
          owner_proof_path: string | null
          paid_at: string | null
          payment_link: string | null
          payment_link_url: string | null
          pix_qr_code: string | null
          pix_qr_code_base64: string | null
          property_id: string | null
          reminder_24h_sent: boolean | null
          reminder_48h_sent: boolean | null
          reminder_day_sent: boolean | null
          reserve_base_commission_percent: number | null
          reserve_commission_percent: number | null
          reserve_debit_date: string | null
          reserve_extra_commission_percent: number | null
          reserve_owner_receives_cents: number | null
          reserve_owner_value_cents: number | null
          service_type: string | null
          split_owner_percent: number | null
          status: string
          ticket_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          archived_at?: string | null
          category?: string | null
          contested_at?: string | null
          cost_responsible?: string | null
          created_at?: string
          currency?: string
          debit_notice_at?: string | null
          debited_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          maintenance_date?: string | null
          management_contribution_cents?: number
          mercadopago_payment_id?: string | null
          mercadopago_preference_id?: string | null
          owner_id: string
          owner_note?: string | null
          owner_proof_path?: string | null
          paid_at?: string | null
          payment_link?: string | null
          payment_link_url?: string | null
          pix_qr_code?: string | null
          pix_qr_code_base64?: string | null
          property_id?: string | null
          reminder_24h_sent?: boolean | null
          reminder_48h_sent?: boolean | null
          reminder_day_sent?: boolean | null
          reserve_base_commission_percent?: number | null
          reserve_commission_percent?: number | null
          reserve_debit_date?: string | null
          reserve_extra_commission_percent?: number | null
          reserve_owner_receives_cents?: number | null
          reserve_owner_value_cents?: number | null
          service_type?: string | null
          split_owner_percent?: number | null
          status?: string
          ticket_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          archived_at?: string | null
          category?: string | null
          contested_at?: string | null
          cost_responsible?: string | null
          created_at?: string
          currency?: string
          debit_notice_at?: string | null
          debited_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          maintenance_date?: string | null
          management_contribution_cents?: number
          mercadopago_payment_id?: string | null
          mercadopago_preference_id?: string | null
          owner_id?: string
          owner_note?: string | null
          owner_proof_path?: string | null
          paid_at?: string | null
          payment_link?: string | null
          payment_link_url?: string | null
          pix_qr_code?: string | null
          pix_qr_code_base64?: string | null
          property_id?: string | null
          reminder_24h_sent?: boolean | null
          reminder_48h_sent?: boolean | null
          reminder_day_sent?: boolean | null
          reserve_base_commission_percent?: number | null
          reserve_commission_percent?: number | null
          reserve_debit_date?: string | null
          reserve_extra_commission_percent?: number | null
          reserve_owner_receives_cents?: number | null
          reserve_owner_value_cents?: number | null
          service_type?: string | null
          split_owner_percent?: number | null
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
      cleaning_inspection_attachments: {
        Row: {
          created_at: string
          file_name: string | null
          file_type: string | null
          file_url: string
          id: string
          inspection_id: string
          size_bytes: number | null
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_type?: string | null
          file_url: string
          id?: string
          inspection_id: string
          size_bytes?: number | null
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_type?: string | null
          file_url?: string
          id?: string
          inspection_id?: string
          size_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_inspection_attachments_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "cleaning_inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_inspections: {
        Row: {
          archived_at: string | null
          audio_url: string | null
          cleaner_name: string | null
          cleaner_phone: string | null
          created_at: string
          id: string
          internal_only: boolean
          is_routine: boolean | null
          monday_item_id: string | null
          notes: string | null
          property_id: string
          transcript: string | null
          transcript_summary: string | null
        }
        Insert: {
          archived_at?: string | null
          audio_url?: string | null
          cleaner_name?: string | null
          cleaner_phone?: string | null
          created_at?: string
          id?: string
          internal_only?: boolean
          is_routine?: boolean | null
          monday_item_id?: string | null
          notes?: string | null
          property_id: string
          transcript?: string | null
          transcript_summary?: string | null
        }
        Update: {
          archived_at?: string | null
          audio_url?: string | null
          cleaner_name?: string | null
          cleaner_phone?: string | null
          created_at?: string
          id?: string
          internal_only?: boolean
          is_routine?: boolean | null
          monday_item_id?: string | null
          notes?: string | null
          property_id?: string
          transcript?: string | null
          transcript_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_inspections_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          available_variables: Json
          body_html: string
          created_at: string
          description: string | null
          id: string
          key: string
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          available_variables?: Json
          body_html: string
          created_at?: string
          description?: string | null
          id?: string
          key: string
          name: string
          subject: string
          updated_at?: string
        }
        Update: {
          available_variables?: Json
          body_html?: string
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      inspection_drafts: {
        Row: {
          created_at: string
          draft_data: Json
          form_type: string
          id: string
          property_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          draft_data?: Json
          form_type: string
          id?: string
          property_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          draft_data?: Json
          form_type?: string
          id?: string
          property_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_drafts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_items: {
        Row: {
          category: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string
          id: string
          inspection_id: string
          maintenance_ticket_id: string | null
          order_index: number
          status: string
          updated_at: string
        }
        Insert: {
          category: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description: string
          id?: string
          inspection_id: string
          maintenance_ticket_id?: string | null
          order_index?: number
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string
          id?: string
          inspection_id?: string
          maintenance_ticket_id?: string | null
          order_index?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_items_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_items_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "cleaning_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_items_maintenance_ticket_id_fkey"
            columns: ["maintenance_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_settings: {
        Row: {
          id: string
          notify_owner: boolean
          owner_portal_enabled: boolean
          property_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          notify_owner?: boolean
          owner_portal_enabled?: boolean
          property_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          notify_owner?: boolean
          owner_portal_enabled?: boolean
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_settings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_payment_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          payment_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          payment_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_payment_attachments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "charge_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_policy_acceptances: {
        Row: {
          accepted_at: string
          id: string
          owner_id: string
          policy_version: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          owner_id: string
          policy_version: string
        }
        Update: {
          accepted_at?: string
          id?: string
          owner_id?: string
          policy_version?: string
        }
        Relationships: []
      }
      message_read_receipts: {
        Row: {
          id: string
          message_id: string
          message_type: string
          read_at: string
          reader_id: string
        }
        Insert: {
          id?: string
          message_id: string
          message_type: string
          read_at?: string
          reader_id: string
        }
        Update: {
          id?: string
          message_id?: string
          message_type?: string
          read_at?: string
          reader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_read_receipts_reader_id_fkey"
            columns: ["reader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          owner_id: string
          read: boolean
          reference_id: string | null
          reference_url: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          owner_id: string
          read?: boolean
          reference_id?: string | null
          reference_url?: string | null
          title: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          owner_id?: string
          read?: boolean
          reference_id?: string | null
          reference_url?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      owner_payment_scores: {
        Row: {
          charge_id: string | null
          created_at: string
          id: string
          owner_id: string
          points_change: number
          reason: string
          score_after: number
          score_before: number
        }
        Insert: {
          charge_id?: string | null
          created_at?: string
          id?: string
          owner_id: string
          points_change: number
          reason: string
          score_after: number
          score_before: number
        }
        Update: {
          charge_id?: string | null
          created_at?: string
          id?: string
          owner_id?: string
          points_change?: number
          reason?: string
          score_after?: number
          score_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "owner_payment_scores_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_payment_scores_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          payment_score: number
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
          payment_score?: number
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
          payment_score?: number
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
          assigned_cleaner_id: string | null
          assigned_cleaner_phone: string | null
          cover_photo_url: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
          owner_phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          assigned_cleaner_id?: string | null
          assigned_cleaner_phone?: string | null
          cover_photo_url?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
          owner_phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          assigned_cleaner_id?: string | null
          assigned_cleaner_phone?: string | null
          cover_photo_url?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          owner_phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_assigned_cleaner_id_fkey"
            columns: ["assigned_cleaner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      property_ical_links: {
        Row: {
          created_at: string
          ical_url: string
          id: string
          last_synced_at: string | null
          property_id: string
          source_label: string | null
          sync_error: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          ical_url: string
          id?: string
          last_synced_at?: string | null
          property_id: string
          source_label?: string | null
          sync_error?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          ical_url?: string
          id?: string
          last_synced_at?: string | null
          property_id?: string
          source_label?: string | null
          sync_error?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_ical_links_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          proposal_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          proposal_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          proposal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_attachments_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_items: {
        Row: {
          created_at: string
          id: string
          name: string
          order_index: number
          proposal_id: string
          unit_price_cents: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          order_index?: number
          proposal_id: string
          unit_price_cents: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          order_index?: number
          proposal_id?: string
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_options: {
        Row: {
          created_at: string
          id: string
          option_text: string
          order_index: number
          proposal_id: string
          requires_payment: boolean | null
        }
        Insert: {
          created_at?: string
          id?: string
          option_text: string
          order_index?: number
          proposal_id: string
          requires_payment?: boolean | null
        }
        Update: {
          created_at?: string
          id?: string
          option_text?: string
          order_index?: number
          proposal_id?: string
          requires_payment?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_options_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_response_items: {
        Row: {
          created_at: string
          id: string
          item_id: string
          quantity: number
          response_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          quantity?: number
          response_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          quantity?: number
          response_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_response_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "proposal_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_response_items_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "proposal_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_responses: {
        Row: {
          approved: boolean
          attachment_path: string | null
          created_at: string
          id: string
          is_visible_to_owner: boolean
          mercadopago_payment_id: string | null
          note: string | null
          owner_id: string
          paid_at: string | null
          payment_amount_cents: number | null
          payment_status: string | null
          proposal_id: string
          quantity: number | null
          responded_at: string
          selected_option_id: string | null
        }
        Insert: {
          approved: boolean
          attachment_path?: string | null
          created_at?: string
          id?: string
          is_visible_to_owner?: boolean
          mercadopago_payment_id?: string | null
          note?: string | null
          owner_id: string
          paid_at?: string | null
          payment_amount_cents?: number | null
          payment_status?: string | null
          proposal_id: string
          quantity?: number | null
          responded_at?: string
          selected_option_id?: string | null
        }
        Update: {
          approved?: boolean
          attachment_path?: string | null
          created_at?: string
          id?: string
          is_visible_to_owner?: boolean
          mercadopago_payment_id?: string | null
          note?: string | null
          owner_id?: string
          paid_at?: string | null
          payment_amount_cents?: number | null
          payment_status?: string | null
          proposal_id?: string
          quantity?: number | null
          responded_at?: string
          selected_option_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_responses_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_responses_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "proposal_options"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          amount_cents: number | null
          category: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          deadline: string
          description: string
          has_attachments: boolean | null
          id: string
          payment_type: string | null
          property_id: string | null
          required_approvals: number | null
          status: string
          target_audience: string
          title: string
          unit_price_cents: number | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deadline: string
          description: string
          has_attachments?: boolean | null
          id?: string
          payment_type?: string | null
          property_id?: string | null
          required_approvals?: number | null
          status?: string
          target_audience?: string
          title: string
          unit_price_cents?: number | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deadline?: string
          description?: string
          has_attachments?: boolean | null
          id?: string
          payment_type?: string | null
          property_id?: string | null
          required_approvals?: number | null
          status?: string
          target_audience?: string
          title?: string
          unit_price_cents?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          is_active: boolean | null
          owner_id: string
          p256dh: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          is_active?: boolean | null
          owner_id: string
          p256dh: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          is_active?: boolean | null
          owner_id?: string
          p256dh?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          check_in: string
          check_out: string
          created_at: string
          guest_name: string | null
          ical_link_id: string | null
          ical_uid: string | null
          id: string
          property_id: string
          raw_data: Json | null
          status: string | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          check_in: string
          check_out: string
          created_at?: string
          guest_name?: string | null
          ical_link_id?: string | null
          ical_uid?: string | null
          id?: string
          property_id: string
          raw_data?: Json | null
          status?: string | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          check_in?: string
          check_out?: string
          created_at?: string
          guest_name?: string | null
          ical_link_id?: string | null
          ical_uid?: string | null
          id?: string
          property_id?: string
          raw_data?: Json | null
          status?: string | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_ical_link_id_fkey"
            columns: ["ical_link_id"]
            isOneToOne: false
            referencedRelation: "property_ical_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      response_templates: {
        Row: {
          category: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean | null
          shortcut: string | null
          title: string
          updated_at: string
          usage_count: number | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          shortcut?: string | null
          title: string
          updated_at?: string
          usage_count?: number | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          shortcut?: string | null
          title?: string
          updated_at?: string
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "response_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_inspection_checklists: {
        Row: {
          ac_filters_cleaned: boolean | null
          ac_notes: string | null
          ac_working: string | null
          bathroom_notes: string | null
          bathroom_working: string | null
          batteries_replaced: boolean | null
          created_at: string
          curtains_rods_notes: string | null
          curtains_rods_working: string | null
          cutlery_notes: string | null
          cutlery_ok: string | null
          doors_locks_notes: string | null
          doors_locks_working: string | null
          furniture_notes: string | null
          furniture_working: string | null
          glasses_count: number | null
          id: string
          inspection_id: string
          kitchen_notes: string | null
          kitchen_working: string | null
          outlets_switches_notes: string | null
          outlets_switches_working: string | null
          pillows_count: number | null
          stove_oven_notes: string | null
          stove_oven_working: string | null
          tv_internet_notes: string | null
          tv_internet_working: string | null
        }
        Insert: {
          ac_filters_cleaned?: boolean | null
          ac_notes?: string | null
          ac_working?: string | null
          bathroom_notes?: string | null
          bathroom_working?: string | null
          batteries_replaced?: boolean | null
          created_at?: string
          curtains_rods_notes?: string | null
          curtains_rods_working?: string | null
          cutlery_notes?: string | null
          cutlery_ok?: string | null
          doors_locks_notes?: string | null
          doors_locks_working?: string | null
          furniture_notes?: string | null
          furniture_working?: string | null
          glasses_count?: number | null
          id?: string
          inspection_id: string
          kitchen_notes?: string | null
          kitchen_working?: string | null
          outlets_switches_notes?: string | null
          outlets_switches_working?: string | null
          pillows_count?: number | null
          stove_oven_notes?: string | null
          stove_oven_working?: string | null
          tv_internet_notes?: string | null
          tv_internet_working?: string | null
        }
        Update: {
          ac_filters_cleaned?: boolean | null
          ac_notes?: string | null
          ac_working?: string | null
          bathroom_notes?: string | null
          bathroom_working?: string | null
          batteries_replaced?: boolean | null
          created_at?: string
          curtains_rods_notes?: string | null
          curtains_rods_working?: string | null
          cutlery_notes?: string | null
          cutlery_ok?: string | null
          doors_locks_notes?: string | null
          doors_locks_working?: string | null
          furniture_notes?: string | null
          furniture_working?: string | null
          glasses_count?: number | null
          id?: string
          inspection_id?: string
          kitchen_notes?: string | null
          kitchen_working?: string | null
          outlets_switches_notes?: string | null
          outlets_switches_working?: string | null
          pillows_count?: number | null
          stove_oven_notes?: string | null
          stove_oven_working?: string | null
          tv_internet_notes?: string | null
          tv_internet_working?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routine_inspection_checklists_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "cleaning_inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      service_availability_reports: {
        Row: {
          created_at: string
          generated_at: string
          generated_by: string | null
          id: string
          report_data: Json
          report_type: string
          shopping_list: Json | null
        }
        Insert: {
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          report_data: Json
          report_type: string
          shopping_list?: Json | null
        }
        Update: {
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          report_data?: Json
          report_type?: string
          shopping_list?: Json | null
        }
        Relationships: []
      }
      service_providers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          specialty: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          specialty?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          specialty?: string[] | null
          updated_at?: string
        }
        Relationships: []
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
      team_chat_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_chat_messages_author_id_fkey"
            columns: ["author_id"]
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
          archived_at: string | null
          assigned_to: string | null
          blocked_dates_end: string | null
          blocked_dates_start: string | null
          cost_responsible: string | null
          created_at: string
          created_by: string
          description: string
          essential: boolean | null
          first_response_at: string | null
          guest_checkout_date: string | null
          id: string
          kind: string | null
          owner_action_due_at: string | null
          owner_decision: string | null
          owner_id: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          property_id: string | null
          scheduled_at: string | null
          service_provider_id: string | null
          sla_due_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          ticket_type: Database["public"]["Enums"]["ticket_type"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          blocked_dates_end?: string | null
          blocked_dates_start?: string | null
          cost_responsible?: string | null
          created_at?: string
          created_by: string
          description: string
          essential?: boolean | null
          first_response_at?: string | null
          guest_checkout_date?: string | null
          id?: string
          kind?: string | null
          owner_action_due_at?: string | null
          owner_decision?: string | null
          owner_id: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          property_id?: string | null
          scheduled_at?: string | null
          service_provider_id?: string | null
          sla_due_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          ticket_type: Database["public"]["Enums"]["ticket_type"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          blocked_dates_end?: string | null
          blocked_dates_start?: string | null
          cost_responsible?: string | null
          created_at?: string
          created_by?: string
          description?: string
          essential?: boolean | null
          first_response_at?: string | null
          guest_checkout_date?: string | null
          id?: string
          kind?: string | null
          owner_action_due_at?: string | null
          owner_decision?: string | null
          owner_id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          property_id?: string | null
          scheduled_at?: string | null
          service_provider_id?: string | null
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
          {
            foreignKeyName: "tickets_service_provider_id_fkey"
            columns: ["service_provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_ticket_type: {
        Args: {
          _ticket_type: Database["public"]["Enums"]["ticket_type"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      invoke_charge_cron: { Args: never; Returns: undefined }
      is_admin_or_maintenance: { Args: { _user_id: string }; Returns: boolean }
      is_team_member: { Args: { _user_id: string }; Returns: boolean }
      set_session_context: {
        Args: { p_owner_id: string; p_role: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "owner"
        | "agent"
        | "admin"
        | "pending_owner"
        | "cleaner"
        | "maintenance"
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
        | "informacao"
        | "conversar_hospedes"
        | "melhorias_compras"
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
      app_role: [
        "owner",
        "agent",
        "admin",
        "pending_owner",
        "cleaner",
        "maintenance",
      ],
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
        "informacao",
        "conversar_hospedes",
        "melhorias_compras",
      ],
    },
  },
} as const
