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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action_type: string
          company_id: string | null
          created_at: string
          description: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action_type: string
          company_id?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action_type?: string
          company_id?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_action_audit: {
        Row: {
          action_id: string
          actor_user_id: string | null
          agent_name: string | null
          company_id: string
          context_refs: Json
          created_at: string
          detail: Json
          event_type: string
          from_status: string | null
          id: string
          latency_ms: number | null
          model_name: string | null
          model_provider: string | null
          to_status: string | null
        }
        Insert: {
          action_id: string
          actor_user_id?: string | null
          agent_name?: string | null
          company_id: string
          context_refs?: Json
          created_at?: string
          detail?: Json
          event_type: string
          from_status?: string | null
          id?: string
          latency_ms?: number | null
          model_name?: string | null
          model_provider?: string | null
          to_status?: string | null
        }
        Update: {
          action_id?: string
          actor_user_id?: string | null
          agent_name?: string | null
          company_id?: string
          context_refs?: Json
          created_at?: string
          detail?: Json
          event_type?: string
          from_status?: string | null
          id?: string
          latency_ms?: number | null
          model_name?: string | null
          model_provider?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_action_audit_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "autopilot_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_audit_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_company_memory: {
        Row: {
          company_id: string
          confidence: number
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          memory_key: string
          memory_type: string
          source: string
          state: string
          updated_at: string
          value: Json
        }
        Insert: {
          company_id: string
          confidence?: number
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          memory_key: string
          memory_type: string
          source?: string
          state?: string
          updated_at?: string
          value: Json
        }
        Update: {
          company_id?: string
          confidence?: number
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          memory_key?: string
          memory_type?: string
          source?: string
          state?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_company_memory_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_generations: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          generation_type: string
          id: string
          metadata: Json | null
          model_used: string | null
          negative_prompt: string | null
          output_storage_path: string | null
          output_url: string | null
          prompt: string
          status: string
          thumbnail_url: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          generation_type?: string
          id?: string
          metadata?: Json | null
          model_used?: string | null
          negative_prompt?: string | null
          output_storage_path?: string | null
          output_url?: string | null
          prompt: string
          status?: string
          thumbnail_url?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          generation_type?: string
          id?: string
          metadata?: Json | null
          model_used?: string | null
          negative_prompt?: string | null
          output_storage_path?: string | null
          output_url?: string | null
          prompt?: string
          status?: string
          thumbnail_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_generations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_operating_rules: {
        Row: {
          category: string
          company_id: string
          created_at: string
          created_by: string
          definition: Json
          description: string | null
          enabled: boolean
          id: string
          name: string
          priority: number
          updated_at: string
        }
        Insert: {
          category?: string
          company_id: string
          created_at?: string
          created_by: string
          definition?: Json
          description?: string | null
          enabled?: boolean
          id?: string
          name: string
          priority?: number
          updated_at?: string
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string
          definition?: Json
          description?: string | null
          enabled?: boolean
          id?: string
          name?: string
          priority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_operating_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_signals: {
        Row: {
          category: string
          company_id: string
          confidence: number
          deadline: string | null
          entity_id: string | null
          entity_type: string | null
          estimated_impact: Json
          fingerprint: string
          first_detected_at: string
          href: string | null
          id: string
          last_detected_at: string
          metadata: Json
          reason: string
          recommended_action: string | null
          recommended_action_name: string | null
          resolved_at: string | null
          severity: string
          signal_type: string
          status: string
          title: string
        }
        Insert: {
          category?: string
          company_id: string
          confidence?: number
          deadline?: string | null
          entity_id?: string | null
          entity_type?: string | null
          estimated_impact?: Json
          fingerprint: string
          first_detected_at?: string
          href?: string | null
          id?: string
          last_detected_at?: string
          metadata?: Json
          reason: string
          recommended_action?: string | null
          recommended_action_name?: string | null
          resolved_at?: string | null
          severity: string
          signal_type: string
          status?: string
          title: string
        }
        Update: {
          category?: string
          company_id?: string
          confidence?: number
          deadline?: string | null
          entity_id?: string | null
          entity_type?: string | null
          estimated_impact?: Json
          fingerprint?: string
          first_detected_at?: string
          href?: string | null
          id?: string
          last_detected_at?: string
          metadata?: Json
          reason?: string
          recommended_action?: string | null
          recommended_action_name?: string | null
          resolved_at?: string | null
          severity?: string
          signal_type?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_signals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_logs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          break_minutes: number | null
          check_in: string
          check_out: string | null
          company_id: string
          created_at: string
          employee_profile_id: string
          id: string
          notes: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          break_minutes?: number | null
          check_in?: string
          check_out?: string | null
          company_id: string
          created_at?: string
          employee_profile_id: string
          id?: string
          notes?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          break_minutes?: number | null
          check_in?: string
          check_out?: string | null
          company_id?: string
          created_at?: string
          employee_profile_id?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_employee_profile_id_fkey"
            columns: ["employee_profile_id"]
            isOneToOne: false
            referencedRelation: "employee_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      autopilot_actions: {
        Row: {
          action_id: string
          action_type: string
          approved_at: string | null
          approved_by: string | null
          attempt_count: number
          category: string
          company_id: string
          confirmation_required: boolean
          connector: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          executed_at: string | null
          execution_function: string | null
          execution_payload: Json | null
          failure_reason: string | null
          headline: string
          id: string
          idempotency_key: string | null
          last_attempt_at: string | null
          metadata: Json
          payload: Json | null
          preview: Json
          rationale: string | null
          rejected_at: string | null
          required_permission: string
          result: Json | null
          reviewed_by: string | null
          risk_level: string
          status: string
          suggested_by: string | null
          triggered_by_event: string | null
          updated_at: string
          user_id: string
          verification: Json | null
        }
        Insert: {
          action_id: string
          action_type: string
          approved_at?: string | null
          approved_by?: string | null
          attempt_count?: number
          category: string
          company_id: string
          confirmation_required?: boolean
          connector?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          executed_at?: string | null
          execution_function?: string | null
          execution_payload?: Json | null
          failure_reason?: string | null
          headline: string
          id?: string
          idempotency_key?: string | null
          last_attempt_at?: string | null
          metadata?: Json
          payload?: Json | null
          preview?: Json
          rationale?: string | null
          rejected_at?: string | null
          required_permission?: string
          result?: Json | null
          reviewed_by?: string | null
          risk_level?: string
          status?: string
          suggested_by?: string | null
          triggered_by_event?: string | null
          updated_at?: string
          user_id: string
          verification?: Json | null
        }
        Update: {
          action_id?: string
          action_type?: string
          approved_at?: string | null
          approved_by?: string | null
          attempt_count?: number
          category?: string
          company_id?: string
          confirmation_required?: boolean
          connector?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          executed_at?: string | null
          execution_function?: string | null
          execution_payload?: Json | null
          failure_reason?: string | null
          headline?: string
          id?: string
          idempotency_key?: string | null
          last_attempt_at?: string | null
          metadata?: Json
          payload?: Json | null
          preview?: Json
          rationale?: string | null
          rejected_at?: string | null
          required_permission?: string
          result?: Json | null
          reviewed_by?: string | null
          risk_level?: string
          status?: string
          suggested_by?: string | null
          triggered_by_event?: string | null
          updated_at?: string
          user_id?: string
          verification?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "autopilot_actions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autopilot_actions_triggered_by_event_fkey"
            columns: ["triggered_by_event"]
            isOneToOne: false
            referencedRelation: "workspace_events"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_email_campaigns: {
        Row: {
          body_preview: string | null
          cancelled_at: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          from_email: string | null
          from_name: string | null
          html_body: string | null
          id: string
          reply_to: string | null
          scheduled_at: string | null
          started_at: string | null
          status: string
          subject: string
          text_body: string | null
          total_errors: number
          total_opened: number
          total_recipients: number
          total_replied: number
          total_sent: number
          total_unsubscribed: number
          user_id: string
        }
        Insert: {
          body_preview?: string | null
          cancelled_at?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          from_email?: string | null
          from_name?: string | null
          html_body?: string | null
          id?: string
          reply_to?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          subject: string
          text_body?: string | null
          total_errors?: number
          total_opened?: number
          total_recipients?: number
          total_replied?: number
          total_sent?: number
          total_unsubscribed?: number
          user_id: string
        }
        Update: {
          body_preview?: string | null
          cancelled_at?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          from_email?: string | null
          from_name?: string | null
          html_body?: string | null
          id?: string
          reply_to?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          subject?: string
          text_body?: string | null
          total_errors?: number
          total_opened?: number
          total_recipients?: number
          total_replied?: number
          total_sent?: number
          total_unsubscribed?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_email_campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_email_recipients: {
        Row: {
          campaign_id: string
          company_id: string
          created_at: string
          email: string
          error_message: string | null
          id: string
          name: string | null
          open_count: number
          opened_at: string | null
          replied_at: string | null
          status: string
          unsubscribed_at: string | null
        }
        Insert: {
          campaign_id: string
          company_id: string
          created_at?: string
          email: string
          error_message?: string | null
          id?: string
          name?: string | null
          open_count?: number
          opened_at?: string | null
          replied_at?: string | null
          status?: string
          unsubscribed_at?: string | null
        }
        Update: {
          campaign_id?: string
          company_id?: string
          created_at?: string
          email?: string
          error_message?: string | null
          id?: string
          name?: string | null
          open_count?: number
          opened_at?: string | null
          replied_at?: string | null
          status?: string
          unsubscribed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bulk_email_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "bulk_email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_email_recipients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          description: string | null
          employee_profile_id: string | null
          end_time: string
          event_type: string | null
          id: string
          is_private: boolean | null
          start_time: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          description?: string | null
          employee_profile_id?: string | null
          end_time: string
          event_type?: string | null
          id?: string
          is_private?: boolean | null
          start_time: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          employee_profile_id?: string | null
          end_time?: string
          event_type?: string | null
          id?: string
          is_private?: boolean | null
          start_time?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_employee_profile_id_fkey"
            columns: ["employee_profile_id"]
            isOneToOne: false
            referencedRelation: "employee_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_sessions: {
        Row: {
          answered_at: string | null
          billable_seconds: number | null
          company_id: string
          created_at: string
          customer_id: string | null
          destination_country: string | null
          direction: string
          disposition: string | null
          duration_seconds: number | null
          ended_at: string | null
          from_number: string | null
          id: string
          lead_id: string | null
          metadata: Json
          notes: string | null
          provider_call_id: string | null
          provider_cost: number | null
          provider_currency: string | null
          provider_type: string
          ringing_at: string | null
          started_at: string
          status: string
          telephony_connection_id: string | null
          to_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          answered_at?: string | null
          billable_seconds?: number | null
          company_id: string
          created_at?: string
          customer_id?: string | null
          destination_country?: string | null
          direction?: string
          disposition?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          notes?: string | null
          provider_call_id?: string | null
          provider_cost?: number | null
          provider_currency?: string | null
          provider_type: string
          ringing_at?: string | null
          started_at?: string
          status?: string
          telephony_connection_id?: string | null
          to_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          answered_at?: string | null
          billable_seconds?: number | null
          company_id?: string
          created_at?: string
          customer_id?: string | null
          destination_country?: string | null
          direction?: string
          disposition?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          notes?: string | null
          provider_call_id?: string | null
          provider_cost?: number | null
          provider_currency?: string | null
          provider_type?: string
          ringing_at?: string | null
          started_at?: string
          status?: string
          telephony_connection_id?: string | null
          to_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_sessions_telephony_connection_id_fkey"
            columns: ["telephony_connection_id"]
            isOneToOne: false
            referencedRelation: "telephony_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      campaign_assets: {
        Row: {
          byte_size: number
          campaign_id: string
          checksum_sha256: string | null
          company_id: string
          content_id: string | null
          content_type: string
          created_at: string
          created_by: string
          disposition: string
          file_name: string
          id: string
          storage_bucket: string
          storage_path: string
        }
        Insert: {
          byte_size: number
          campaign_id: string
          checksum_sha256?: string | null
          company_id: string
          content_id?: string | null
          content_type: string
          created_at?: string
          created_by: string
          disposition?: string
          file_name: string
          id?: string
          storage_bucket: string
          storage_path: string
        }
        Update: {
          byte_size?: number
          campaign_id?: string
          checksum_sha256?: string | null
          company_id?: string
          content_id?: string | null
          content_type?: string
          created_at?: string
          created_by?: string
          disposition?: string
          file_name?: string
          id?: string
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_assets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "bulk_email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cold_caller_usage: {
        Row: {
          calls_made: number | null
          company_id: string
          duration_seconds: number | null
          id: string
          leads_created: number | null
          session_ended_at: string | null
          session_started_at: string | null
          used_at: string
          user_id: string
        }
        Insert: {
          calls_made?: number | null
          company_id: string
          duration_seconds?: number | null
          id?: string
          leads_created?: number | null
          session_ended_at?: string | null
          session_started_at?: string | null
          used_at?: string
          user_id: string
        }
        Update: {
          calls_made?: number | null
          company_id?: string
          duration_seconds?: number | null
          id?: string
          leads_created?: number | null
          session_ended_at?: string | null
          session_started_at?: string | null
          used_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cold_caller_usage_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          activation_code: string | null
          address: string | null
          applicant_role: string | null
          automation_rules: Json | null
          billing_mode: string
          company_size: string | null
          compliance_checklist: Json | null
          created_at: string
          cvr: string | null
          disabled: boolean
          email: string | null
          id: string
          industry: string | null
          lead_scoring_config: Json | null
          logo_url: string | null
          mode: string | null
          name: string
          onboarding_completed: boolean
          onboarding_step: number
          phone: string | null
          purchased_seats: number | null
          seat_limit_trial: number | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          trial_ends_at: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          activation_code?: string | null
          address?: string | null
          applicant_role?: string | null
          automation_rules?: Json | null
          billing_mode?: string
          company_size?: string | null
          compliance_checklist?: Json | null
          created_at?: string
          cvr?: string | null
          disabled?: boolean
          email?: string | null
          id?: string
          industry?: string | null
          lead_scoring_config?: Json | null
          logo_url?: string | null
          mode?: string | null
          name: string
          onboarding_completed?: boolean
          onboarding_step?: number
          phone?: string | null
          purchased_seats?: number | null
          seat_limit_trial?: number | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          activation_code?: string | null
          address?: string | null
          applicant_role?: string | null
          automation_rules?: Json | null
          billing_mode?: string
          company_size?: string | null
          compliance_checklist?: Json | null
          created_at?: string
          cvr?: string | null
          disabled?: boolean
          email?: string | null
          id?: string
          industry?: string | null
          lead_scoring_config?: Json | null
          logo_url?: string | null
          mode?: string | null
          name?: string
          onboarding_completed?: boolean
          onboarding_step?: number
          phone?: string | null
          purchased_seats?: number | null
          seat_limit_trial?: number | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      company_module_seats: {
        Row: {
          company_id: string
          created_at: string
          id: string
          module: string
          seat_count: number
          stripe_price_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          module: string
          seat_count: number
          stripe_price_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          module?: string
          seat_count?: number
          stripe_price_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_module_seats_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_logs: {
        Row: {
          anonymous_id: string | null
          consent_type: string
          consent_value: boolean
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          anonymous_id?: string | null
          consent_type: string
          consent_value: boolean
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          anonymous_id?: string | null
          consent_type?: string
          consent_value?: boolean
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      contact_submissions: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          phone: string | null
          read: boolean | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          phone?: string | null
          read?: boolean | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          phone?: string | null
          read?: boolean | null
        }
        Relationships: []
      }
      crm_activities: {
        Row: {
          body: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          next_step_at: string | null
          type: string
        }
        Insert: {
          body?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
          next_step_at?: string | null
          type: string
        }
        Update: {
          body?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          next_step_at?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      customers: {
        Row: {
          accounting_synced_at: string | null
          address: string | null
          ai_recommendation: string | null
          ai_recommendation_at: string | null
          campaign_id: string | null
          city: string | null
          company_id: string
          company_name: string | null
          conversion_status: string
          converted_at: string | null
          converted_customer_id: string | null
          converted_deal_id: string | null
          converted_from_lead_id: string | null
          country: string | null
          created_at: string
          created_by: string
          currency: string | null
          customer_type: string | null
          dinero_contact_guid: string | null
          economic_customer_number: number | null
          email: string
          folder_id: string | null
          id: string
          import_batch_id: string | null
          industry: string | null
          last_touched_at: string | null
          name: string
          next_followup_at: string | null
          normalized_email: string | null
          normalized_phone: string | null
          notes: string | null
          owner_id: string | null
          phone: string | null
          record_type: string
          score: number | null
          source_id: string | null
          status: Database["public"]["Enums"]["lead_status"] | null
          tags: string[] | null
          updated_at: string
          value: number | null
          vat_number: string | null
        }
        Insert: {
          accounting_synced_at?: string | null
          address?: string | null
          ai_recommendation?: string | null
          ai_recommendation_at?: string | null
          campaign_id?: string | null
          city?: string | null
          company_id: string
          company_name?: string | null
          conversion_status?: string
          converted_at?: string | null
          converted_customer_id?: string | null
          converted_deal_id?: string | null
          converted_from_lead_id?: string | null
          country?: string | null
          created_at?: string
          created_by: string
          currency?: string | null
          customer_type?: string | null
          dinero_contact_guid?: string | null
          economic_customer_number?: number | null
          email: string
          folder_id?: string | null
          id?: string
          import_batch_id?: string | null
          industry?: string | null
          last_touched_at?: string | null
          name: string
          next_followup_at?: string | null
          normalized_email?: string | null
          normalized_phone?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          record_type?: string
          score?: number | null
          source_id?: string | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          tags?: string[] | null
          updated_at?: string
          value?: number | null
          vat_number?: string | null
        }
        Update: {
          accounting_synced_at?: string | null
          address?: string | null
          ai_recommendation?: string | null
          ai_recommendation_at?: string | null
          campaign_id?: string | null
          city?: string | null
          company_id?: string
          company_name?: string | null
          conversion_status?: string
          converted_at?: string | null
          converted_customer_id?: string | null
          converted_deal_id?: string | null
          converted_from_lead_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          currency?: string | null
          customer_type?: string | null
          dinero_contact_guid?: string | null
          economic_customer_number?: number | null
          email?: string
          folder_id?: string | null
          id?: string
          import_batch_id?: string | null
          industry?: string | null
          last_touched_at?: string | null
          name?: string
          next_followup_at?: string | null
          normalized_email?: string | null
          normalized_phone?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          record_type?: string
          score?: number | null
          source_id?: string | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          tags?: string[] | null
          updated_at?: string
          value?: number | null
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_converted_customer_id_fkey"
            columns: ["converted_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_converted_deal_id_fkey"
            columns: ["converted_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_converted_from_lead_id_fkey"
            columns: ["converted_from_lead_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "lead_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      cvr_companies: {
        Row: {
          address: string | null
          city: string | null
          company_id: string
          companyform: string | null
          created_at: string
          created_by: string
          cvr: string
          cvr_status: string | null
          email: string | null
          employees: string | null
          id: string
          imported_as_lead: boolean | null
          imported_lead_id: string | null
          industry: string | null
          industrycode: string | null
          name: string
          phone: string | null
          source: string | null
          updated_at: string
          website: string | null
          zipcode: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_id: string
          companyform?: string | null
          created_at?: string
          created_by: string
          cvr: string
          cvr_status?: string | null
          email?: string | null
          employees?: string | null
          id?: string
          imported_as_lead?: boolean | null
          imported_lead_id?: string | null
          industry?: string | null
          industrycode?: string | null
          name: string
          phone?: string | null
          source?: string | null
          updated_at?: string
          website?: string | null
          zipcode?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company_id?: string
          companyform?: string | null
          created_at?: string
          created_by?: string
          cvr?: string
          cvr_status?: string | null
          email?: string | null
          employees?: string | null
          id?: string
          imported_as_lead?: boolean | null
          imported_lead_id?: string | null
          industry?: string | null
          industrycode?: string | null
          name?: string
          phone?: string | null
          source?: string | null
          updated_at?: string
          website?: string | null
          zipcode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cvr_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      data_deletion_requests: {
        Row: {
          company_id: string | null
          id: string
          notes: string | null
          processed_at: string | null
          processed_by: string | null
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_deletion_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          currency: string
          customer_id: string | null
          expected_close_date: string | null
          id: string
          notes: string | null
          owner_id: string | null
          stage: string
          title: string
          updated_at: string
          value: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          currency?: string
          customer_id?: string | null
          expected_close_date?: string | null
          id?: string
          notes?: string | null
          owner_id?: string | null
          stage?: string
          title: string
          updated_at?: string
          value?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          currency?: string
          customer_id?: string | null
          expected_close_date?: string | null
          id?: string
          notes?: string | null
          owner_id?: string | null
          stage?: string
          title?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      departments: {
        Row: {
          color: string
          company_id: string
          created_at: string
          created_by: string
          emoji: string | null
          id: string
          location_type: string
          name: string
          updated_at: string
        }
        Insert: {
          color?: string
          company_id: string
          created_at?: string
          created_by: string
          emoji?: string | null
          id?: string
          location_type?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string
          company_id?: string
          created_at?: string
          created_by?: string
          emoji?: string | null
          id?: string
          location_type?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dinero_connections: {
        Row: {
          access_token: string
          company_id: string
          connected_at: string
          connected_by: string | null
          created_at: string
          dinero_organization_id: string
          dinero_organization_name: string | null
          disconnected_at: string | null
          id: string
          last_sync_error: string | null
          last_synced_at: string | null
          refresh_token: string
          status: string
          token_expires_at: string
          updated_at: string
        }
        Insert: {
          access_token: string
          company_id: string
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          dinero_organization_id: string
          dinero_organization_name?: string | null
          disconnected_at?: string | null
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          refresh_token: string
          status?: string
          token_expires_at: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          company_id?: string
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          dinero_organization_id?: string
          dinero_organization_name?: string | null
          disconnected_at?: string | null
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          refresh_token?: string
          status?: string
          token_expires_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dinero_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      economic_connections: {
        Row: {
          agreement_grant_token: string
          agreement_number: number | null
          company_id: string
          company_name: string | null
          connected_at: string
          connected_by: string | null
          created_at: string
          disconnected_at: string | null
          id: string
          last_sync_error: string | null
          last_synced_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agreement_grant_token: string
          agreement_number?: number | null
          company_id: string
          company_name?: string | null
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agreement_grant_token?: string
          agreement_number?: number | null
          company_id?: string
          company_name?: string | null
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "economic_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_accounts: {
        Row: {
          access_token: string
          company_id: string
          connected_at: string
          created_at: string
          email_address: string
          id: string
          last_synced_at: string | null
          provider: string
          refresh_token: string | null
          scopes: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          company_id: string
          connected_at?: string
          created_at?: string
          email_address: string
          id?: string
          last_synced_at?: string | null
          provider?: string
          refresh_token?: string | null
          scopes?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          company_id?: string
          connected_at?: string
          created_at?: string
          email_address?: string
          id?: string
          last_synced_at?: string | null
          provider?: string
          refresh_token?: string | null
          scopes?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaign_jobs: {
        Row: {
          campaign_id: string
          company_id: string
          completed_at: string | null
          configuration: Json
          created_at: string
          created_by: string
          heartbeat_at: string | null
          id: string
          idempotency_key: string
          last_error: string | null
          scheduled_at: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          company_id: string
          completed_at?: string | null
          configuration?: Json
          created_at?: string
          created_by: string
          heartbeat_at?: string | null
          id?: string
          idempotency_key: string
          last_error?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          company_id?: string
          completed_at?: string | null
          configuration?: Json
          created_at?: string
          created_by?: string
          heartbeat_at?: string | null
          id?: string
          idempotency_key?: string
          last_error?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_jobs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "bulk_email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaign_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_delivery_events: {
        Row: {
          company_id: string
          created_at: string
          delivery_job_id: string | null
          event_type: string
          id: string
          occurred_at: string
          payload: Json
          provider_event_id: string
          provider_message_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          delivery_job_id?: string | null
          event_type: string
          id?: string
          occurred_at?: string
          payload?: Json
          provider_event_id: string
          provider_message_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          delivery_job_id?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
          provider_event_id?: string
          provider_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_delivery_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_delivery_events_delivery_job_id_fkey"
            columns: ["delivery_job_id"]
            isOneToOne: false
            referencedRelation: "email_delivery_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_delivery_jobs: {
        Row: {
          attempts: number
          campaign_id: string
          campaign_job_id: string
          company_id: string
          created_at: string
          delivered_at: string | null
          id: string
          last_error: string | null
          lease_expires_at: string | null
          lock_token: string | null
          max_attempts: number
          next_attempt_at: string
          normalized_email: string | null
          payload: Json
          provider_message_id: string | null
          recipient_email: string
          recipient_id: string | null
          recipient_name: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          campaign_id: string
          campaign_job_id: string
          company_id: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          lock_token?: string | null
          max_attempts?: number
          next_attempt_at?: string
          normalized_email?: string | null
          payload?: Json
          provider_message_id?: string | null
          recipient_email: string
          recipient_id?: string | null
          recipient_name?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          campaign_id?: string
          campaign_job_id?: string
          company_id?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          lock_token?: string | null
          max_attempts?: number
          next_attempt_at?: string
          normalized_email?: string | null
          payload?: Json
          provider_message_id?: string | null
          recipient_email?: string
          recipient_id?: string | null
          recipient_name?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_delivery_jobs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "bulk_email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_delivery_jobs_campaign_job_id_fkey"
            columns: ["campaign_job_id"]
            isOneToOne: false
            referencedRelation: "email_campaign_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_delivery_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_delivery_jobs_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "bulk_email_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_suppression_list: {
        Row: {
          company_id: string
          created_by: string | null
          email: string
          id: string
          normalized_email: string | null
          reason: string
          source: string | null
          source_event_id: string | null
          suppressed_at: string
        }
        Insert: {
          company_id: string
          created_by?: string | null
          email: string
          id?: string
          normalized_email?: string | null
          reason: string
          source?: string | null
          source_event_id?: string | null
          suppressed_at?: string
        }
        Update: {
          company_id?: string
          created_by?: string | null
          email?: string
          id?: string
          normalized_email?: string | null
          reason?: string
          source?: string | null
          source_event_id?: string | null
          suppressed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_suppression_list_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          category: string | null
          company_id: string
          created_at: string
          created_by: string
          id: string
          name: string
          subject: string
          updated_at: string
          variables: Json | null
        }
        Insert: {
          body?: string
          category?: string | null
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          name: string
          subject?: string
          updated_at?: string
          variables?: Json | null
        }
        Update: {
          body?: string
          category?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          subject?: string
          updated_at?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      emails: {
        Row: {
          ai_priority: string | null
          ai_suggested_todo: string | null
          body_html: string | null
          body_text: string | null
          cc_addresses: Json | null
          company_id: string
          created_at: string
          email_account_id: string
          from_address: string
          from_name: string | null
          gmail_id: string
          has_attachments: boolean | null
          id: string
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          labels: Json | null
          received_at: string
          snippet: string | null
          subject: string | null
          thread_id: string | null
          to_addresses: Json | null
          user_id: string
        }
        Insert: {
          ai_priority?: string | null
          ai_suggested_todo?: string | null
          body_html?: string | null
          body_text?: string | null
          cc_addresses?: Json | null
          company_id: string
          created_at?: string
          email_account_id: string
          from_address: string
          from_name?: string | null
          gmail_id: string
          has_attachments?: boolean | null
          id?: string
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          labels?: Json | null
          received_at: string
          snippet?: string | null
          subject?: string | null
          thread_id?: string | null
          to_addresses?: Json | null
          user_id: string
        }
        Update: {
          ai_priority?: string | null
          ai_suggested_todo?: string | null
          body_html?: string | null
          body_text?: string | null
          cc_addresses?: Json | null
          company_id?: string
          created_at?: string
          email_account_id?: string
          from_address?: string
          from_name?: string | null
          gmail_id?: string
          has_attachments?: boolean | null
          id?: string
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          labels?: Json | null
          received_at?: string
          snippet?: string | null
          subject?: string | null
          thread_id?: string | null
          to_addresses?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emails_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_email_account_id_fkey"
            columns: ["email_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_profiles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          company_id: string
          created_at: string
          created_by: string | null
          department: string | null
          email: string
          employee_id: string
          full_name: string
          id: string
          is_active: boolean | null
          phone: string | null
          position: string | null
          start_date: string | null
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          email: string
          employee_id: string
          full_name: string
          id?: string
          is_active?: boolean | null
          phone?: string | null
          position?: string | null
          start_date?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          email?: string
          employee_id?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          phone?: string | null
          position?: string | null
          start_date?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      event_subscriptions: {
        Row: {
          action_ref: string | null
          action_type: string
          company_id: string
          config: Json
          created_at: string
          created_by: string | null
          event_pattern: string
          id: string
          is_active: boolean
        }
        Insert: {
          action_ref?: string | null
          action_type: string
          company_id: string
          config?: Json
          created_at?: string
          created_by?: string | null
          event_pattern: string
          id?: string
          is_active?: boolean
        }
        Update: {
          action_ref?: string | null
          action_type?: string
          company_id?: string
          config?: Json
          created_at?: string
          created_by?: string | null
          event_pattern?: string
          id?: string
          is_active?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "event_subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      icp_profiles: {
        Row: {
          budget_level: string | null
          business_types: string[] | null
          company_id: string
          created_at: string
          created_by: string
          description: string | null
          desired_services: string[] | null
          exclude_industries: string[] | null
          exclude_keywords: string[] | null
          id: string
          industry: string[] | null
          is_default: boolean
          max_employees: number | null
          max_revenue: number | null
          min_employees: number | null
          min_revenue: number | null
          must_have_criteria: string[] | null
          name: string
          nice_to_have_criteria: string[] | null
          pain_points: string[] | null
          preferred_languages: string[] | null
          status: string
          sub_industries: string[] | null
          target_cities: string[] | null
          target_countries: string[] | null
          target_regions: string[] | null
          target_roles: string[] | null
          technology_signals: string[] | null
          updated_at: string
          weight_budget_fit: number
          weight_company_size: number
          weight_industry: number
          weight_location: number
          weight_pain_points: number
          weight_role_fit: number
          weight_service_fit: number
        }
        Insert: {
          budget_level?: string | null
          business_types?: string[] | null
          company_id: string
          created_at?: string
          created_by: string
          description?: string | null
          desired_services?: string[] | null
          exclude_industries?: string[] | null
          exclude_keywords?: string[] | null
          id?: string
          industry?: string[] | null
          is_default?: boolean
          max_employees?: number | null
          max_revenue?: number | null
          min_employees?: number | null
          min_revenue?: number | null
          must_have_criteria?: string[] | null
          name: string
          nice_to_have_criteria?: string[] | null
          pain_points?: string[] | null
          preferred_languages?: string[] | null
          status?: string
          sub_industries?: string[] | null
          target_cities?: string[] | null
          target_countries?: string[] | null
          target_regions?: string[] | null
          target_roles?: string[] | null
          technology_signals?: string[] | null
          updated_at?: string
          weight_budget_fit?: number
          weight_company_size?: number
          weight_industry?: number
          weight_location?: number
          weight_pain_points?: number
          weight_role_fit?: number
          weight_service_fit?: number
        }
        Update: {
          budget_level?: string | null
          business_types?: string[] | null
          company_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          desired_services?: string[] | null
          exclude_industries?: string[] | null
          exclude_keywords?: string[] | null
          id?: string
          industry?: string[] | null
          is_default?: boolean
          max_employees?: number | null
          max_revenue?: number | null
          min_employees?: number | null
          min_revenue?: number | null
          must_have_criteria?: string[] | null
          name?: string
          nice_to_have_criteria?: string[] | null
          pain_points?: string[] | null
          preferred_languages?: string[] | null
          status?: string
          sub_industries?: string[] | null
          target_cities?: string[] | null
          target_countries?: string[] | null
          target_regions?: string[] | null
          target_roles?: string[] | null
          technology_signals?: string[] | null
          updated_at?: string
          weight_budget_fit?: number
          weight_company_size?: number
          weight_industry?: number
          weight_location?: number
          weight_pain_points?: number
          weight_role_fit?: number
          weight_service_fit?: number
        }
        Relationships: [
          {
            foreignKeyName: "icp_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      icp_search_jobs: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          error_message: string | null
          filters: Json
          found_count: number
          icp_profile_id: string
          id: string
          progress: number
          progress_label: string | null
          requested_lead_count: number
          scored_count: number
          search_query: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          error_message?: string | null
          filters?: Json
          found_count?: number
          icp_profile_id: string
          id?: string
          progress?: number
          progress_label?: string | null
          requested_lead_count?: number
          scored_count?: number
          search_query?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          error_message?: string | null
          filters?: Json
          found_count?: number
          icp_profile_id?: string
          id?: string
          progress?: number
          progress_label?: string | null
          requested_lead_count?: number
          scored_count?: number
          search_query?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "icp_search_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "icp_search_jobs_icp_profile_id_fkey"
            columns: ["icp_profile_id"]
            isOneToOne: false
            referencedRelation: "icp_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_execution_logs: {
        Row: {
          action_category: string
          agent_id: string | null
          company_id: string
          completed_at: string | null
          error: string | null
          id: string
          integration_id: string | null
          provider: string
          sanitized_input: Json
          started_at: string
          status: string
          tool_slug: string
          user_id: string
        }
        Insert: {
          action_category: string
          agent_id?: string | null
          company_id: string
          completed_at?: string | null
          error?: string | null
          id?: string
          integration_id?: string | null
          provider: string
          sanitized_input?: Json
          started_at?: string
          status?: string
          tool_slug: string
          user_id: string
        }
        Update: {
          action_category?: string
          agent_id?: string | null
          company_id?: string
          completed_at?: string | null
          error?: string | null
          id?: string
          integration_id?: string | null
          provider?: string
          sanitized_input?: Json
          started_at?: string
          status?: string
          tool_slug?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_execution_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_execution_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_execution_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      integrations: {
        Row: {
          account_label: string | null
          company_id: string
          composio_auth_config_id: string | null
          composio_connection_id: string | null
          connected_at: string | null
          connected_by: string | null
          created_at: string
          id: string
          last_sync_at: string | null
          metadata: Json
          provider: string
          scopes: string[] | null
          status: string
          updated_at: string
        }
        Insert: {
          account_label?: string | null
          company_id: string
          composio_auth_config_id?: string | null
          composio_connection_id?: string | null
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          id?: string
          last_sync_at?: string | null
          metadata?: Json
          provider: string
          scopes?: string[] | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_label?: string | null
          company_id?: string
          composio_auth_config_id?: string | null
          composio_connection_id?: string | null
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          id?: string
          last_sync_at?: string | null
          metadata?: Json
          provider?: string
          scopes?: string[] | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          accounting_synced_at: string | null
          amount: number
          company_id: string
          created_at: string
          created_by: string
          customer_country: string | null
          customer_id: string
          customer_type: string | null
          dinero_voucher_guid: string | null
          due_date: string | null
          economic_invoice_number: number | null
          id: string
          invoice_number: string
          issued_at: string | null
          lines: Json | null
          notes: string | null
          paid_at: string | null
          quote_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number | null
          updated_at: string
          vat_amount: number | null
          vat_note: string | null
          vat_rate: number | null
          version: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          accounting_synced_at?: string | null
          amount: number
          company_id: string
          created_at?: string
          created_by: string
          customer_country?: string | null
          customer_id: string
          customer_type?: string | null
          dinero_voucher_guid?: string | null
          due_date?: string | null
          economic_invoice_number?: number | null
          id?: string
          invoice_number: string
          issued_at?: string | null
          lines?: Json | null
          notes?: string | null
          paid_at?: string | null
          quote_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number | null
          updated_at?: string
          vat_amount?: number | null
          vat_note?: string | null
          vat_rate?: number | null
          version?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          accounting_synced_at?: string | null
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string
          customer_country?: string | null
          customer_id?: string
          customer_type?: string | null
          dinero_voucher_guid?: string | null
          due_date?: string | null
          economic_invoice_number?: number | null
          id?: string
          invoice_number?: string
          issued_at?: string | null
          lines?: Json | null
          notes?: string | null
          paid_at?: string | null
          quote_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number | null
          updated_at?: string
          vat_amount?: number | null
          vat_note?: string | null
          vat_rate?: number | null
          version?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_folders: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          created_by: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_folders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_gen_results: {
        Row: {
          active_status: string | null
          address: string | null
          business_email: string | null
          city: string | null
          company_id: string
          company_linkedin: string | null
          company_name: string | null
          contact_person_name: string | null
          contact_role: string | null
          country: string | null
          created_at: string
          description: string | null
          domain_confidence: number | null
          email_confidence: number | null
          email_status: string | null
          email_type: string | null
          employee_count: string | null
          google_maps_url: string | null
          id: string
          imported: boolean
          imported_lead_id: string | null
          industry: string | null
          lead_score: number | null
          linkedin_url: string | null
          metadata: Json | null
          phone: string | null
          rating: number | null
          registration_number: string | null
          review_count: number | null
          session_id: string
          social_links: Json | null
          source_list: string[] | null
          source_registry: string | null
          source_url: string | null
          technologies_detected: string[] | null
          website: string | null
        }
        Insert: {
          active_status?: string | null
          address?: string | null
          business_email?: string | null
          city?: string | null
          company_id: string
          company_linkedin?: string | null
          company_name?: string | null
          contact_person_name?: string | null
          contact_role?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          domain_confidence?: number | null
          email_confidence?: number | null
          email_status?: string | null
          email_type?: string | null
          employee_count?: string | null
          google_maps_url?: string | null
          id?: string
          imported?: boolean
          imported_lead_id?: string | null
          industry?: string | null
          lead_score?: number | null
          linkedin_url?: string | null
          metadata?: Json | null
          phone?: string | null
          rating?: number | null
          registration_number?: string | null
          review_count?: number | null
          session_id: string
          social_links?: Json | null
          source_list?: string[] | null
          source_registry?: string | null
          source_url?: string | null
          technologies_detected?: string[] | null
          website?: string | null
        }
        Update: {
          active_status?: string | null
          address?: string | null
          business_email?: string | null
          city?: string | null
          company_id?: string
          company_linkedin?: string | null
          company_name?: string | null
          contact_person_name?: string | null
          contact_role?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          domain_confidence?: number | null
          email_confidence?: number | null
          email_status?: string | null
          email_type?: string | null
          employee_count?: string | null
          google_maps_url?: string | null
          id?: string
          imported?: boolean
          imported_lead_id?: string | null
          industry?: string | null
          lead_score?: number | null
          linkedin_url?: string | null
          metadata?: Json | null
          phone?: string | null
          rating?: number | null
          registration_number?: string | null
          review_count?: number | null
          session_id?: string
          social_links?: Json | null
          source_list?: string[] | null
          source_registry?: string | null
          source_url?: string | null
          technologies_detected?: string[] | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_gen_results_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_gen_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "lead_gen_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_gen_saved_searches: {
        Row: {
          company_id: string
          created_at: string
          filters: Json
          id: string
          name: string
          query: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          filters?: Json
          id?: string
          name: string
          query: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          query?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_gen_saved_searches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_gen_sessions: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          filters: Json
          id: string
          progress: number
          progress_label: string | null
          query: string
          results_count: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          filters?: Json
          id?: string
          progress?: number
          progress_label?: string | null
          query: string
          results_count?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          filters?: Json
          id?: string
          progress?: number
          progress_label?: string | null
          query?: string
          results_count?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_gen_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_icp_scores: {
        Row: {
          budget_fit_score: number
          company_id: string
          company_size_score: number
          confidence_score: number
          icp_profile_id: string
          id: string
          industry_score: number
          lead_id: string
          location_score: number
          match_reasons: string[] | null
          pain_point_score: number
          recommended_action: string | null
          red_flags: string[] | null
          role_score: number
          scored_at: string
          service_fit_score: number
          tech_fit_score: number
          total_score: number
        }
        Insert: {
          budget_fit_score?: number
          company_id: string
          company_size_score?: number
          confidence_score?: number
          icp_profile_id: string
          id?: string
          industry_score?: number
          lead_id: string
          location_score?: number
          match_reasons?: string[] | null
          pain_point_score?: number
          recommended_action?: string | null
          red_flags?: string[] | null
          role_score?: number
          scored_at?: string
          service_fit_score?: number
          tech_fit_score?: number
          total_score?: number
        }
        Update: {
          budget_fit_score?: number
          company_id?: string
          company_size_score?: number
          confidence_score?: number
          icp_profile_id?: string
          id?: string
          industry_score?: number
          lead_id?: string
          location_score?: number
          match_reasons?: string[] | null
          pain_point_score?: number
          recommended_action?: string | null
          red_flags?: string[] | null
          role_score?: number
          scored_at?: string
          service_fit_score?: number
          tech_fit_score?: number
          total_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_icp_scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_icp_scores_icp_profile_id_fkey"
            columns: ["icp_profile_id"]
            isOneToOne: false
            referencedRelation: "icp_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_icp_scores_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          ai_recommendation: string | null
          ai_recommendation_at: string | null
          city: string | null
          company_id: string
          company_name: string | null
          created_at: string
          created_by: string
          currency: string | null
          email: string
          folder_id: string | null
          id: string
          import_batch_id: string | null
          industry: string | null
          last_touched_at: string | null
          name: string
          next_followup_at: string | null
          notes: string | null
          owner_id: string | null
          phone: string | null
          score: number | null
          status: Database["public"]["Enums"]["lead_status"]
          tags: string[] | null
          updated_at: string
          value: number | null
        }
        Insert: {
          address?: string | null
          ai_recommendation?: string | null
          ai_recommendation_at?: string | null
          city?: string | null
          company_id: string
          company_name?: string | null
          created_at?: string
          created_by: string
          currency?: string | null
          email: string
          folder_id?: string | null
          id?: string
          import_batch_id?: string | null
          industry?: string | null
          last_touched_at?: string | null
          name: string
          next_followup_at?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          score?: number | null
          status?: Database["public"]["Enums"]["lead_status"]
          tags?: string[] | null
          updated_at?: string
          value?: number | null
        }
        Update: {
          address?: string | null
          ai_recommendation?: string | null
          ai_recommendation_at?: string | null
          city?: string | null
          company_id?: string
          company_name?: string | null
          created_at?: string
          created_by?: string
          currency?: string | null
          email?: string
          folder_id?: string | null
          id?: string
          import_batch_id?: string | null
          industry?: string | null
          last_touched_at?: string | null
          name?: string
          next_followup_at?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          score?: number | null
          status?: Database["public"]["Enums"]["lead_status"]
          tags?: string[] | null
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "lead_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          employee_profile_id: string
          end_date: string
          id: string
          reason: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          type: Database["public"]["Enums"]["leave_type"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          employee_profile_id: string
          end_date: string
          id?: string
          reason?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
          type: Database["public"]["Enums"]["leave_type"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          employee_profile_id?: string
          end_date?: string
          id?: string
          reason?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"]
          type?: Database["public"]["Enums"]["leave_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_employee_profile_id_fkey"
            columns: ["employee_profile_id"]
            isOneToOne: false
            referencedRelation: "employee_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_tokens: {
        Row: {
          company_id: string
          created_at: string
          id: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash?: string
          token_prefix?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_tokens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          company_id: string
          content: string
          created_at: string
          id: string
          read: boolean | null
          receiver_id: string
          sender_id: string
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string
          id?: string
          read?: boolean | null
          receiver_id: string
          sender_id: string
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string
          id?: string
          read?: boolean | null
          receiver_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_accounts: {
        Row: {
          account_id: string
          account_name: string | null
          account_status: number | null
          business_id: string | null
          business_name: string | null
          company_id: string
          created_at: string
          currency: string | null
          id: string
          meta_connection_id: string
        }
        Insert: {
          account_id: string
          account_name?: string | null
          account_status?: number | null
          business_id?: string | null
          business_name?: string | null
          company_id: string
          created_at?: string
          currency?: string | null
          id?: string
          meta_connection_id: string
        }
        Update: {
          account_id?: string
          account_name?: string | null
          account_status?: number | null
          business_id?: string | null
          business_name?: string | null
          company_id?: string
          created_at?: string
          currency?: string | null
          id?: string
          meta_connection_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_accounts_meta_connection_id_fkey"
            columns: ["meta_connection_id"]
            isOneToOne: false
            referencedRelation: "meta_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_sets: {
        Row: {
          ad_account_id: string
          campaign_id: string | null
          company_id: string
          daily_budget: number | null
          effective_status: string | null
          id: string
          lifetime_budget: number | null
          meta_ad_set_id: string
          meta_campaign_id: string
          name: string
          optimization_goal: string | null
          raw: Json
          status: string | null
          synced_at: string
          targeting: Json | null
        }
        Insert: {
          ad_account_id: string
          campaign_id?: string | null
          company_id: string
          daily_budget?: number | null
          effective_status?: string | null
          id?: string
          lifetime_budget?: number | null
          meta_ad_set_id: string
          meta_campaign_id: string
          name: string
          optimization_goal?: string | null
          raw?: Json
          status?: string | null
          synced_at?: string
          targeting?: Json | null
        }
        Update: {
          ad_account_id?: string
          campaign_id?: string | null
          company_id?: string
          daily_budget?: number | null
          effective_status?: string | null
          id?: string
          lifetime_budget?: number | null
          meta_ad_set_id?: string
          meta_campaign_id?: string
          name?: string
          optimization_goal?: string | null
          raw?: Json
          status?: string | null
          synced_at?: string
          targeting?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_sets_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_sets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "meta_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_sets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ads: {
        Row: {
          ad_account_id: string
          ad_set_id: string | null
          campaign_id: string | null
          company_id: string
          creative_id: string | null
          effective_status: string | null
          id: string
          meta_ad_id: string
          meta_ad_set_id: string | null
          meta_campaign_id: string | null
          meta_creative_id: string | null
          name: string
          raw: Json
          status: string | null
          synced_at: string
        }
        Insert: {
          ad_account_id: string
          ad_set_id?: string | null
          campaign_id?: string | null
          company_id: string
          creative_id?: string | null
          effective_status?: string | null
          id?: string
          meta_ad_id: string
          meta_ad_set_id?: string | null
          meta_campaign_id?: string | null
          meta_creative_id?: string | null
          name: string
          raw?: Json
          status?: string | null
          synced_at?: string
        }
        Update: {
          ad_account_id?: string
          ad_set_id?: string | null
          campaign_id?: string | null
          company_id?: string
          creative_id?: string | null
          effective_status?: string | null
          id?: string
          meta_ad_id?: string
          meta_ad_set_id?: string | null
          meta_campaign_id?: string | null
          meta_creative_id?: string | null
          name?: string
          raw?: Json
          status?: string | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ads_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ads_ad_set_id_fkey"
            columns: ["ad_set_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "meta_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ads_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "meta_creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_campaigns: {
        Row: {
          ad_account_id: string
          company_id: string
          daily_budget: number | null
          effective_status: string | null
          id: string
          lifetime_budget: number | null
          meta_campaign_id: string
          name: string
          objective: string | null
          raw: Json
          start_time: string | null
          status: string | null
          stop_time: string | null
          synced_at: string
        }
        Insert: {
          ad_account_id: string
          company_id: string
          daily_budget?: number | null
          effective_status?: string | null
          id?: string
          lifetime_budget?: number | null
          meta_campaign_id: string
          name: string
          objective?: string | null
          raw?: Json
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          synced_at?: string
        }
        Update: {
          ad_account_id?: string
          company_id?: string
          daily_budget?: number | null
          effective_status?: string | null
          id?: string
          lifetime_budget?: number | null
          meta_campaign_id?: string
          name?: string
          objective?: string | null
          raw?: Json
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_campaigns_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_connections: {
        Row: {
          access_token: string | null
          access_token_ciphertext: string | null
          company_id: string
          connected_at: string
          created_at: string
          disconnected_at: string | null
          granted_scopes: string[] | null
          id: string
          last_sync_at: string | null
          meta_user_id: string | null
          meta_user_name: string | null
          status: string
          sync_error: string | null
          sync_status: string
          token_expires_at: string | null
          token_iv: string | null
          token_key_version: number
          token_refreshed_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          access_token_ciphertext?: string | null
          company_id: string
          connected_at?: string
          created_at?: string
          disconnected_at?: string | null
          granted_scopes?: string[] | null
          id?: string
          last_sync_at?: string | null
          meta_user_id?: string | null
          meta_user_name?: string | null
          status?: string
          sync_error?: string | null
          sync_status?: string
          token_expires_at?: string | null
          token_iv?: string | null
          token_key_version?: number
          token_refreshed_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          access_token_ciphertext?: string | null
          company_id?: string
          connected_at?: string
          created_at?: string
          disconnected_at?: string | null
          granted_scopes?: string[] | null
          id?: string
          last_sync_at?: string | null
          meta_user_id?: string | null
          meta_user_name?: string | null
          status?: string
          sync_error?: string | null
          sync_status?: string
          token_expires_at?: string | null
          token_iv?: string | null
          token_key_version?: number
          token_refreshed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_creatives: {
        Row: {
          ad_account_id: string
          body: string | null
          company_id: string
          id: string
          image_url: string | null
          meta_creative_id: string
          name: string | null
          object_story_spec: Json | null
          raw: Json
          synced_at: string
          thumbnail_url: string | null
          title: string | null
        }
        Insert: {
          ad_account_id: string
          body?: string | null
          company_id: string
          id?: string
          image_url?: string | null
          meta_creative_id: string
          name?: string | null
          object_story_spec?: Json | null
          raw?: Json
          synced_at?: string
          thumbnail_url?: string | null
          title?: string | null
        }
        Update: {
          ad_account_id?: string
          body?: string | null
          company_id?: string
          id?: string
          image_url?: string | null
          meta_creative_id?: string
          name?: string | null
          object_story_spec?: Json | null
          raw?: Json
          synced_at?: string
          thumbnail_url?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_creatives_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_creatives_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_daily_insights: {
        Row: {
          actions: Json
          ad_account_id: string
          ad_id: string | null
          adset_id: string | null
          campaign_id: string | null
          clicks: number
          company_id: string
          conversions: number
          cpc: number
          cpm: number
          ctr: number
          external_object_id: string
          id: string
          impressions: number
          insight_date: string
          level: string
          raw: Json
          reach: number
          spend: number
          synced_at: string
        }
        Insert: {
          actions?: Json
          ad_account_id: string
          ad_id?: string | null
          adset_id?: string | null
          campaign_id?: string | null
          clicks?: number
          company_id: string
          conversions?: number
          cpc?: number
          cpm?: number
          ctr?: number
          external_object_id: string
          id?: string
          impressions?: number
          insight_date: string
          level: string
          raw?: Json
          reach?: number
          spend?: number
          synced_at?: string
        }
        Update: {
          actions?: Json
          ad_account_id?: string
          ad_id?: string | null
          adset_id?: string | null
          campaign_id?: string | null
          clicks?: number
          company_id?: string
          conversions?: number
          cpc?: number
          cpm?: number
          ctr?: number
          external_object_id?: string
          id?: string
          impressions?: number
          insight_date?: string
          level?: string
          raw?: Json
          reach?: number
          spend?: number
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_daily_insights_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_daily_insights_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_sync_jobs: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          cursor_state: Json
          error_code: string | null
          error_message: string | null
          id: string
          records_synced: number
          requested_by: string | null
          retry_after: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          cursor_state?: Json
          error_code?: string | null
          error_message?: string | null
          id?: string
          records_synced?: number
          requested_by?: string | null
          retry_after?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          cursor_state?: Json
          error_code?: string | null
          error_message?: string | null
          id?: string
          records_synced?: number
          requested_by?: string | null
          retry_after?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_sync_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      module_restrictions: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          id: string
          module: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          module: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          module?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_restrictions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          company_id: string
          created_at: string
          id: string
          link: string | null
          message: string | null
          read: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          company_id: string
          consumed_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          metadata: Json | null
          provider: string
        }
        Insert: {
          company_id: string
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          metadata?: Json | null
          provider: string
        }
        Update: {
          company_id?: string
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          metadata?: Json | null
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_states_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string
          external_reference: string | null
          id: string
          idempotency_key: string | null
          invoice_id: string
          metadata: Json
          paid_at: string | null
          payment_method: string | null
          reversal_reason: string | null
          reversed_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          created_by: string
          external_reference?: string | null
          id?: string
          idempotency_key?: string | null
          invoice_id: string
          metadata?: Json
          paid_at?: string | null
          payment_method?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string
          external_reference?: string | null
          id?: string
          idempotency_key?: string | null
          invoice_id?: string
          metadata?: Json
          paid_at?: string | null
          payment_method?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll: {
        Row: {
          base_salary: number
          bonus: number | null
          company_id: string
          created_at: string
          created_by: string
          deductions: number | null
          employee_profile_id: string
          id: string
          net_salary: number
          paid_at: string | null
          period: string
          status: string | null
        }
        Insert: {
          base_salary: number
          bonus?: number | null
          company_id: string
          created_at?: string
          created_by: string
          deductions?: number | null
          employee_profile_id: string
          id?: string
          net_salary: number
          paid_at?: string | null
          period: string
          status?: string | null
        }
        Update: {
          base_salary?: number
          bonus?: number | null
          company_id?: string
          created_at?: string
          created_by?: string
          deductions?: number | null
          employee_profile_id?: string
          id?: string
          net_salary?: number
          paid_at?: string | null
          period?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_employee_profile_id_fkey"
            columns: ["employee_profile_id"]
            isOneToOne: false
            referencedRelation: "employee_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_call_commands: {
        Row: {
          acknowledged_at: string | null
          company_id: string
          connected_at: string | null
          created_at: string
          delivered_at: string | null
          device_id: string
          display_name: string | null
          ended_at: string | null
          expires_at: string
          failure_code: string | null
          failure_message: string | null
          id: string
          idempotency_key: string
          lead_id: string | null
          metadata: Json
          normalized_phone: string
          phone_number: string
          requires_confirmation: boolean
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          company_id: string
          connected_at?: string | null
          created_at?: string
          delivered_at?: string | null
          device_id: string
          display_name?: string | null
          ended_at?: string | null
          expires_at?: string
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          idempotency_key: string
          lead_id?: string | null
          metadata?: Json
          normalized_phone: string
          phone_number: string
          requires_confirmation?: boolean
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          company_id?: string
          connected_at?: string | null
          created_at?: string
          delivered_at?: string | null
          device_id?: string
          display_name?: string | null
          ended_at?: string | null
          expires_at?: string
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          idempotency_key?: string
          lead_id?: string | null
          metadata?: Json
          normalized_phone?: string
          phone_number?: string
          requires_confirmation?: boolean
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_call_commands_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_call_commands_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "phone_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_call_commands_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_call_events: {
        Row: {
          command_id: string
          company_id: string
          created_at: string
          device_id: string
          event_id: string
          event_type: string
          id: string
          occurred_at: string
          payload: Json
        }
        Insert: {
          command_id: string
          company_id: string
          created_at?: string
          device_id: string
          event_id: string
          event_type: string
          id?: string
          occurred_at?: string
          payload?: Json
        }
        Update: {
          command_id?: string
          company_id?: string
          created_at?: string
          device_id?: string
          event_id?: string
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "phone_call_events_command_id_fkey"
            columns: ["command_id"]
            isOneToOne: false
            referencedRelation: "phone_call_commands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_call_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_call_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "phone_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_devices: {
        Row: {
          app_version: string | null
          capabilities: Json
          company_id: string
          created_at: string
          device_token_hash: string
          display_name: string
          id: string
          last_heartbeat_at: string | null
          last_seen_at: string | null
          os_version: string | null
          paired_at: string
          platform: string
          revoked_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          capabilities?: Json
          company_id: string
          created_at?: string
          device_token_hash: string
          display_name: string
          id?: string
          last_heartbeat_at?: string | null
          last_seen_at?: string | null
          os_version?: string | null
          paired_at?: string
          platform: string
          revoked_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          capabilities?: Json
          company_id?: string
          created_at?: string
          device_token_hash?: string
          display_name?: string
          id?: string
          last_heartbeat_at?: string | null
          last_seen_at?: string | null
          os_version?: string | null
          paired_at?: string
          platform?: string
          revoked_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_identities: {
        Row: {
          company_id: string
          created_at: string
          id: string
          last_otp_sent_at: string | null
          normalized_number: string
          otp_attempts: number
          otp_code_hash: string | null
          otp_expires_at: string | null
          otp_send_count: number
          phone_number: string
          updated_at: string
          user_id: string
          verification_status: string
          verified_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          last_otp_sent_at?: string | null
          normalized_number: string
          otp_attempts?: number
          otp_code_hash?: string | null
          otp_expires_at?: string | null
          otp_send_count?: number
          phone_number: string
          updated_at?: string
          user_id: string
          verification_status?: string
          verified_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          last_otp_sent_at?: string | null
          normalized_number?: string
          otp_attempts?: number
          otp_code_hash?: string | null
          otp_expires_at?: string | null
          otp_send_count?: number
          phone_number?: string
          updated_at?: string
          user_id?: string
          verification_status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phone_identities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_identities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      phone_pairing_rate_limits: {
        Row: {
          attempts: number
          key_hash: string
          updated_at: string
          window_started_at: string
        }
        Insert: {
          attempts?: number
          key_hash: string
          updated_at?: string
          window_started_at?: string
        }
        Update: {
          attempts?: number
          key_hash?: string
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      phone_pairing_sessions: {
        Row: {
          attempts: number
          claimed_at: string | null
          company_id: string
          created_at: string
          device_id: string | null
          expires_at: string
          id: string
          pairing_secret_hash: string
          short_code_hash: string
          user_id: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          company_id: string
          created_at?: string
          device_id?: string | null
          expires_at: string
          id?: string
          pairing_secret_hash: string
          short_code_hash: string
          user_id: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          company_id?: string
          created_at?: string
          device_id?: string | null
          expires_at?: string
          id?: string
          pairing_secret_hash?: string
          short_code_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_pairing_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_pairing_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "phone_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_provisions: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          phone_number: string
          twilio_sid: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          phone_number: string
          twilio_sid?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          phone_number?: string
          twilio_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phone_provisions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          id: string
          name: string
          order_index: number
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
          order_index: number
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          order_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      power_dialer_calls: {
        Row: {
          callback_at: string | null
          company_id: string
          created_at: string
          dialed_at: string
          duration_seconds: number
          handoff_method: string
          id: string
          lead_id: string
          notes: string | null
          outcome: string
          phone_number: string
          platform: string
          user_id: string | null
        }
        Insert: {
          callback_at?: string | null
          company_id: string
          created_at?: string
          dialed_at?: string
          duration_seconds?: number
          handoff_method: string
          id?: string
          lead_id: string
          notes?: string | null
          outcome: string
          phone_number: string
          platform: string
          user_id?: string | null
        }
        Update: {
          callback_at?: string | null
          company_id?: string
          created_at?: string
          dialed_at?: string
          duration_seconds?: number
          handoff_method?: string
          id?: string
          lead_id?: string
          notes?: string | null
          outcome?: string
          phone_number?: string
          platform?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "power_dialer_calls_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "power_dialer_calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "power_dialer_calls_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_phone_connection_id: string | null
          avatar_url: string | null
          company_id: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          onboarding_completed: boolean
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_phone_connection_id?: string | null
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_phone_connection_id?: string | null
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_phone_connection_id_fkey"
            columns: ["active_phone_connection_id"]
            isOneToOne: false
            referencedRelation: "telephony_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          company_id: string
          converted_invoice_id: string | null
          created_at: string
          created_by: string
          customer_id: string | null
          deal_id: string | null
          expired_at: string | null
          id: string
          lead_id: string | null
          lines: Json
          notes: string | null
          rejected_at: string | null
          sent_at: string | null
          status: string
          subtotal: number
          title: string
          total: number
          updated_at: string
          valid_until: string | null
          vat_amount: number
          vat_rate: number
          version: number
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          converted_invoice_id?: string | null
          created_at?: string
          created_by: string
          customer_id?: string | null
          deal_id?: string | null
          expired_at?: string | null
          id?: string
          lead_id?: string | null
          lines?: Json
          notes?: string | null
          rejected_at?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          title: string
          total?: number
          updated_at?: string
          valid_until?: string | null
          vat_amount?: number
          vat_rate?: number
          version?: number
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          converted_invoice_id?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          deal_id?: string | null
          expired_at?: string | null
          id?: string
          lead_id?: string | null
          lines?: Json
          notes?: string | null
          rejected_at?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          title?: string
          total?: number
          updated_at?: string
          valid_until?: string | null
          vat_amount?: number
          vat_rate?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_converted_invoice_id_fkey"
            columns: ["converted_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment: {
        Row: {
          applicants_count: number | null
          company_id: string
          created_at: string
          created_by: string
          department: string | null
          description: string | null
          id: string
          position: string
          requirements: string | null
          salary_range: string | null
          status: Database["public"]["Enums"]["recruitment_status"]
          updated_at: string
        }
        Insert: {
          applicants_count?: number | null
          company_id: string
          created_at?: string
          created_by: string
          department?: string | null
          description?: string | null
          id?: string
          position: string
          requirements?: string | null
          salary_range?: string | null
          status?: Database["public"]["Enums"]["recruitment_status"]
          updated_at?: string
        }
        Update: {
          applicants_count?: number | null
          company_id?: string
          created_at?: string
          created_by?: string
          department?: string | null
          description?: string | null
          id?: string
          position?: string
          requirements?: string | null
          salary_range?: string | null
          status?: Database["public"]["Enums"]["recruitment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_lead_filters: {
        Row: {
          company_id: string
          created_at: string
          filters: Json
          id: string
          name: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          filters?: Json
          id?: string
          name: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_lead_filters_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_applications: {
        Row: {
          applied_at: string
          employee_id: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          shift_id: string
          status: string
        }
        Insert: {
          applied_at?: string
          employee_id: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_id: string
          status?: string
        }
        Update: {
          applied_at?: string
          employee_id?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_applications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employee_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_applications_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          assigned_employee_id: string | null
          company_id: string
          created_at: string
          created_by: string
          department_id: string | null
          end_time: string
          id: string
          notes: string | null
          shift_date: string
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_employee_id?: string | null
          company_id: string
          created_at?: string
          created_by: string
          department_id?: string | null
          end_time: string
          id?: string
          notes?: string | null
          shift_date: string
          start_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_employee_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          department_id?: string | null
          end_time?: string
          id?: string
          notes?: string | null
          shift_date?: string
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_assigned_employee_id_fkey"
            columns: ["assigned_employee_id"]
            isOneToOne: false
            referencedRelation: "employee_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          active_user_count: number | null
          billing_cycle: string | null
          company_id: string
          created_at: string
          id: string
          plan_name: string
          price_per_user: number | null
          renewal_at: string | null
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          active_user_count?: number | null
          billing_cycle?: string | null
          company_id: string
          created_at?: string
          id?: string
          plan_name?: string
          price_per_user?: number | null
          renewal_at?: string | null
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          active_user_count?: number | null
          billing_cycle?: string | null
          company_id?: string
          created_at?: string
          id?: string
          plan_name?: string
          price_per_user?: number | null
          renewal_at?: string | null
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          archived: boolean
          assigned_to: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          deal_id: string | null
          description: string | null
          due_date: string | null
          id: string
          lead_id: string | null
          priority: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          assigned_to?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          priority?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          assigned_to?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          priority?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          company_id: string
          created_at: string
          id: string
          manager_user_id: string | null
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          manager_user_id?: string | null
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          manager_user_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      telephony_connections: {
        Row: {
          capabilities: Json
          company_id: string
          created_at: string
          display_number: string | null
          id: string
          label: string | null
          normalized_number: string | null
          phone_identity_id: string | null
          provider_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          capabilities?: Json
          company_id: string
          created_at?: string
          display_number?: string | null
          id?: string
          label?: string | null
          normalized_number?: string | null
          phone_identity_id?: string | null
          provider_type: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          capabilities?: Json
          company_id?: string
          created_at?: string
          display_number?: string | null
          id?: string
          label?: string | null
          normalized_number?: string | null
          phone_identity_id?: string | null
          provider_type?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telephony_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telephony_connections_phone_identity_id_fkey"
            columns: ["phone_identity_id"]
            isOneToOne: false
            referencedRelation: "phone_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telephony_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      telnyx_config: {
        Row: {
          company_id: string
          connection_id: string
          created_at: string
          default_from_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          connection_id: string
          created_at?: string
          default_from_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          connection_id?: string
          created_at?: string
          default_from_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telnyx_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      telnyx_credentials: {
        Row: {
          company_id: string
          created_at: string
          id: string
          telnyx_credential_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          telnyx_credential_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          telnyx_credential_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telnyx_credentials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telnyx_credentials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      telnyx_webhook_events: {
        Row: {
          event_id: string
          received_at: string
        }
        Insert: {
          event_id: string
          received_at?: string
        }
        Update: {
          event_id?: string
          received_at?: string
        }
        Relationships: []
      }
      twilio_accounts: {
        Row: {
          account_sid: string
          account_type: string | null
          api_key_secret: string | null
          api_key_sid: string | null
          auth_token: string | null
          balance: number | null
          balance_currency: string | null
          company_id: string
          created_at: string
          friendly_name: string | null
          id: string
          last_balance_check: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          account_sid: string
          account_type?: string | null
          api_key_secret?: string | null
          api_key_sid?: string | null
          auth_token?: string | null
          balance?: number | null
          balance_currency?: string | null
          company_id: string
          created_at?: string
          friendly_name?: string | null
          id?: string
          last_balance_check?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          account_sid?: string
          account_type?: string | null
          api_key_secret?: string | null
          api_key_sid?: string | null
          auth_token?: string | null
          balance?: number | null
          balance_currency?: string | null
          company_id?: string
          created_at?: string
          friendly_name?: string | null
          id?: string
          last_balance_check?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "twilio_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_quotas: {
        Row: {
          company_id: string
          created_at: string
          id: string
          max_count: number
          period_end: string
          period_start: string
          quota_type: string
          updated_at: string
          used_count: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          max_count?: number
          period_end?: string
          period_start?: string
          quota_type: string
          updated_at?: string
          used_count?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          max_count?: number
          period_end?: string
          period_start?: string
          quota_type?: string
          updated_at?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_quotas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          can_grant_permissions: boolean
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          can_grant_permissions?: boolean
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          can_grant_permissions?: boolean
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          company_id: string
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          started_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          started_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_agents: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          greeting: string | null
          id: string
          is_active: boolean
          language: string
          max_duration_seconds: number
          name: string
          system_prompt: string
          temperature: number
          updated_at: string
          voice: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          greeting?: string | null
          id?: string
          is_active?: boolean
          language?: string
          max_duration_seconds?: number
          name: string
          system_prompt: string
          temperature?: number
          updated_at?: string
          voice?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          greeting?: string | null
          id?: string
          is_active?: boolean
          language?: string
          max_duration_seconds?: number
          name?: string
          system_prompt?: string
          temperature?: number
          updated_at?: string
          voice?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_agents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_call_events: {
        Row: {
          call_id: string
          company_id: string
          content: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          speaker: string | null
          timestamp_ms: number | null
        }
        Insert: {
          call_id: string
          company_id: string
          content?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          speaker?: string | null
          timestamp_ms?: number | null
        }
        Update: {
          call_id?: string
          company_id?: string
          content?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          speaker?: string | null
          timestamp_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_call_events_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "voice_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_call_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_calls: {
        Row: {
          agent_id: string | null
          company_id: string
          cost_usd: number | null
          created_at: string
          created_by: string | null
          duration_seconds: number | null
          ended_at: string | null
          from_number: string | null
          id: string
          lead_id: string | null
          recording_url: string | null
          started_at: string | null
          status: string
          summary: string | null
          to_number: string
          twilio_call_sid: string | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          company_id: string
          cost_usd?: number | null
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          lead_id?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string
          summary?: string | null
          to_number: string
          twilio_call_sid?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          company_id?: string
          cost_usd?: number | null
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          lead_id?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string
          summary?: string | null
          to_number?: string
          twilio_call_sid?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_calls_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "voice_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_calls_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          attempt: number
          company_id: string
          created_at: string
          error_message: string | null
          event: string
          id: string
          payload: Json | null
          response_body: string | null
          status: string
          status_code: number | null
          webhook_id: string
        }
        Insert: {
          attempt?: number
          company_id: string
          created_at?: string
          error_message?: string | null
          event: string
          id?: string
          payload?: Json | null
          response_body?: string | null
          status: string
          status_code?: number | null
          webhook_id: string
        }
        Update: {
          attempt?: number
          company_id?: string
          created_at?: string
          error_message?: string | null
          event?: string
          id?: string
          payload?: Json | null
          response_body?: string | null
          status?: string
          status_code?: number | null
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_logs_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          company_id: string
          created_at: string
          event: string
          fail_count: number
          id: string
          is_active: boolean
          last_triggered_at: string | null
          name: string
          secret_key: string | null
          success_count: number
          updated_at: string
          url: string
        }
        Insert: {
          company_id: string
          created_at?: string
          event: string
          fail_count?: number
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name: string
          secret_key?: string | null
          success_count?: number
          updated_at?: string
          url: string
        }
        Update: {
          company_id?: string
          created_at?: string
          event?: string
          fail_count?: number
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name?: string
          secret_key?: string | null
          success_count?: number
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      work_schedules: {
        Row: {
          break_minutes: number | null
          company_id: string
          created_at: string | null
          created_by: string
          employee_profile_id: string
          end_time: string
          id: string
          is_recurring: boolean | null
          notes: string | null
          recurrence_rule: string | null
          schedule_date: string
          start_time: string
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          break_minutes?: number | null
          company_id: string
          created_at?: string | null
          created_by: string
          employee_profile_id: string
          end_time: string
          id?: string
          is_recurring?: boolean | null
          notes?: string | null
          recurrence_rule?: string | null
          schedule_date: string
          start_time: string
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          break_minutes?: number | null
          company_id?: string
          created_at?: string | null
          created_by?: string
          employee_profile_id?: string
          end_time?: string
          id?: string
          is_recurring?: boolean | null
          notes?: string | null
          recurrence_rule?: string | null
          schedule_date?: string
          start_time?: string
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_schedules_employee_profile_id_fkey"
            columns: ["employee_profile_id"]
            isOneToOne: false
            referencedRelation: "employee_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          action_arguments: Json
          action_capability: string | null
          action_tool_slug: string | null
          action_type: string
          company_id: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          last_error: string | null
          last_run_at: string | null
          payload_fields: string[] | null
          run_count: number
          trigger_event: string
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          action_arguments?: Json
          action_capability?: string | null
          action_tool_slug?: string | null
          action_type?: string
          company_id: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_run_at?: string | null
          payload_fields?: string[] | null
          run_count?: number
          trigger_event: string
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          action_arguments?: Json
          action_capability?: string | null
          action_tool_slug?: string | null
          action_type?: string
          company_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_run_at?: string | null
          payload_fields?: string[] | null
          run_count?: number
          trigger_event?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      workforce_settings: {
        Row: {
          company_id: string
          created_at: string | null
          default_end_time: string | null
          default_start_time: string | null
          id: string
          overtime_threshold_daily: number | null
          track_breaks: boolean | null
          updated_at: string | null
          weekly_hours: number | null
          work_model: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          default_end_time?: string | null
          default_start_time?: string | null
          id?: string
          overtime_threshold_daily?: number | null
          track_breaks?: boolean | null
          updated_at?: string | null
          weekly_hours?: number | null
          work_model?: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          default_end_time?: string | null
          default_start_time?: string | null
          id?: string
          overtime_threshold_daily?: number | null
          track_breaks?: boolean | null
          updated_at?: string | null
          weekly_hours?: number | null
          work_model?: string
        }
        Relationships: [
          {
            foreignKeyName: "workforce_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_events: {
        Row: {
          actor_user_id: string | null
          company_id: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          payload: Json
          source_module: string
          type: string
        }
        Insert: {
          actor_user_id?: string | null
          company_id: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json
          source_module: string
          type: string
        }
        Update: {
          actor_user_id?: string | null
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json
          source_module?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { invite_token: string }; Returns: string }
      activate_company: { Args: { _company_id: string }; Returns: boolean }
      bootstrap_company_admin: {
        Args: { _company_id: string }
        Returns: undefined
      }
      bootstrap_company_profile: {
        Args: { _company_id: string; _full_name: string }
        Returns: undefined
      }
      can_grant_shift_permissions: {
        Args: { _user_id: string }
        Returns: boolean
      }
      can_manage_shifts: { Args: { _user_id: string }; Returns: boolean }
      check_usage_quota: {
        Args: { _company_id: string; _quota_type: string }
        Returns: boolean
      }
      claim_ai_action_execution: {
        Args: {
          p_action_id: string
          p_allow_retry?: boolean
          p_approved_by: string
          p_company_id: string
        }
        Returns: {
          action_id: string
          action_type: string
          approved_at: string | null
          approved_by: string | null
          attempt_count: number
          category: string
          company_id: string
          confirmation_required: boolean
          connector: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          executed_at: string | null
          execution_function: string | null
          execution_payload: Json | null
          failure_reason: string | null
          headline: string
          id: string
          idempotency_key: string | null
          last_attempt_at: string | null
          metadata: Json
          payload: Json | null
          preview: Json
          rationale: string | null
          rejected_at: string | null
          required_permission: string
          result: Json | null
          reviewed_by: string | null
          risk_level: string
          status: string
          suggested_by: string | null
          triggered_by_event: string | null
          updated_at: string
          user_id: string
          verification: Json | null
        }
        SetofOptions: {
          from: "*"
          to: "autopilot_actions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_email_delivery_jobs: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          campaign_id: string
          campaign_job_id: string
          company_id: string
          delivery_id: string
          lock_token: string
          payload: Json
          recipient_email: string
          recipient_id: string
          recipient_name: string
          sender_user_id: string
        }[]
      }
      cleanup_old_sessions: { Args: never; Returns: number }
      complete_email_delivery: {
        Args: {
          p_delivery_id: string
          p_error?: string
          p_lock_token: string
          p_provider_message_id?: string
          p_status: string
        }
        Returns: Json
      }
      consume_phone_pairing_attempt: {
        Args: { p_key_hash: string }
        Returns: boolean
      }
      control_email_campaign: {
        Args: { p_action: string; p_job_id: string }
        Returns: Json
      }
      convert_lead_to_deal: {
        Args: {
          p_currency?: string
          p_deal_name: string
          p_lead_id: string
          p_pipeline_stage_id?: string
          p_value?: number
        }
        Returns: {
          customer_id: string
          deal_id: string
          dedupe_result: string
          lead_id: string
        }[]
      }
      create_invitation: {
        Args: {
          invite_email: string
          invite_role?: Database["public"]["Enums"]["app_role"]
        }
        Returns: string
      }
      create_phone_call_command: {
        Args: {
          p_device_id: string
          p_display_name?: string
          p_idempotency_key?: string
          p_lead_id?: string
          p_metadata?: Json
          p_phone_number: string
        }
        Returns: Json
      }
      create_phone_pairing_session: { Args: never; Returns: Json }
      delete_draft_invoice: { Args: { p_invoice_id: string }; Returns: boolean }
      emit_workspace_event: {
        Args: {
          _actor: string
          _company_id: string
          _entity_id: string
          _entity_type: string
          _payload: Json
          _source: string
          _type: string
        }
        Returns: string
      }
      enqueue_email_campaign: {
        Args: {
          p_campaign_id: string
          p_from_email?: string
          p_from_name?: string
          p_html_body: string
          p_idempotency_key: string
          p_max_attempts?: number
          p_reply_to?: string
          p_scheduled_at?: string
          p_text_body?: string
        }
        Returns: Json
      }
      find_contact_duplicates: {
        Args: { p_email: string; p_phone: string; p_workspace_id: string }
        Returns: {
          confidence: string
          customer_id: string
          email: string
          match_type: string
          name: string
          phone: string
          record_type: string
        }[]
      }
      generate_activation_code: { Args: never; Returns: string }
      generate_employee_id: {
        Args: { company_prefix?: string }
        Returns: string
      }
      generate_invoice_number: {
        Args: { _company_id: string }
        Returns: string
      }
      get_active_webhooks_for_event: {
        Args: { _company_id: string; _event: string }
        Returns: {
          id: string
          secret_key: string
          url: string
        }[]
      }
      get_ambient_insights: { Args: never; Returns: Json }
      get_company_by_activation_code: {
        Args: { _code: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      get_company_for_user: {
        Args: { _company_id: string }
        Returns: {
          address: string
          company_size: string
          compliance_checklist: Json
          created_at: string
          cvr: string
          email: string
          id: string
          industry: string
          logo_url: string
          mode: string
          name: string
          onboarding_completed: boolean
          onboarding_step: number
          phone: string
          purchased_seats: number
          seat_limit_trial: number
          status: string
          subscription_status: string
          trial_ends_at: string
          updated_at: string
          website: string
        }[]
      }
      get_company_safe: {
        Args: { _company_id: string }
        Returns: {
          company_size: string
          id: string
          industry: string
          logo_url: string
          mode: string
          name: string
          status: string
        }[]
      }
      get_company_status: {
        Args: { _company_id: string }
        Returns: {
          compliance_checklist: Json
          mode: string
          status: string
        }[]
      }
      get_dashboard_summary: { Args: never; Returns: Json }
      get_invitation_by_token: {
        Args: { _token: string }
        Returns: {
          company_name: string
          email: string
          expires_at: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
        }[]
      }
      get_meta_connection_status: { Args: never; Returns: Json }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_campaign_opens: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      increment_campaign_replies: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      increment_campaign_unsubs: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      increment_usage_quota: {
        Args: { _amount?: number; _company_id: string; _quota_type: string }
        Returns: boolean
      }
      is_company_admin: { Args: { _user_id: string }; Returns: boolean }
      issue_mcp_token: {
        Args: { _name: string }
        Returns: {
          id: string
          prefix: string
          token: string
        }[]
      }
      join_company_by_code: { Args: { _code: string }; Returns: string }
      list_leads: {
        Args: {
          p_campaign_id?: string
          p_folder_id?: string
          p_industry?: string
          p_owner_id?: string
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_sort_direction?: string
          p_sort_field?: string
          p_source_id?: string
          p_status?: string
          p_tag_logic?: string
          p_tags?: string[]
        }
        Returns: Json
      }
      log_activity: {
        Args: {
          _action_type: string
          _company_id: string
          _description?: string
          _entity_id?: string
          _entity_type?: string
          _metadata?: Json
          _user_id: string
        }
        Returns: undefined
      }
      log_power_dialer_call: {
        Args: {
          _callback_at?: string
          _duration_seconds?: number
          _handoff_method?: string
          _lead_id: string
          _notes?: string
          _outcome: string
          _phone_number: string
          _platform?: string
        }
        Returns: string
      }
      normalize_phone_number: { Args: { p_phone: string }; Returns: string }
      quote_to_invoice: {
        Args: {
          p_due_date?: string
          p_invoice_number: string
          p_quote_id: string
        }
        Returns: Json
      }
      record_email_delivery_event: {
        Args: {
          p_company_id: string
          p_event_type: string
          p_occurred_at?: string
          p_payload?: Json
          p_provider_event_id: string
          p_provider_message_id: string
        }
        Returns: Json
      }
      regenerate_activation_code: {
        Args: { _company_id: string }
        Returns: string
      }
      register_invoice_payment: {
        Args: {
          p_amount: number
          p_external_reference?: string
          p_idempotency_key?: string
          p_invoice_id: string
          p_metadata?: Json
          p_paid_at?: string
          p_payment_method: string
        }
        Returns: Json
      }
      resolve_mcp_token: {
        Args: { _token: string }
        Returns: {
          company_id: string
          token_id: string
          user_id: string
        }[]
      }
      revoke_invitation: { Args: { invitation_id: string }; Returns: boolean }
      revoke_phone_device: { Args: { p_device_id: string }; Returns: boolean }
      set_company_mode: {
        Args: { _company_id: string; _mode: string }
        Returns: boolean
      }
      transition_quote: {
        Args: {
          p_expected_version?: number
          p_quote_id: string
          p_target_status: string
        }
        Returns: Json
      }
      update_compliance_item: {
        Args: { _company_id: string; _item: string; _value: boolean }
        Returns: Json
      }
      update_webhook_counters: {
        Args: { _success: boolean; _webhook_id: string }
        Returns: undefined
      }
      validate_activation_code: { Args: { _code: string }; Returns: string }
      void_invoice: {
        Args: {
          p_expected_version?: number
          p_invoice_id: string
          p_reason: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "system_admin"
        | "company_admin"
        | "manager"
        | "employee"
        | "readonly"
        | "partner"
        | "owner"
      invoice_status: "draft" | "sent" | "paid" | "overdue" | "cancelled"
      lead_status:
        | "new"
        | "contacted"
        | "qualified"
        | "unqualified"
        | "customer"
      leave_status: "pending" | "approved" | "rejected"
      leave_type: "vacation" | "sick" | "personal" | "other"
      payment_status: "pending" | "completed" | "failed"
      recruitment_status: "open" | "interviewing" | "closed" | "filled"
      task_status: "pending" | "in_progress" | "completed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: [
        "system_admin",
        "company_admin",
        "manager",
        "employee",
        "readonly",
        "partner",
        "owner",
      ],
      invoice_status: ["draft", "sent", "paid", "overdue", "cancelled"],
      lead_status: ["new", "contacted", "qualified", "unqualified", "customer"],
      leave_status: ["pending", "approved", "rejected"],
      leave_type: ["vacation", "sick", "personal", "other"],
      payment_status: ["pending", "completed", "failed"],
      recruitment_status: ["open", "interviewing", "closed", "filled"],
      task_status: ["pending", "in_progress", "completed"],
    },
  },
} as const
