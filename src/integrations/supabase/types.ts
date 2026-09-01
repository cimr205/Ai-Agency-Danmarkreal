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
    PostgrestVersion: "14.15"
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
          category: string
          company_id: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          executed_at: string | null
          execution_function: string | null
          execution_payload: Json | null
          headline: string
          id: string
          payload: Json | null
          rationale: string | null
          result: Json | null
          reviewed_by: string | null
          status: string
          suggested_by: string | null
          triggered_by_event: string | null
          user_id: string
        }
        Insert: {
          action_id: string
          action_type: string
          category: string
          company_id: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          executed_at?: string | null
          execution_function?: string | null
          execution_payload?: Json | null
          headline: string
          id?: string
          payload?: Json | null
          rationale?: string | null
          result?: Json | null
          reviewed_by?: string | null
          status?: string
          suggested_by?: string | null
          triggered_by_event?: string | null
          user_id: string
        }
        Update: {
          action_id?: string
          action_type?: string
          category?: string
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          executed_at?: string | null
          execution_function?: string | null
          execution_payload?: Json | null
          headline?: string
          id?: string
          payload?: Json | null
          rationale?: string | null
          result?: Json | null
          reviewed_by?: string | null
          status?: string
          suggested_by?: string | null
          triggered_by_event?: string | null
          user_id?: string
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
          company_id: string
          completed_at: string | null
          created_at: string
          id: string
          status: string
          subject: string
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
          company_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          status?: string
          subject: string
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
          company_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          status?: string
          subject?: string
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
      customers: {
        Row: {
          accounting_synced_at: string | null
          address: string | null
          ai_recommendation: string | null
          ai_recommendation_at: string | null
          city: string | null
          company_id: string
          campaign_id: string | null
          company_name: string | null
          conversion_status: string
          converted_at: string | null
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
      integrations: {
        Row: {
          account_label: string | null
          company_id: string
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
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number | null
          updated_at: string
          vat_amount: number | null
          vat_note: string | null
          vat_rate: number | null
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
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number | null
          updated_at?: string
          vat_amount?: number | null
          vat_note?: string | null
          vat_rate?: number | null
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
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number | null
          updated_at?: string
          vat_amount?: number | null
          vat_note?: string | null
          vat_rate?: number | null
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
      meta_connections: {
        Row: {
          access_token: string
          company_id: string
          connected_at: string
          created_at: string
          disconnected_at: string | null
          id: string
          meta_user_id: string | null
          meta_user_name: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          company_id: string
          connected_at?: string
          created_at?: string
          disconnected_at?: string | null
          id?: string
          meta_user_id?: string | null
          meta_user_name?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          company_id?: string
          connected_at?: string
          created_at?: string
          disconnected_at?: string | null
          id?: string
          meta_user_id?: string | null
          meta_user_name?: string | null
          status?: string
          token_expires_at?: string | null
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
      openai_accounts: {
        Row: {
          api_key: string
          company_id: string
          connected_by: string | null
          created_at: string
          id: string
          last_error: string | null
          last_tested_at: string | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          api_key: string
          company_id: string
          connected_by?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_tested_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          company_id?: string
          connected_by?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_tested_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "openai_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
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
          id: string
          invoice_id: string
          paid_at: string | null
          payment_method: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          invoice_id: string
          paid_at?: string | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          invoice_id?: string
          paid_at?: string | null
          payment_method?: string | null
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
        ]
      }
      profiles: {
        Row: {
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
          company_id: string
          created_at: string
          created_by: string
          deal_id: string | null
          id: string
          lead_id: string | null
          lines: Json
          notes: string | null
          status: string
          subtotal: number
          title: string
          total: number
          updated_at: string
          valid_until: string | null
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          deal_id?: string | null
          id?: string
          lead_id?: string | null
          lines?: Json
          notes?: string | null
          status?: string
          subtotal?: number
          title: string
          total?: number
          updated_at?: string
          valid_until?: string | null
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          deal_id?: string | null
          id?: string
          lead_id?: string | null
          lines?: Json
          notes?: string | null
          status?: string
          subtotal?: number
          title?: string
          total?: number
          updated_at?: string
          valid_until?: string | null
          vat_amount?: number
          vat_rate?: number
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
      twilio_accounts: {
        Row: {
          account_sid: string
          account_type: string | null
          auth_token: string
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
          auth_token: string
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
          auth_token?: string
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
      verified_caller_ids: {
        Row: {
          company_id: string
          created_at: string
          id: string
          phone_number: string
          status: string
          twilio_caller_id_sid: string | null
          twilio_validation_sid: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          phone_number: string
          status?: string
          twilio_caller_id_sid?: string | null
          twilio_validation_sid?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          phone_number?: string
          status?: string
          twilio_caller_id_sid?: string | null
          twilio_validation_sid?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verified_caller_ids_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_caller_ids_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
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
      cleanup_old_sessions: { Args: never; Returns: number }
      convert_lead_to_deal: {
        Args: {
          p_lead_id: string
          p_deal_name: string
          p_pipeline_stage_id?: string | null
          p_value?: number | null
          p_currency?: string
        }
        Returns: {
          lead_id: string
          customer_id: string
          deal_id: string
          dedupe_result: string
        }[]
      }
      create_invitation: {
        Args: {
          invite_email: string
          invite_role?: Database["public"]["Enums"]["app_role"]
        }
        Returns: string
      }
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
      find_contact_duplicates: {
        Args: { p_email: string | null; p_phone: string | null; p_workspace_id: string }
        Returns: {
          match_type: string
          confidence: string
          customer_id: string
          record_type: string
          name: string
          email: string
          phone: string | null
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
          _callback_at?: string | null
          _duration_seconds?: number
          _handoff_method?: string
          _lead_id: string
          _notes?: string | null
          _outcome: string
          _phone_number: string
          _platform?: string
        }
        Returns: string
      }
      regenerate_activation_code: {
        Args: { _company_id: string }
        Returns: string
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
      set_company_mode: {
        Args: { _company_id: string; _mode: string }
        Returns: boolean
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
