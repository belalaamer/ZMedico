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
      allowed_signup_emails: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"] | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"] | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"] | null
        }
        Relationships: []
      }
      appointment_settings: {
        Row: {
          allow_online_booking: boolean
          auto_confirm_after_minutes: number | null
          branch_id: string | null
          buffer_minutes: number
          cancellation_deadline_hours: number
          created_at: string
          id: string
          max_appointments_per_slot: number
          max_future_booking_days: number
          min_advance_booking_hours: number
          reminder_hours_before: number[]
          require_confirmation: boolean
          slot_duration_minutes: number
          updated_at: string
        }
        Insert: {
          allow_online_booking?: boolean
          auto_confirm_after_minutes?: number | null
          branch_id?: string | null
          buffer_minutes?: number
          cancellation_deadline_hours?: number
          created_at?: string
          id?: string
          max_appointments_per_slot?: number
          max_future_booking_days?: number
          min_advance_booking_hours?: number
          reminder_hours_before?: number[]
          require_confirmation?: boolean
          slot_duration_minutes?: number
          updated_at?: string
        }
        Update: {
          allow_online_booking?: boolean
          auto_confirm_after_minutes?: number | null
          branch_id?: string | null
          buffer_minutes?: number
          cancellation_deadline_hours?: number
          created_at?: string
          id?: string
          max_appointments_per_slot?: number
          max_future_booking_days?: number
          min_advance_booking_hours?: number
          reminder_hours_before?: number[]
          require_confirmation?: boolean
          slot_duration_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          branch_id: string | null
          checked_in_at: string | null
          created_at: string
          deleted_at: string | null
          doctor_id: string | null
          duration_minutes: number
          id: string
          is_walk_in: boolean
          notes: string | null
          patient_id: string
          priority: number
          procedure: string | null
          room: string | null
          scheduled_at: string
          started_at: string | null
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          checked_in_at?: string | null
          created_at?: string
          deleted_at?: string | null
          doctor_id?: string | null
          duration_minutes?: number
          id?: string
          is_walk_in?: boolean
          notes?: string | null
          patient_id: string
          priority?: number
          procedure?: string | null
          room?: string | null
          scheduled_at: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          checked_in_at?: string | null
          created_at?: string
          deleted_at?: string | null
          doctor_id?: string | null
          duration_minutes?: number
          id?: string
          is_walk_in?: boolean
          notes?: string | null
          patient_id?: string
          priority?: number
          procedure?: string | null
          room?: string | null
          scheduled_at?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          branch_id: string | null
          check_in_accuracy: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_method:
            | Database["public"]["Enums"]["attendance_method"]
            | null
          check_in_reason: string | null
          check_in_time: string | null
          check_out_accuracy: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_method:
            | Database["public"]["Enums"]["attendance_method"]
            | null
          check_out_time: string | null
          created_at: string
          created_by: string | null
          date: string
          id: string
          is_within_branch_radius: boolean | null
          notes: string | null
          overtime_hours: number
          staff_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          working_hours: number | null
        }
        Insert: {
          branch_id?: string | null
          check_in_accuracy?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_method?:
            | Database["public"]["Enums"]["attendance_method"]
            | null
          check_in_reason?: string | null
          check_in_time?: string | null
          check_out_accuracy?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_method?:
            | Database["public"]["Enums"]["attendance_method"]
            | null
          check_out_time?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          is_within_branch_radius?: boolean | null
          notes?: string | null
          overtime_hours?: number
          staff_id: string
          status?: Database["public"]["Enums"]["attendance_status"]
          working_hours?: number | null
        }
        Update: {
          branch_id?: string | null
          check_in_accuracy?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_method?:
            | Database["public"]["Enums"]["attendance_method"]
            | null
          check_in_reason?: string | null
          check_in_time?: string | null
          check_out_accuracy?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_method?:
            | Database["public"]["Enums"]["attendance_method"]
            | null
          check_out_time?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          is_within_branch_radius?: boolean | null
          notes?: string | null
          overtime_hours?: number
          staff_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          working_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_export_presets: {
        Row: {
          action: string
          branch_id: string
          created_at: string
          id: string
          name: string
          ref: string
          scope_branch: boolean
          updated_at: string
          user_filter: string
          user_id: string
        }
        Insert: {
          action?: string
          branch_id: string
          created_at?: string
          id?: string
          name: string
          ref?: string
          scope_branch?: boolean
          updated_at?: string
          user_filter?: string
          user_id: string
        }
        Update: {
          action?: string
          branch_id?: string
          created_at?: string
          id?: string
          name?: string
          ref?: string
          scope_branch?: boolean
          updated_at?: string
          user_filter?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_export_presets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          branch_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          branch_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          branch_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          allowed_latitude: number | null
          allowed_longitude: number | null
          allowed_radius: number
          city: string | null
          code: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          is_main_branch: boolean
          manager_id: string | null
          name_ar: string
          name_en: string
          phone: string | null
          updated_at: string
          working_hours_end: string | null
          working_hours_start: string | null
        }
        Insert: {
          address?: string | null
          allowed_latitude?: number | null
          allowed_longitude?: number | null
          allowed_radius?: number
          city?: string | null
          code?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_main_branch?: boolean
          manager_id?: string | null
          name_ar: string
          name_en: string
          phone?: string | null
          updated_at?: string
          working_hours_end?: string | null
          working_hours_start?: string | null
        }
        Update: {
          address?: string | null
          allowed_latitude?: number | null
          allowed_longitude?: number | null
          allowed_radius?: number
          city?: string | null
          code?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_main_branch?: boolean
          manager_id?: string | null
          name_ar?: string
          name_en?: string
          phone?: string | null
          updated_at?: string
          working_hours_end?: string | null
          working_hours_start?: string | null
        }
        Relationships: []
      }
      clinic_profile: {
        Row: {
          address_ar: string | null
          address_en: string | null
          branch_id: string | null
          city: string | null
          clinic_name_ar: string
          clinic_name_en: string
          commercial_registration_number: string | null
          country: string | null
          created_at: string
          description_ar: string | null
          description_en: string | null
          email: string | null
          favicon_url: string | null
          google_maps_url: string | null
          id: string
          logo_url: string | null
          phone: string | null
          phone_secondary: string | null
          postal_code: string | null
          social_facebook: string | null
          social_instagram: string | null
          social_twitter: string | null
          social_whatsapp: string | null
          social_youtube: string | null
          tagline_ar: string | null
          tagline_en: string | null
          tax_registration_number: string | null
          updated_at: string
          website: string | null
          working_days: number[]
          working_hours_end: string
          working_hours_start: string
        }
        Insert: {
          address_ar?: string | null
          address_en?: string | null
          branch_id?: string | null
          city?: string | null
          clinic_name_ar?: string
          clinic_name_en?: string
          commercial_registration_number?: string | null
          country?: string | null
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          email?: string | null
          favicon_url?: string | null
          google_maps_url?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          phone_secondary?: string | null
          postal_code?: string | null
          social_facebook?: string | null
          social_instagram?: string | null
          social_twitter?: string | null
          social_whatsapp?: string | null
          social_youtube?: string | null
          tagline_ar?: string | null
          tagline_en?: string | null
          tax_registration_number?: string | null
          updated_at?: string
          website?: string | null
          working_days?: number[]
          working_hours_end?: string
          working_hours_start?: string
        }
        Update: {
          address_ar?: string | null
          address_en?: string | null
          branch_id?: string | null
          city?: string | null
          clinic_name_ar?: string
          clinic_name_en?: string
          commercial_registration_number?: string | null
          country?: string | null
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          email?: string | null
          favicon_url?: string | null
          google_maps_url?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          phone_secondary?: string | null
          postal_code?: string | null
          social_facebook?: string | null
          social_instagram?: string | null
          social_twitter?: string | null
          social_whatsapp?: string | null
          social_youtube?: string | null
          tagline_ar?: string | null
          tagline_en?: string | null
          tax_registration_number?: string | null
          updated_at?: string
          website?: string | null
          working_days?: number[]
          working_hours_end?: string
          working_hours_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_profile_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_settings: {
        Row: {
          branch_id: string | null
          created_at: string
          description_ar: string | null
          description_en: string | null
          id: string
          is_public: boolean
          setting_key: string
          setting_type: Database["public"]["Enums"]["setting_value_type"]
          setting_value: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_public?: boolean
          setting_key: string
          setting_type?: Database["public"]["Enums"]["setting_value_type"]
          setting_value?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_public?: boolean
          setting_key?: string
          setting_type?: Database["public"]["Enums"]["setting_value_type"]
          setting_value?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_templates: {
        Row: {
          body_ar: string
          body_en: string
          branch_id: string
          channel: string
          created_at: string
          enabled: boolean
          event_type: string
          hours_before: number | null
          id: string
          updated_at: string
        }
        Insert: {
          body_ar?: string
          body_en?: string
          branch_id: string
          channel: string
          created_at?: string
          enabled?: boolean
          event_type: string
          hours_before?: number | null
          id?: string
          updated_at?: string
        }
        Update: {
          body_ar?: string
          body_en?: string
          branch_id?: string
          channel?: string
          created_at?: string
          enabled?: boolean
          event_type?: string
          hours_before?: number | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_templates_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          branch_id: string | null
          coupon_id: string
          created_at: string
          discount_amount: number
          id: string
          invoice_id: string | null
          patient_id: string | null
          redeemed_by: string | null
        }
        Insert: {
          branch_id?: string | null
          coupon_id: string
          created_at?: string
          discount_amount: number
          id?: string
          invoice_id?: string | null
          patient_id?: string | null
          redeemed_by?: string | null
        }
        Update: {
          branch_id?: string | null
          coupon_id?: string
          created_at?: string
          discount_amount?: number
          id?: string
          invoice_id?: string | null
          patient_id?: string | null
          redeemed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          branch_id: string | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          is_active: boolean
          max_discount_amount: number | null
          min_order_amount: number | null
          notes: string | null
          starts_at: string | null
          updated_at: string
          usage_count: number
          usage_limit: number | null
        }
        Insert: {
          branch_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type: string
          discount_value: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_discount_amount?: number | null
          min_order_amount?: number | null
          notes?: string | null
          starts_at?: string | null
          updated_at?: string
          usage_count?: number
          usage_limit?: number | null
        }
        Update: {
          branch_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_discount_amount?: number | null
          min_order_amount?: number | null
          notes?: string | null
          starts_at?: string | null
          updated_at?: string
          usage_count?: number
          usage_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      dental_chart: {
        Row: {
          created_at: string
          id: string
          last_updated_by: string | null
          notes: string | null
          patient_id: string
          status: Database["public"]["Enums"]["tooth_status"]
          tooth_name_ar: string | null
          tooth_name_en: string | null
          tooth_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_updated_by?: string | null
          notes?: string | null
          patient_id: string
          status?: Database["public"]["Enums"]["tooth_status"]
          tooth_name_ar?: string | null
          tooth_name_en?: string | null
          tooth_number: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_updated_by?: string | null
          notes?: string | null
          patient_id?: string
          status?: Database["public"]["Enums"]["tooth_status"]
          tooth_name_ar?: string | null
          tooth_name_en?: string | null
          tooth_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dental_chart_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dental_chart_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          branch_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          manager_id: string | null
          name_ar: string
          name_en: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name_ar: string
          name_en: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name_ar?: string
          name_en?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnoses: {
        Row: {
          category: string | null
          code: string
          created_at: string
          deleted_at: string | null
          description_ar: string | null
          description_en: string | null
          id: string
          name_ar: string
          name_en: string
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          id?: string
          name_ar: string
          name_en: string
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          id?: string
          name_ar?: string
          name_en?: string
        }
        Relationships: []
      }
      doctor_commissions: {
        Row: {
          base_amount: number
          branch_id: string | null
          collected_amount: number
          commission_amount: number
          commission_percent: number
          created_at: string
          doctor_id: string
          id: string
          medical_record_id: string
          paid_at: string | null
          patient_id: string | null
          payroll_id: string | null
          procedure_id: string | null
          record_procedure_id: string
          status: Database["public"]["Enums"]["commission_status"]
          updated_at: string
        }
        Insert: {
          base_amount?: number
          branch_id?: string | null
          collected_amount?: number
          commission_amount?: number
          commission_percent?: number
          created_at?: string
          doctor_id: string
          id?: string
          medical_record_id: string
          paid_at?: string | null
          patient_id?: string | null
          payroll_id?: string | null
          procedure_id?: string | null
          record_procedure_id: string
          status?: Database["public"]["Enums"]["commission_status"]
          updated_at?: string
        }
        Update: {
          base_amount?: number
          branch_id?: string | null
          collected_amount?: number
          commission_amount?: number
          commission_percent?: number
          created_at?: string
          doctor_id?: string
          id?: string
          medical_record_id?: string
          paid_at?: string | null
          patient_id?: string | null
          payroll_id?: string | null
          procedure_id?: string | null
          record_procedure_id?: string
          status?: Database["public"]["Enums"]["commission_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_commissions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_commissions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_commissions_medical_record_id_fkey"
            columns: ["medical_record_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_commissions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_commissions_payroll_id_fkey"
            columns: ["payroll_id"]
            isOneToOne: false
            referencedRelation: "payroll"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_commissions_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_commissions_record_procedure_id_fkey"
            columns: ["record_procedure_id"]
            isOneToOne: true
            referencedRelation: "record_procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_ar: string
          body_en: string
          created_at: string
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          subject_ar: string
          subject_en: string
          template_key: string
          updated_at: string
          variables: string[] | null
        }
        Insert: {
          body_ar?: string
          body_en?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          subject_ar?: string
          subject_en?: string
          template_key: string
          updated_at?: string
          variables?: string[] | null
        }
        Update: {
          body_ar?: string
          body_en?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          subject_ar?: string
          subject_en?: string
          template_key?: string
          updated_at?: string
          variables?: string[] | null
        }
        Relationships: []
      }
      employee_id_counter: {
        Row: {
          id: number
          last_value: number
        }
        Insert: {
          id?: number
          last_value?: number
        }
        Update: {
          id?: number
          last_value?: number
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          name_ar: string
          name_en: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          name_ar: string
          name_en: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          branch_id: string
          category_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description_ar: string | null
          description_en: string
          expense_date: string
          id: string
          payment_method: Database["public"]["Enums"]["expense_method"]
          receipt_image: string | null
          treasury_id: string | null
        }
        Insert: {
          amount: number
          branch_id: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description_ar?: string | null
          description_en: string
          expense_date?: string
          id?: string
          payment_method?: Database["public"]["Enums"]["expense_method"]
          receipt_image?: string | null
          treasury_id?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string
          expense_date?: string
          id?: string
          payment_method?: Database["public"]["Enums"]["expense_method"]
          receipt_image?: string | null
          treasury_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_treasury_id_fkey"
            columns: ["treasury_id"]
            isOneToOne: false
            referencedRelation: "treasury"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_companies: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          default_coverage_ratio: number
          id: string
          is_active: boolean
          name_ar: string | null
          name_en: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          default_coverage_ratio?: number
          id?: string
          is_active?: boolean
          name_ar?: string | null
          name_en: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          default_coverage_ratio?: number
          id?: string
          is_active?: boolean
          name_ar?: string | null
          name_en?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      insurance_contract_rules: {
        Row: {
          contract_id: string
          coverage_percent: number
          created_at: string
          excluded: boolean
          id: string
          item_type: Database["public"]["Enums"]["invoice_item_type"] | null
          max_amount_per_item: number | null
          priority: number
          scope: string
          target_id: string | null
          updated_at: string
        }
        Insert: {
          contract_id: string
          coverage_percent?: number
          created_at?: string
          excluded?: boolean
          id?: string
          item_type?: Database["public"]["Enums"]["invoice_item_type"] | null
          max_amount_per_item?: number | null
          priority?: number
          scope: string
          target_id?: string | null
          updated_at?: string
        }
        Update: {
          contract_id?: string
          coverage_percent?: number
          created_at?: string
          excluded?: boolean
          id?: string
          item_type?: Database["public"]["Enums"]["invoice_item_type"] | null
          max_amount_per_item?: number | null
          priority?: number
          scope?: string
          target_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_contract_rules_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "insurance_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_contracts: {
        Row: {
          created_at: string
          default_coverage_percent: number
          id: string
          insurance_company_id: string
          is_active: boolean
          name_ar: string | null
          name_en: string
          notes: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          default_coverage_percent?: number
          id?: string
          insurance_company_id: string
          is_active?: boolean
          name_ar?: string | null
          name_en: string
          notes?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          default_coverage_percent?: number
          id?: string
          insurance_company_id?: string
          is_active?: boolean
          name_ar?: string | null
          name_en?: string
          notes?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insurance_contracts_insurance_company_id_fkey"
            columns: ["insurance_company_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          available_quantity: number | null
          branch_id: string
          created_at: string
          id: string
          last_restocked_at: string | null
          product_id: string
          quantity: number
          reserved_quantity: number
          updated_at: string
        }
        Insert: {
          available_quantity?: number | null
          branch_id: string
          created_at?: string
          id?: string
          last_restocked_at?: string | null
          product_id: string
          quantity?: number
          reserved_quantity?: number
          updated_at?: string
        }
        Update: {
          available_quantity?: number | null
          branch_id?: string
          created_at?: string
          id?: string
          last_restocked_at?: string | null
          product_id?: string
          quantity?: number
          reserved_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          batch_number: string | null
          branch_id: string
          created_at: string
          created_by: string | null
          expiry_date: string | null
          id: string
          notes_ar: string | null
          notes_en: string | null
          product_id: string
          quantity: number
          quantity_after: number
          quantity_before: number
          reference_id: string | null
          reference_type: string | null
          transaction_type: Database["public"]["Enums"]["inventory_tx_type"]
          unit_cost: number | null
        }
        Insert: {
          batch_number?: string | null
          branch_id: string
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          notes_ar?: string | null
          notes_en?: string | null
          product_id: string
          quantity: number
          quantity_after?: number
          quantity_before?: number
          reference_id?: string | null
          reference_type?: string | null
          transaction_type: Database["public"]["Enums"]["inventory_tx_type"]
          unit_cost?: number | null
        }
        Update: {
          batch_number?: string | null
          branch_id?: string
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          notes_ar?: string | null
          notes_en?: string | null
          product_id?: string
          quantity?: number
          quantity_after?: number
          quantity_before?: number
          reference_id?: string | null
          reference_type?: string | null
          transaction_type?: Database["public"]["Enums"]["inventory_tx_type"]
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_counters: {
        Row: {
          last_value: number
          year: number
        }
        Insert: {
          last_value?: number
          year: number
        }
        Update: {
          last_value?: number
          year?: number
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string
          id: string
          insurance_covered_amount: number
          insurance_rule_id: string | null
          invoice_id: string
          item_type: Database["public"]["Enums"]["invoice_item_type"]
          product_id: string | null
          quantity: number
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en: string
          id?: string
          insurance_covered_amount?: number
          insurance_rule_id?: string | null
          invoice_id: string
          item_type?: Database["public"]["Enums"]["invoice_item_type"]
          product_id?: string | null
          quantity?: number
          total?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string
          id?: string
          insurance_covered_amount?: number
          insurance_rule_id?: string | null
          invoice_id?: string
          item_type?: Database["public"]["Enums"]["invoice_item_type"]
          product_id?: string | null
          quantity?: number
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_insurance_rule_id_fkey"
            columns: ["insurance_rule_id"]
            isOneToOne: false
            referencedRelation: "insurance_contract_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_settings: {
        Row: {
          branch_id: string | null
          created_at: string
          default_payment_terms_days: number
          default_tax_rate: number
          id: string
          invoice_footer_ar: string | null
          invoice_footer_en: string | null
          invoice_notes_ar: string | null
          invoice_notes_en: string | null
          invoice_prefix: string
          invoice_start_number: number
          invoice_suffix: string | null
          reset_number_yearly: boolean
          show_logo_on_invoice: boolean
          show_payment_qr: boolean
          show_tax_id: boolean
          terms_conditions_ar: string | null
          terms_conditions_en: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          default_payment_terms_days?: number
          default_tax_rate?: number
          id?: string
          invoice_footer_ar?: string | null
          invoice_footer_en?: string | null
          invoice_notes_ar?: string | null
          invoice_notes_en?: string | null
          invoice_prefix?: string
          invoice_start_number?: number
          invoice_suffix?: string | null
          reset_number_yearly?: boolean
          show_logo_on_invoice?: boolean
          show_payment_qr?: boolean
          show_tax_id?: boolean
          terms_conditions_ar?: string | null
          terms_conditions_en?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          default_payment_terms_days?: number
          default_tax_rate?: number
          id?: string
          invoice_footer_ar?: string | null
          invoice_footer_en?: string | null
          invoice_notes_ar?: string | null
          invoice_notes_en?: string | null
          invoice_prefix?: string
          invoice_start_number?: number
          invoice_suffix?: string | null
          reset_number_yearly?: boolean
          show_logo_on_invoice?: boolean
          show_payment_qr?: boolean
          show_tax_id?: boolean
          terms_conditions_ar?: string | null
          terms_conditions_en?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          branch_id: string | null
          claim_amount: number
          claim_number: string | null
          claim_resolved_at: string | null
          claim_status: Database["public"]["Enums"]["claim_status"] | null
          claim_submitted_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          discount: number
          due_date: string | null
          id: string
          insurance_company_id: string | null
          invoice_date: string
          invoice_number: string
          medical_record_id: string | null
          notes: string | null
          paid_amount: number
          patient_id: string
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
          voided_at: string | null
        }
        Insert: {
          branch_id?: string | null
          claim_amount?: number
          claim_number?: string | null
          claim_resolved_at?: string | null
          claim_status?: Database["public"]["Enums"]["claim_status"] | null
          claim_submitted_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          discount?: number
          due_date?: string | null
          id?: string
          insurance_company_id?: string | null
          invoice_date?: string
          invoice_number: string
          medical_record_id?: string | null
          notes?: string | null
          paid_amount?: number
          patient_id: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          voided_at?: string | null
        }
        Update: {
          branch_id?: string | null
          claim_amount?: number
          claim_number?: string | null
          claim_resolved_at?: string | null
          claim_status?: Database["public"]["Enums"]["claim_status"] | null
          claim_submitted_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          discount?: number
          due_date?: string | null
          id?: string
          insurance_company_id?: string | null
          invoice_date?: string
          invoice_number?: string
          medical_record_id?: string | null
          notes?: string | null
          paid_amount?: number
          patient_id?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_insurance_company_id_fkey"
            columns: ["insurance_company_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_medical_record_id_fkey"
            columns: ["medical_record_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          end_date: string
          id: string
          leave_type_id: string
          reason_ar: string | null
          reason_en: string | null
          rejection_reason: string | null
          staff_id: string
          start_date: string
          status: Database["public"]["Enums"]["leave_request_status"]
          total_days: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          end_date: string
          id?: string
          leave_type_id: string
          reason_ar?: string | null
          reason_en?: string | null
          rejection_reason?: string | null
          staff_id: string
          start_date: string
          status?: Database["public"]["Enums"]["leave_request_status"]
          total_days?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          end_date?: string
          id?: string
          leave_type_id?: string
          reason_ar?: string | null
          reason_en?: string | null
          rejection_reason?: string | null
          staff_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["leave_request_status"]
          total_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          code: string
          created_at: string
          default_days: number
          description_ar: string | null
          description_en: string | null
          id: string
          is_active: boolean
          is_paid: boolean
          max_consecutive_days: number | null
          name_ar: string
          name_en: string
          requires_approval: boolean
        }
        Insert: {
          code: string
          created_at?: string
          default_days?: number
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          is_paid?: boolean
          max_consecutive_days?: number | null
          name_ar: string
          name_en: string
          requires_approval?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          default_days?: number
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          is_paid?: boolean
          max_consecutive_days?: number | null
          name_ar?: string
          name_en?: string
          requires_approval?: boolean
        }
        Relationships: []
      }
      loyalty_settings: {
        Row: {
          created_at: string
          id: number
          referral_reward_active: boolean
          referral_reward_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          referral_reward_active?: boolean
          referral_reward_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          referral_reward_active?: boolean
          referral_reward_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      medical_history: {
        Row: {
          allergies_ar: string | null
          allergies_en: string | null
          created_at: string
          current_medications_ar: string | null
          current_medications_en: string | null
          family_history_ar: string | null
          family_history_en: string | null
          has_allergies: boolean
          has_bleeding_disorder: boolean
          has_diabetes: boolean
          has_heart_disease: boolean
          has_hypertension: boolean
          id: string
          is_pregnant: boolean
          last_updated_by: string | null
          notes_ar: string | null
          notes_en: string | null
          patient_id: string
          pregnancy_due_date: string | null
          previous_surgeries_ar: string | null
          previous_surgeries_en: string | null
          updated_at: string
        }
        Insert: {
          allergies_ar?: string | null
          allergies_en?: string | null
          created_at?: string
          current_medications_ar?: string | null
          current_medications_en?: string | null
          family_history_ar?: string | null
          family_history_en?: string | null
          has_allergies?: boolean
          has_bleeding_disorder?: boolean
          has_diabetes?: boolean
          has_heart_disease?: boolean
          has_hypertension?: boolean
          id?: string
          is_pregnant?: boolean
          last_updated_by?: string | null
          notes_ar?: string | null
          notes_en?: string | null
          patient_id: string
          pregnancy_due_date?: string | null
          previous_surgeries_ar?: string | null
          previous_surgeries_en?: string | null
          updated_at?: string
        }
        Update: {
          allergies_ar?: string | null
          allergies_en?: string | null
          created_at?: string
          current_medications_ar?: string | null
          current_medications_en?: string | null
          family_history_ar?: string | null
          family_history_en?: string | null
          has_allergies?: boolean
          has_bleeding_disorder?: boolean
          has_diabetes?: boolean
          has_heart_disease?: boolean
          has_hypertension?: boolean
          id?: string
          is_pregnant?: boolean
          last_updated_by?: string | null
          notes_ar?: string | null
          notes_en?: string | null
          patient_id?: string
          pregnancy_due_date?: string | null
          previous_surgeries_ar?: string | null
          previous_surgeries_en?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_history_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_history_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_records: {
        Row: {
          appointment_id: string | null
          branch_id: string | null
          chief_complaint_ar: string | null
          chief_complaint_en: string | null
          created_at: string
          deleted_at: string | null
          doctor_id: string | null
          follow_up_date: string | null
          id: string
          notes_ar: string | null
          notes_en: string | null
          patient_id: string
          present_illness_ar: string | null
          present_illness_en: string | null
          specialty_id: string | null
          status: Database["public"]["Enums"]["medical_record_status"]
          updated_at: string
          visit_date: string
          visit_type: Database["public"]["Enums"]["visit_type"]
        }
        Insert: {
          appointment_id?: string | null
          branch_id?: string | null
          chief_complaint_ar?: string | null
          chief_complaint_en?: string | null
          created_at?: string
          deleted_at?: string | null
          doctor_id?: string | null
          follow_up_date?: string | null
          id?: string
          notes_ar?: string | null
          notes_en?: string | null
          patient_id: string
          present_illness_ar?: string | null
          present_illness_en?: string | null
          specialty_id?: string | null
          status?: Database["public"]["Enums"]["medical_record_status"]
          updated_at?: string
          visit_date?: string
          visit_type?: Database["public"]["Enums"]["visit_type"]
        }
        Update: {
          appointment_id?: string | null
          branch_id?: string | null
          chief_complaint_ar?: string | null
          chief_complaint_en?: string | null
          created_at?: string
          deleted_at?: string | null
          doctor_id?: string | null
          follow_up_date?: string | null
          id?: string
          notes_ar?: string | null
          notes_en?: string | null
          patient_id?: string
          present_illness_ar?: string | null
          present_illness_en?: string | null
          specialty_id?: string | null
          status?: Database["public"]["Enums"]["medical_record_status"]
          updated_at?: string
          visit_date?: string
          visit_type?: Database["public"]["Enums"]["visit_type"]
        }
        Relationships: [
          {
            foreignKeyName: "medical_records_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_records_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_records_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_records_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "medical_specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_specialties: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
        }
        Relationships: []
      }
      medications: {
        Row: {
          created_at: string
          deleted_at: string | null
          dosage_form: string
          generic_name: string | null
          id: string
          instructions_ar: string | null
          instructions_en: string | null
          is_active: boolean
          name_ar: string
          name_en: string
          product_id: string | null
          strength: string | null
          unit: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          dosage_form: string
          generic_name?: string | null
          id?: string
          instructions_ar?: string | null
          instructions_en?: string | null
          is_active?: boolean
          name_ar: string
          name_en: string
          product_id?: string | null
          strength?: string | null
          unit?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          dosage_form?: string
          generic_name?: string | null
          id?: string
          instructions_ar?: string | null
          instructions_en?: string | null
          is_active?: boolean
          name_ar?: string
          name_en?: string
          product_id?: string | null
          strength?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "medications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          birthday_discount_percentage: number
          branch_id: string | null
          created_at: string
          email_sender_address: string | null
          email_sender_name: string | null
          follow_up_days_after: number
          id: string
          meta_phone_number_id: string | null
          reminder_channel: Database["public"]["Enums"]["notification_channel"]
          send_appointment_cancellation: boolean
          send_appointment_confirmation: boolean
          send_appointment_reminders: boolean
          send_birthday_greeting: boolean
          send_follow_up_reminder: boolean
          send_invoice_notification: boolean
          send_payment_receipt: boolean
          sms_api_key: string | null
          sms_api_url: string | null
          sms_enabled: boolean
          sms_provider: Database["public"]["Enums"]["sms_provider"]
          sms_sender_id: string | null
          twilio_account_sid: string | null
          twilio_auth_token: string | null
          twilio_from_sms: string | null
          twilio_from_whatsapp: string | null
          updated_at: string
          whatsapp_api_key: string | null
          whatsapp_api_url: string | null
          whatsapp_business_number: string | null
          whatsapp_enabled: boolean
          whatsapp_provider: Database["public"]["Enums"]["whatsapp_provider"]
          winback_enabled: boolean
          winback_inactive_days: number
        }
        Insert: {
          birthday_discount_percentage?: number
          branch_id?: string | null
          created_at?: string
          email_sender_address?: string | null
          email_sender_name?: string | null
          follow_up_days_after?: number
          id?: string
          meta_phone_number_id?: string | null
          reminder_channel?: Database["public"]["Enums"]["notification_channel"]
          send_appointment_cancellation?: boolean
          send_appointment_confirmation?: boolean
          send_appointment_reminders?: boolean
          send_birthday_greeting?: boolean
          send_follow_up_reminder?: boolean
          send_invoice_notification?: boolean
          send_payment_receipt?: boolean
          sms_api_key?: string | null
          sms_api_url?: string | null
          sms_enabled?: boolean
          sms_provider?: Database["public"]["Enums"]["sms_provider"]
          sms_sender_id?: string | null
          twilio_account_sid?: string | null
          twilio_auth_token?: string | null
          twilio_from_sms?: string | null
          twilio_from_whatsapp?: string | null
          updated_at?: string
          whatsapp_api_key?: string | null
          whatsapp_api_url?: string | null
          whatsapp_business_number?: string | null
          whatsapp_enabled?: boolean
          whatsapp_provider?: Database["public"]["Enums"]["whatsapp_provider"]
          winback_enabled?: boolean
          winback_inactive_days?: number
        }
        Update: {
          birthday_discount_percentage?: number
          branch_id?: string | null
          created_at?: string
          email_sender_address?: string | null
          email_sender_name?: string | null
          follow_up_days_after?: number
          id?: string
          meta_phone_number_id?: string | null
          reminder_channel?: Database["public"]["Enums"]["notification_channel"]
          send_appointment_cancellation?: boolean
          send_appointment_confirmation?: boolean
          send_appointment_reminders?: boolean
          send_birthday_greeting?: boolean
          send_follow_up_reminder?: boolean
          send_invoice_notification?: boolean
          send_payment_receipt?: boolean
          sms_api_key?: string | null
          sms_api_url?: string | null
          sms_enabled?: boolean
          sms_provider?: Database["public"]["Enums"]["sms_provider"]
          sms_sender_id?: string | null
          twilio_account_sid?: string | null
          twilio_auth_token?: string | null
          twilio_from_sms?: string | null
          twilio_from_whatsapp?: string | null
          updated_at?: string
          whatsapp_api_key?: string | null
          whatsapp_api_url?: string | null
          whatsapp_business_number?: string | null
          whatsapp_enabled?: boolean
          whatsapp_provider?: Database["public"]["Enums"]["whatsapp_provider"]
          winback_enabled?: boolean
          winback_inactive_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message_ar: string
          message_en: string
          read_at: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          scheduled_for: string | null
          sent_at: string | null
          title_ar: string
          title_en: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message_ar?: string
          message_en?: string
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          title_ar?: string
          title_en?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message_ar?: string
          message_en?: string
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          title_ar?: string
          title_en?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: []
      }
      patient_documents: {
        Row: {
          created_at: string
          description: string | null
          document_type: Database["public"]["Enums"]["document_type"]
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          medical_record_id: string | null
          patient_id: string
          tags: string[] | null
          title_ar: string
          title_en: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          document_type?: Database["public"]["Enums"]["document_type"]
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          medical_record_id?: string | null
          patient_id: string
          tags?: string[] | null
          title_ar: string
          title_en?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          document_type?: Database["public"]["Enums"]["document_type"]
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          medical_record_id?: string | null
          patient_id?: string
          tags?: string[] | null
          title_ar?: string
          title_en?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_documents_medical_record_id_fkey"
            columns: ["medical_record_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_documents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          branch_id: string | null
          created_at: string
          created_by: string | null
          direction: number
          id: string
          notes_ar: string | null
          notes_en: string | null
          patient_id: string
          reference_id: string | null
          reference_type: string | null
          tx_type: Database["public"]["Enums"]["wallet_tx_type"]
        }
        Insert: {
          amount: number
          balance_after: number
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          direction: number
          id?: string
          notes_ar?: string | null
          notes_en?: string | null
          patient_id: string
          reference_id?: string | null
          reference_type?: string | null
          tx_type: Database["public"]["Enums"]["wallet_tx_type"]
        }
        Update: {
          amount?: number
          balance_after?: number
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: number
          id?: string
          notes_ar?: string | null
          notes_en?: string | null
          patient_id?: string
          reference_id?: string | null
          reference_type?: string | null
          tx_type?: Database["public"]["Enums"]["wallet_tx_type"]
        }
        Relationships: [
          {
            foreignKeyName: "patient_wallet_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_wallet_transactions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_wallets: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          patient_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          patient_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          patient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_wallets_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          assigned_doctor_id: string | null
          blood_type: string | null
          branch_id: string | null
          city: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dob: string | null
          email: string | null
          first_name_ar: string | null
          first_name_en: string | null
          gender: Database["public"]["Enums"]["gender"] | null
          id: string
          insurance_company_id: string | null
          insurance_coverage_ratio: number | null
          insurance_policy_expiry: string | null
          insurance_policy_number: string | null
          last_name_ar: string | null
          last_name_en: string | null
          nationality: string | null
          notes: string | null
          patient_code: number
          phone: string | null
          phone2: string | null
          referral_source: string | null
          referred_by_patient_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          assigned_doctor_id?: string | null
          blood_type?: string | null
          branch_id?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dob?: string | null
          email?: string | null
          first_name_ar?: string | null
          first_name_en?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          id?: string
          insurance_company_id?: string | null
          insurance_coverage_ratio?: number | null
          insurance_policy_expiry?: string | null
          insurance_policy_number?: string | null
          last_name_ar?: string | null
          last_name_en?: string | null
          nationality?: string | null
          notes?: string | null
          patient_code: number
          phone?: string | null
          phone2?: string | null
          referral_source?: string | null
          referred_by_patient_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          assigned_doctor_id?: string | null
          blood_type?: string | null
          branch_id?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dob?: string | null
          email?: string | null
          first_name_ar?: string | null
          first_name_en?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          id?: string
          insurance_company_id?: string | null
          insurance_coverage_ratio?: number | null
          insurance_policy_expiry?: string | null
          insurance_policy_number?: string | null
          last_name_ar?: string | null
          last_name_en?: string | null
          nationality?: string | null
          notes?: string | null
          patient_code?: number
          phone?: string | null
          phone2?: string | null
          referral_source?: string | null
          referred_by_patient_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_assigned_doctor_id_fkey"
            columns: ["assigned_doctor_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_insurance_company_id_fkey"
            columns: ["insurance_company_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_referred_by_patient_id_fkey"
            columns: ["referred_by_patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          branch_id: string | null
          code: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          processing_fee_fixed: number
          processing_fee_percentage: number
          requires_reference: boolean
          type: Database["public"]["Enums"]["payment_method_type"]
        }
        Insert: {
          branch_id?: string | null
          code: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          processing_fee_fixed?: number
          processing_fee_percentage?: number
          requires_reference?: boolean
          type?: Database["public"]["Enums"]["payment_method_type"]
        }
        Update: {
          branch_id?: string | null
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          processing_fee_fixed?: number
          processing_fee_percentage?: number
          requires_reference?: boolean
          type?: Database["public"]["Enums"]["payment_method_type"]
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          branch_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          invoice_id: string | null
          is_wallet_topup: boolean
          notes: string | null
          patient_id: string
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          received_by: string | null
          reference_number: string | null
          treasury_id: string | null
          wallet_credit_tx_id: string | null
        }
        Insert: {
          amount: number
          branch_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          invoice_id?: string | null
          is_wallet_topup?: boolean
          notes?: string | null
          patient_id: string
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          received_by?: string | null
          reference_number?: string | null
          treasury_id?: string | null
          wallet_credit_tx_id?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          invoice_id?: string | null
          is_wallet_topup?: boolean
          notes?: string | null
          patient_id?: string
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          received_by?: string | null
          reference_number?: string | null
          treasury_id?: string | null
          wallet_credit_tx_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_treasury_id_fkey"
            columns: ["treasury_id"]
            isOneToOne: false
            referencedRelation: "treasury"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll: {
        Row: {
          actual_working_days: number
          base_salary: number
          bonuses: number
          branch_id: string | null
          created_at: string
          created_by: string | null
          deductions: number
          id: string
          leave_deductions: number
          net_salary: number
          notes: string | null
          overtime_amount: number
          overtime_hours: number
          paid_at: string | null
          paid_by: string | null
          payment_reference: string | null
          period_month: number
          period_year: number
          staff_id: string
          status: Database["public"]["Enums"]["payroll_status"]
          updated_at: string
          working_days: number
        }
        Insert: {
          actual_working_days?: number
          base_salary?: number
          bonuses?: number
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          deductions?: number
          id?: string
          leave_deductions?: number
          net_salary?: number
          notes?: string | null
          overtime_amount?: number
          overtime_hours?: number
          paid_at?: string | null
          paid_by?: string | null
          payment_reference?: string | null
          period_month: number
          period_year: number
          staff_id: string
          status?: Database["public"]["Enums"]["payroll_status"]
          updated_at?: string
          working_days?: number
        }
        Update: {
          actual_working_days?: number
          base_salary?: number
          bonuses?: number
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          deductions?: number
          id?: string
          leave_deductions?: number
          net_salary?: number
          notes?: string | null
          overtime_amount?: number
          overtime_hours?: number
          paid_at?: string | null
          paid_by?: string | null
          payment_reference?: string | null
          period_month?: number
          period_year?: number
          staff_id?: string
          status?: Database["public"]["Enums"]["payroll_status"]
          updated_at?: string
          working_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_reviews: {
        Row: {
          areas_for_improvement_ar: string | null
          areas_for_improvement_en: string | null
          created_at: string
          goals_ar: string | null
          goals_en: string | null
          id: string
          rating: number | null
          review_period_end: string
          review_period_start: string
          reviewer_comments: string | null
          reviewer_id: string | null
          staff_comments: string | null
          staff_id: string
          strengths_ar: string | null
          strengths_en: string | null
        }
        Insert: {
          areas_for_improvement_ar?: string | null
          areas_for_improvement_en?: string | null
          created_at?: string
          goals_ar?: string | null
          goals_en?: string | null
          id?: string
          rating?: number | null
          review_period_end: string
          review_period_start: string
          reviewer_comments?: string | null
          reviewer_id?: string | null
          staff_comments?: string | null
          staff_id: string
          strengths_ar?: string | null
          strengths_en?: string | null
        }
        Update: {
          areas_for_improvement_ar?: string | null
          areas_for_improvement_en?: string | null
          created_at?: string
          goals_ar?: string | null
          goals_en?: string | null
          id?: string
          rating?: number | null
          review_period_end?: string
          review_period_start?: string
          reviewer_comments?: string | null
          reviewer_id?: string | null
          staff_comments?: string | null
          staff_id?: string
          strengths_ar?: string | null
          strengths_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_reviews_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      physio_cases: {
        Row: {
          branch_id: string
          completed_at: string | null
          completion_summary: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          diagnosis: string | null
          expected_sessions: number
          followup_due_date: string | null
          followup_enabled: boolean
          followup_interval_days: number
          id: string
          notes: string | null
          patient_id: string
          pause_reason: string | null
          start_date: string
          status: Database["public"]["Enums"]["physio_case_status"]
          therapist_id: string | null
          treatment_goal: string | null
          treatment_plan: string | null
          updated_at: string
        }
        Insert: {
          branch_id: string
          completed_at?: string | null
          completion_summary?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          diagnosis?: string | null
          expected_sessions?: number
          followup_due_date?: string | null
          followup_enabled?: boolean
          followup_interval_days?: number
          id?: string
          notes?: string | null
          patient_id: string
          pause_reason?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["physio_case_status"]
          therapist_id?: string | null
          treatment_goal?: string | null
          treatment_plan?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string
          completed_at?: string | null
          completion_summary?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          diagnosis?: string | null
          expected_sessions?: number
          followup_due_date?: string | null
          followup_enabled?: boolean
          followup_interval_days?: number
          id?: string
          notes?: string | null
          patient_id?: string
          pause_reason?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["physio_case_status"]
          therapist_id?: string | null
          treatment_goal?: string | null
          treatment_plan?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "physio_cases_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physio_cases_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physio_cases_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      physio_reassessments: {
        Row: {
          assessment_date: string
          case_id: string
          created_at: string
          created_by: string | null
          current_condition: string | null
          deleted_at: string | null
          id: string
          initial_condition: string | null
          notes: string | null
          plan_update: string | null
          therapist_id: string | null
          trend: Database["public"]["Enums"]["physio_trend"]
          updated_at: string
        }
        Insert: {
          assessment_date?: string
          case_id: string
          created_at?: string
          created_by?: string | null
          current_condition?: string | null
          deleted_at?: string | null
          id?: string
          initial_condition?: string | null
          notes?: string | null
          plan_update?: string | null
          therapist_id?: string | null
          trend?: Database["public"]["Enums"]["physio_trend"]
          updated_at?: string
        }
        Update: {
          assessment_date?: string
          case_id?: string
          created_at?: string
          created_by?: string | null
          current_condition?: string | null
          deleted_at?: string | null
          id?: string
          initial_condition?: string | null
          notes?: string | null
          plan_update?: string | null
          therapist_id?: string | null
          trend?: Database["public"]["Enums"]["physio_trend"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "physio_reassessments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "physio_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physio_reassessments_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      physio_sessions: {
        Row: {
          adherence: string | null
          appointment_id: string | null
          attendance: Database["public"]["Enums"]["physio_attendance"]
          case_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          home_exercise: string | null
          id: string
          interventions: string | null
          mobility_note: string | null
          next_recommendation: string | null
          next_review_plan: string | null
          pain_level: number | null
          pain_note: string | null
          progress_note: string | null
          session_date: string
          session_number: number
          strength_note: string | null
          symptom_change: string | null
          therapist_assessment: string | null
          therapist_id: string | null
          updated_at: string
        }
        Insert: {
          adherence?: string | null
          appointment_id?: string | null
          attendance?: Database["public"]["Enums"]["physio_attendance"]
          case_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          home_exercise?: string | null
          id?: string
          interventions?: string | null
          mobility_note?: string | null
          next_recommendation?: string | null
          next_review_plan?: string | null
          pain_level?: number | null
          pain_note?: string | null
          progress_note?: string | null
          session_date?: string
          session_number?: number
          strength_note?: string | null
          symptom_change?: string | null
          therapist_assessment?: string | null
          therapist_id?: string | null
          updated_at?: string
        }
        Update: {
          adherence?: string | null
          appointment_id?: string | null
          attendance?: Database["public"]["Enums"]["physio_attendance"]
          case_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          home_exercise?: string | null
          id?: string
          interventions?: string | null
          mobility_note?: string | null
          next_recommendation?: string | null
          next_review_plan?: string | null
          pain_level?: number | null
          pain_note?: string | null
          progress_note?: string | null
          session_date?: string
          session_number?: number
          strength_note?: string | null
          symptom_change?: string | null
          therapist_assessment?: string | null
          therapist_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "physio_sessions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physio_sessions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "physio_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physio_sessions_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      po_counters: {
        Row: {
          last_value: number
          year: number
        }
        Insert: {
          last_value?: number
          year: number
        }
        Update: {
          last_value?: number
          year?: number
        }
        Relationships: []
      }
      prescription_items: {
        Row: {
          created_at: string
          dosage: string | null
          duration: string | null
          frequency: string | null
          id: string
          instructions_ar: string | null
          instructions_en: string | null
          medication_id: string
          prescription_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          dosage?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          instructions_ar?: string | null
          instructions_en?: string | null
          medication_id: string
          prescription_id: string
          quantity?: number
        }
        Update: {
          created_at?: string
          dosage?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          instructions_ar?: string | null
          instructions_en?: string | null
          medication_id?: string
          prescription_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "prescription_items_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_items_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          created_at: string
          deleted_at: string | null
          doctor_id: string | null
          id: string
          medical_record_id: string | null
          notes_ar: string | null
          notes_en: string | null
          patient_id: string
          prescription_date: string
          status: Database["public"]["Enums"]["prescription_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          doctor_id?: string | null
          id?: string
          medical_record_id?: string | null
          notes_ar?: string | null
          notes_en?: string | null
          patient_id: string
          prescription_date?: string
          status?: Database["public"]["Enums"]["prescription_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          doctor_id?: string | null
          id?: string
          medical_record_id?: string | null
          notes_ar?: string | null
          notes_en?: string | null
          patient_id?: string
          prescription_date?: string
          status?: Database["public"]["Enums"]["prescription_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_medical_record_id_fkey"
            columns: ["medical_record_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      procedures: {
        Row: {
          code: string | null
          created_at: string
          default_duration: number | null
          default_price: number | null
          deleted_at: string | null
          description_ar: string | null
          description_en: string | null
          doctor_commission_percent: number
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          specialty_id: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          default_duration?: number | null
          default_price?: number | null
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          doctor_commission_percent?: number
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          specialty_id?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          default_duration?: number | null
          default_price?: number | null
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          doctor_commission_percent?: number
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          specialty_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procedures_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "medical_specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sku_counter: {
        Row: {
          id: number
          last_value: number
        }
        Insert: {
          id?: number
          last_value?: number
        }
        Update: {
          id?: number
          last_value?: number
        }
        Relationships: []
      }
      products: {
        Row: {
          barcode: string | null
          category_id: string | null
          cost_price: number
          created_at: string
          deleted_at: string | null
          description_ar: string | null
          description_en: string | null
          expiry_tracking: boolean
          id: string
          image_url: string | null
          is_active: boolean
          max_stock_level: number | null
          min_stock_level: number
          name_ar: string
          name_en: string
          selling_price: number
          sku: string
          supplier_id: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          expiry_tracking?: boolean
          id?: string
          image_url?: string | null
          is_active?: boolean
          max_stock_level?: number | null
          min_stock_level?: number
          name_ar: string
          name_en: string
          selling_price?: number
          sku: string
          supplier_id?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          expiry_tracking?: boolean
          id?: string
          image_url?: string | null
          is_active?: boolean
          max_stock_level?: number | null
          min_stock_level?: number
          name_ar?: string
          name_en?: string
          selling_price?: number
          sku?: string
          supplier_id?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_branch_id: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_branch_id?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_branch_id?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_branch_id_fkey"
            columns: ["default_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received: number
          total: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          purchase_order_id: string
          quantity_ordered?: number
          quantity_received?: number
          total?: number
          unit_cost?: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          purchase_order_id?: string
          quantity_ordered?: number
          quantity_received?: number
          total?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          expected_date: string | null
          id: string
          notes: string | null
          order_date: string
          po_number: string
          status: Database["public"]["Enums"]["po_status"]
          subtotal: number
          supplier_id: string
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          po_number: string
          status?: Database["public"]["Enums"]["po_status"]
          subtotal?: number
          supplier_id: string
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          po_number?: string
          status?: Database["public"]["Enums"]["po_status"]
          subtotal?: number
          supplier_id?: string
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_alert_runs: {
        Row: {
          alerts_opened: number
          alerts_resolved: number
          branch_id: string
          last_error: string | null
          last_run_at: string
          last_status: string
          updated_at: string
        }
        Insert: {
          alerts_opened?: number
          alerts_resolved?: number
          branch_id: string
          last_error?: string | null
          last_run_at?: string
          last_status?: string
          updated_at?: string
        }
        Update: {
          alerts_opened?: number
          alerts_resolved?: number
          branch_id?: string
          last_error?: string | null
          last_run_at?: string
          last_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_alert_runs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          branch_id: string
          created_at: string
          detail: Json
          id: string
          resolved_at: string | null
          snoozed_by: string | null
          snoozed_until: string | null
          state: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          branch_id: string
          created_at?: string
          detail?: Json
          id?: string
          resolved_at?: string | null
          snoozed_by?: string | null
          snoozed_until?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          branch_id?: string
          created_at?: string
          detail?: Json
          id?: string
          resolved_at?: string | null
          snoozed_by?: string | null
          snoozed_until?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_alerts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_settings: {
        Row: {
          alerts_on_dashboard: boolean
          alerts_on_queue: boolean
          branch_id: string | null
          business_hours_end: string
          business_hours_start: string
          busy_queue_threshold: number
          created_at: string
          default_my_queue: boolean
          id: string
          long_wait_minutes: number
          no_show_rate_threshold: number
          quiet_hours_enabled: boolean
          show_no_shows_in_default: boolean
          updated_at: string
        }
        Insert: {
          alerts_on_dashboard?: boolean
          alerts_on_queue?: boolean
          branch_id?: string | null
          business_hours_end?: string
          business_hours_start?: string
          busy_queue_threshold?: number
          created_at?: string
          default_my_queue?: boolean
          id?: string
          long_wait_minutes?: number
          no_show_rate_threshold?: number
          quiet_hours_enabled?: boolean
          show_no_shows_in_default?: boolean
          updated_at?: string
        }
        Update: {
          alerts_on_dashboard?: boolean
          alerts_on_queue?: boolean
          branch_id?: string | null
          business_hours_end?: string
          business_hours_start?: string
          busy_queue_threshold?: number
          created_at?: string
          default_my_queue?: boolean
          id?: string
          long_wait_minutes?: number
          no_show_rate_threshold?: number
          quiet_hours_enabled?: boolean
          show_no_shows_in_default?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      record_diagnoses: {
        Row: {
          created_at: string
          diagnosis_id: string
          id: string
          is_primary: boolean
          medical_record_id: string
          notes_ar: string | null
          notes_en: string | null
        }
        Insert: {
          created_at?: string
          diagnosis_id: string
          id?: string
          is_primary?: boolean
          medical_record_id: string
          notes_ar?: string | null
          notes_en?: string | null
        }
        Update: {
          created_at?: string
          diagnosis_id?: string
          id?: string
          is_primary?: boolean
          medical_record_id?: string
          notes_ar?: string | null
          notes_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "record_diagnoses_diagnosis_id_fkey"
            columns: ["diagnosis_id"]
            isOneToOne: false
            referencedRelation: "diagnoses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_diagnoses_medical_record_id_fkey"
            columns: ["medical_record_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id"]
          },
        ]
      }
      record_procedures: {
        Row: {
          created_at: string
          duration_minutes: number | null
          id: string
          medical_record_id: string
          notes_ar: string | null
          notes_en: string | null
          performed_by: string | null
          procedure_id: string
          quantity: number
          tooth_number: string | null
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          medical_record_id: string
          notes_ar?: string | null
          notes_en?: string | null
          performed_by?: string | null
          procedure_id: string
          quantity?: number
          tooth_number?: string | null
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          medical_record_id?: string
          notes_ar?: string | null
          notes_en?: string | null
          performed_by?: string | null
          procedure_id?: string
          quantity?: number
          tooth_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "record_procedures_medical_record_id_fkey"
            columns: ["medical_record_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_procedures_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_procedures_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          appointment_id: string | null
          branch_id: string | null
          created_at: string
          created_by: string | null
          destination_channel: string | null
          destination_phone: string | null
          error_message: string | null
          event_type: string
          id: string
          message_ar: string
          message_en: string
          patient_id: string | null
          payload: Json
          reminder_type: Database["public"]["Enums"]["reminder_channel"]
          scheduled_time: string
          sent_at: string | null
          status: Database["public"]["Enums"]["reminder_status"]
          template_key: string | null
          winback_month: string | null
        }
        Insert: {
          appointment_id?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          destination_channel?: string | null
          destination_phone?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          message_ar?: string
          message_en?: string
          patient_id?: string | null
          payload?: Json
          reminder_type?: Database["public"]["Enums"]["reminder_channel"]
          scheduled_time: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          template_key?: string | null
          winback_month?: string | null
        }
        Update: {
          appointment_id?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          destination_channel?: string | null
          destination_phone?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          message_ar?: string
          message_en?: string
          patient_id?: string | null
          payload?: Json
          reminder_type?: Database["public"]["Enums"]["reminder_channel"]
          scheduled_time?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          template_key?: string | null
          winback_month?: string | null
        }
        Relationships: []
      }
      report_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          filters: Json
          format: Database["public"]["Enums"]["report_format"]
          frequency: Database["public"]["Enums"]["report_frequency"]
          id: string
          is_active: boolean
          last_run_at: string | null
          name: string
          next_run_at: string
          recipients: string[]
          template_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filters?: Json
          format?: Database["public"]["Enums"]["report_format"]
          frequency: Database["public"]["Enums"]["report_frequency"]
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name: string
          next_run_at?: string
          recipients?: string[]
          template_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filters?: Json
          format?: Database["public"]["Enums"]["report_format"]
          frequency?: Database["public"]["Enums"]["report_frequency"]
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name?: string
          next_run_at?: string
          recipients?: string[]
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          category: Database["public"]["Enums"]["report_category"]
          created_at: string
          created_by: string | null
          description_ar: string | null
          description_en: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name_ar: string
          name_en: string
        }
        Insert: {
          category: Database["public"]["Enums"]["report_category"]
          created_at?: string
          created_by?: string | null
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name_ar: string
          name_en: string
        }
        Update: {
          category?: Database["public"]["Enums"]["report_category"]
          created_at?: string
          created_by?: string | null
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name_ar?: string
          name_en?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          actions: string[]
          created_at: string
          id: string
          module: string
          role: string
          updated_at: string
        }
        Insert: {
          actions?: string[]
          created_at?: string
          id?: string
          module: string
          role: string
          updated_at?: string
        }
        Update: {
          actions?: string[]
          created_at?: string
          id?: string
          module?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      saas_invoice_counters: {
        Row: {
          last_value: number
          year: number
        }
        Insert: {
          last_value?: number
          year: number
        }
        Update: {
          last_value?: number
          year?: number
        }
        Relationships: []
      }
      saas_invoices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          due_date: string | null
          id: string
          invoice_number: string
          invoice_pdf: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["saas_invoice_status"]
          subscription_id: string | null
          tax: number
          tenant_id: string
          total: number
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          invoice_number: string
          invoice_pdf?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["saas_invoice_status"]
          subscription_id?: string | null
          tax?: number
          tenant_id: string
          total: number
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          invoice_pdf?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["saas_invoice_status"]
          subscription_id?: string | null
          tax?: number
          tenant_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "saas_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saas_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          failed_at: string | null
          failure_reason: string | null
          id: string
          invoice_url: string | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["saas_payment_method"]
          payment_provider: Database["public"]["Enums"]["saas_payment_provider"]
          provider_transaction_id: string | null
          receipt_url: string | null
          status: Database["public"]["Enums"]["saas_payment_status"]
          subscription_id: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          invoice_url?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["saas_payment_method"]
          payment_provider?: Database["public"]["Enums"]["saas_payment_provider"]
          provider_transaction_id?: string | null
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["saas_payment_status"]
          subscription_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          invoice_url?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["saas_payment_method"]
          payment_provider?: Database["public"]["Enums"]["saas_payment_provider"]
          provider_transaction_id?: string | null
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["saas_payment_status"]
          subscription_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saas_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_adjustments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          payroll_id: string
          reason_ar: string | null
          reason_en: string | null
          type: Database["public"]["Enums"]["salary_adjustment_type"]
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          payroll_id: string
          reason_ar?: string | null
          reason_en?: string | null
          type: Database["public"]["Enums"]["salary_adjustment_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          payroll_id?: string
          reason_ar?: string | null
          reason_en?: string | null
          type?: Database["public"]["Enums"]["salary_adjustment_type"]
        }
        Relationships: [
          {
            foreignKeyName: "salary_adjustments_payroll_id_fkey"
            columns: ["payroll_id"]
            isOneToOne: false
            referencedRelation: "payroll"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_reports: {
        Row: {
          created_at: string
          created_by: string | null
          filters: Json
          id: string
          name: string
          template_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filters?: Json
          id?: string
          name: string
          template_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filters?: Json
          id?: string
          name?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_reports_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          color: string | null
          created_at: string
          deleted_at: string | null
          description_ar: string | null
          description_en: string | null
          display_order: number
          icon: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
        }
        Update: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
        }
        Relationships: []
      }
      service_consumables: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          procedure_id: string | null
          product_id: string
          quantity: number
          service_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          procedure_id?: string | null
          product_id: string
          quantity?: number
          service_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          procedure_id?: string | null
          product_id?: string
          quantity?: number
          service_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_consumables_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_consumables_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_consumables_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          available_online: boolean
          category_id: string | null
          code: string | null
          cost_price: number | null
          created_at: string
          default_duration_minutes: number
          default_price: number
          deleted_at: string | null
          description_ar: string | null
          description_en: string | null
          display_order: number
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          requires_appointment: boolean
        }
        Insert: {
          available_online?: boolean
          category_id?: string | null
          code?: string | null
          cost_price?: number | null
          created_at?: string
          default_duration_minutes?: number
          default_price?: number
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          requires_appointment?: boolean
        }
        Update: {
          available_online?: boolean
          category_id?: string | null
          code?: string | null
          cost_price?: number | null
          created_at?: string
          default_duration_minutes?: number
          default_price?: number
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          requires_appointment?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_templates: {
        Row: {
          body_ar: string
          body_en: string
          created_at: string
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          template_key: string
          variables: string[] | null
        }
        Insert: {
          body_ar?: string
          body_en?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          template_key: string
          variables?: string[] | null
        }
        Update: {
          body_ar?: string
          body_en?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          template_key?: string
          variables?: string[] | null
        }
        Relationships: []
      }
      staff_branches: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_branches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_positions: {
        Row: {
          created_at: string
          deleted_at: string | null
          department_id: string | null
          description_ar: string | null
          description_en: string | null
          group_key: string | null
          id: string
          is_active: boolean
          salary_range_max: number | null
          salary_range_min: number | null
          sort_order: number
          title_ar: string
          title_en: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          department_id?: string | null
          description_ar?: string | null
          description_en?: string | null
          group_key?: string | null
          id?: string
          is_active?: boolean
          salary_range_max?: number | null
          salary_range_min?: number | null
          sort_order?: number
          title_ar: string
          title_en: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          department_id?: string | null
          description_ar?: string | null
          description_en?: string | null
          group_key?: string | null
          id?: string
          is_active?: boolean
          salary_range_max?: number | null
          salary_range_min?: number | null
          sort_order?: number
          title_ar?: string
          title_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_positions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          address: string | null
          annual_leave_balance: number
          bank_account: string | null
          bank_name: string | null
          branch_id: string | null
          commission_percent: number
          contract_end_date: string | null
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at: string
          date_of_birth: string | null
          deleted_at: string | null
          department_id: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employee_id: string
          hire_date: string
          id: string
          national_id: string | null
          position_id: string | null
          profile_image_url: string | null
          salary: number
          salary_currency: string
          sick_leave_balance: number
          status: Database["public"]["Enums"]["staff_status"]
          termination_date: string | null
          termination_reason: string | null
          updated_at: string
          working_hours_per_week: number
        }
        Insert: {
          address?: string | null
          annual_leave_balance?: number
          bank_account?: string | null
          bank_name?: string | null
          branch_id?: string | null
          commission_percent?: number
          contract_end_date?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          department_id?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_id: string
          hire_date?: string
          id: string
          national_id?: string | null
          position_id?: string | null
          profile_image_url?: string | null
          salary?: number
          salary_currency?: string
          sick_leave_balance?: number
          status?: Database["public"]["Enums"]["staff_status"]
          termination_date?: string | null
          termination_reason?: string | null
          updated_at?: string
          working_hours_per_week?: number
        }
        Update: {
          address?: string | null
          annual_leave_balance?: number
          bank_account?: string | null
          bank_name?: string | null
          branch_id?: string | null
          commission_percent?: number
          contract_end_date?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          department_id?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_id?: string
          hire_date?: string
          id?: string
          national_id?: string | null
          position_id?: string | null
          profile_image_url?: string | null
          salary?: number
          salary_currency?: string
          sick_leave_balance?: number
          status?: Database["public"]["Enums"]["staff_status"]
          termination_date?: string | null
          termination_reason?: string | null
          updated_at?: string
          working_hours_per_week?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_profiles_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "staff_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_targets: {
        Row: {
          bonus_type: string
          bonus_value: number
          branch_id: string | null
          created_at: string
          created_by: string | null
          id: string
          metric_type: string
          name_ar: string | null
          name_en: string | null
          notes: string | null
          period_end: string
          period_start: string
          staff_id: string
          status: string
          target_value: number
          updated_at: string
        }
        Insert: {
          bonus_type?: string
          bonus_value?: number
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metric_type: string
          name_ar?: string | null
          name_en?: string | null
          notes?: string | null
          period_end: string
          period_start: string
          staff_id: string
          status?: string
          target_value: number
          updated_at?: string
        }
        Update: {
          bonus_type?: string
          bonus_value?: number
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metric_type?: string
          name_ar?: string | null
          name_en?: string | null
          notes?: string | null
          period_end?: string
          period_start?: string
          staff_id?: string
          status?: string
          target_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_targets_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_alerts: {
        Row: {
          alert_type: Database["public"]["Enums"]["alert_type"]
          branch_id: string
          created_at: string
          id: string
          is_resolved: boolean
          product_id: string
          quantity: number
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          alert_type: Database["public"]["Enums"]["alert_type"]
          branch_id: string
          created_at?: string
          id?: string
          is_resolved?: boolean
          product_id: string
          quantity?: number
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          alert_type?: Database["public"]["Enums"]["alert_type"]
          branch_id?: string
          created_at?: string
          id?: string
          is_resolved?: boolean
          product_id?: string
          quantity?: number
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_alerts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_addons: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          feature_key: string
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          price_monthly: number
          price_yearly: number
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          feature_key: string
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          price_monthly?: number
          price_yearly?: number
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          feature_key?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          price_monthly?: number
          price_yearly?: number
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          created_at: string
          currency: string
          description_ar: string | null
          description_en: string | null
          display_order: number
          features: Json
          id: string
          is_active: boolean
          is_popular: boolean
          max_branches: number
          max_invoices_monthly: number
          max_patients: number
          max_staff: number
          name_ar: string
          name_en: string
          price_monthly: number
          price_yearly: number
        }
        Insert: {
          created_at?: string
          currency?: string
          description_ar?: string | null
          description_en?: string | null
          display_order?: number
          features?: Json
          id?: string
          is_active?: boolean
          is_popular?: boolean
          max_branches?: number
          max_invoices_monthly?: number
          max_patients?: number
          max_staff?: number
          name_ar: string
          name_en: string
          price_monthly?: number
          price_yearly?: number
        }
        Update: {
          created_at?: string
          currency?: string
          description_ar?: string | null
          description_en?: string | null
          display_order?: number
          features?: Json
          id?: string
          is_active?: boolean
          is_popular?: boolean
          max_branches?: number
          max_invoices_monthly?: number
          max_patients?: number
          max_staff?: number
          name_ar?: string
          name_en?: string
          price_monthly?: number
          price_yearly?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          paymob_subscription_id: string | null
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          paymob_subscription_id?: string | null
          plan_id: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          paymob_subscription_id?: string | null
          plan_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          notes: string | null
          phone: string | null
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          notes?: string | null
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          notes?: string | null
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      system_backups: {
        Row: {
          backup_type: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          rows_count: number | null
          size_bytes: number | null
          status: string
          tables_count: number | null
        }
        Insert: {
          backup_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          rows_count?: number | null
          size_bytes?: number | null
          status?: string
          tables_count?: number | null
        }
        Update: {
          backup_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          rows_count?: number | null
          size_bytes?: number | null
          status?: string
          tables_count?: number | null
        }
        Relationships: []
      }
      system_languages: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          is_rtl: boolean
          name_ar: string
          name_en: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_rtl?: boolean
          name_ar: string
          name_en: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_rtl?: boolean
          name_ar?: string
          name_en?: string
        }
        Relationships: []
      }
      tenant_addons: {
        Row: {
          addon_id: string
          created_at: string
          id: string
          status: Database["public"]["Enums"]["addon_status"]
          tenant_id: string
        }
        Insert: {
          addon_id: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["addon_status"]
          tenant_id: string
        }
        Update: {
          addon_id?: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["addon_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "subscription_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_addons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_usage: {
        Row: {
          branches_count: number
          created_at: string
          id: string
          invoices_count: number
          patients_count: number
          period_end: string
          period_start: string
          staff_count: number
          storage_used_mb: number
          tenant_id: string
        }
        Insert: {
          branches_count?: number
          created_at?: string
          id?: string
          invoices_count?: number
          patients_count?: number
          period_end: string
          period_start: string
          staff_count?: number
          storage_used_mb?: number
          tenant_id: string
        }
        Update: {
          branches_count?: number
          created_at?: string
          id?: string
          invoices_count?: number
          patients_count?: number
          period_end?: string
          period_start?: string
          staff_count?: number
          storage_used_mb?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          billing_address: string | null
          billing_city: string | null
          billing_country: string | null
          billing_email: string | null
          billing_phone: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          owner_id: string | null
          plan_id: string | null
          slug: string
          subscription_ends_at: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          tax_id: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_address?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_email?: string | null
          billing_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          owner_id?: string | null
          plan_id?: string | null
          slug: string
          subscription_ends_at?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          tax_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_address?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_email?: string | null
          billing_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string | null
          plan_id?: string | null
          slug?: string
          subscription_ends_at?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          tax_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      treasury: {
        Row: {
          branch_id: string
          created_at: string
          currency: string
          current_balance: number
          deleted_at: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          non_cash_balance: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          currency?: string
          current_balance?: number
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          non_cash_balance?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          currency?: string
          current_balance?: number
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          non_cash_balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treasury_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      treasury_daily_closes: {
        Row: {
          branch_id: string
          business_date: string
          closed_at: string
          closed_by: string | null
          counted_cash: number
          created_at: string
          expected_cash: number
          id: string
          locked: boolean
          non_cash_total: number
          notes: string | null
          opening_cash: number
          treasury_id: string
          updated_at: string
          variance: number | null
        }
        Insert: {
          branch_id: string
          business_date: string
          closed_at?: string
          closed_by?: string | null
          counted_cash?: number
          created_at?: string
          expected_cash?: number
          id?: string
          locked?: boolean
          non_cash_total?: number
          notes?: string | null
          opening_cash?: number
          treasury_id: string
          updated_at?: string
          variance?: number | null
        }
        Update: {
          branch_id?: string
          business_date?: string
          closed_at?: string
          closed_by?: string | null
          counted_cash?: number
          created_at?: string
          expected_cash?: number
          id?: string
          locked?: boolean
          non_cash_total?: number
          notes?: string | null
          opening_cash?: number
          treasury_id?: string
          updated_at?: string
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "treasury_daily_closes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_daily_closes_treasury_id_fkey"
            columns: ["treasury_id"]
            isOneToOne: false
            referencedRelation: "treasury"
            referencedColumns: ["id"]
          },
        ]
      }
      treasury_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          description_ar: string | null
          description_en: string
          id: string
          is_cash: boolean
          reference_id: string | null
          reference_type: string | null
          transaction_type: Database["public"]["Enums"]["treasury_tx_type"]
          treasury_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          created_by?: string | null
          description_ar?: string | null
          description_en: string
          id?: string
          is_cash?: boolean
          reference_id?: string | null
          reference_type?: string | null
          transaction_type: Database["public"]["Enums"]["treasury_tx_type"]
          treasury_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          created_by?: string | null
          description_ar?: string | null
          description_en?: string
          id?: string
          is_cash?: boolean
          reference_id?: string | null
          reference_type?: string | null
          transaction_type?: Database["public"]["Enums"]["treasury_tx_type"]
          treasury_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "treasury_transactions_treasury_id_fkey"
            columns: ["treasury_id"]
            isOneToOne: false
            referencedRelation: "treasury"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plans: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          doctor_id: string | null
          end_date: string | null
          id: string
          invoice_id: string | null
          name_ar: string | null
          name_en: string | null
          notes: string | null
          patient_id: string
          price: number
          start_date: string
          status: string
          total_sessions: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          doctor_id?: string | null
          end_date?: string | null
          id?: string
          invoice_id?: string | null
          name_ar?: string | null
          name_en?: string | null
          notes?: string | null
          patient_id: string
          price?: number
          start_date?: string
          status?: string
          total_sessions?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          doctor_id?: string | null
          end_date?: string | null
          id?: string
          invoice_id?: string | null
          name_ar?: string | null
          name_en?: string | null
          notes?: string | null
          patient_id?: string
          price?: number
          start_date?: string
          status?: string
          total_sessions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plans_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plans_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plans_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_sessions: {
        Row: {
          appointment_id: string | null
          created_at: string
          created_by: string | null
          doctor_id: string | null
          id: string
          invoice_id: string | null
          notes: string | null
          performed_at: string | null
          scheduled_date: string | null
          session_number: number
          status: string
          treatment_plan_id: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          created_by?: string | null
          doctor_id?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          performed_at?: string | null
          scheduled_date?: string | null
          session_number: number
          status?: string
          treatment_plan_id: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          created_by?: string | null
          doctor_id?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          performed_at?: string | null
          scheduled_date?: string | null
          session_number?: number
          status?: string
          treatment_plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_sessions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_sessions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_sessions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_sessions_treatment_plan_id_fkey"
            columns: ["treatment_plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_logs: {
        Row: {
          activity_type: string
          created_at: string
          description_ar: string | null
          description_en: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          user_id: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vital_signs: {
        Row: {
          blood_oxygen: number | null
          blood_pressure_diastolic: number | null
          blood_pressure_systolic: number | null
          blood_sugar: number | null
          bmi: number | null
          created_at: string
          heart_rate: number | null
          height: number | null
          id: string
          medical_record_id: string | null
          notes: string | null
          patient_id: string
          recorded_at: string
          recorded_by: string | null
          respiratory_rate: number | null
          temperature: number | null
          weight: number | null
        }
        Insert: {
          blood_oxygen?: number | null
          blood_pressure_diastolic?: number | null
          blood_pressure_systolic?: number | null
          blood_sugar?: number | null
          bmi?: number | null
          created_at?: string
          heart_rate?: number | null
          height?: number | null
          id?: string
          medical_record_id?: string | null
          notes?: string | null
          patient_id: string
          recorded_at?: string
          recorded_by?: string | null
          respiratory_rate?: number | null
          temperature?: number | null
          weight?: number | null
        }
        Update: {
          blood_oxygen?: number | null
          blood_pressure_diastolic?: number | null
          blood_pressure_systolic?: number | null
          blood_sugar?: number | null
          bmi?: number | null
          created_at?: string
          heart_rate?: number | null
          height?: number | null
          id?: string
          medical_record_id?: string | null
          notes?: string | null
          patient_id?: string
          recorded_at?: string
          recorded_by?: string | null
          respiratory_rate?: number | null
          temperature?: number | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vital_signs_medical_record_id_fkey"
            columns: ["medical_record_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vital_signs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vital_signs_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          body_ar: string
          body_en: string
          created_at: string
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          template_key: string
          variables: string[] | null
        }
        Insert: {
          body_ar?: string
          body_en?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          template_key: string
          variables?: string[] | null
        }
        Update: {
          body_ar?: string
          body_en?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          template_key?: string
          variables?: string[] | null
        }
        Relationships: []
      }
      work_schedules: {
        Row: {
          branch_id: string | null
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_working_day: boolean
          room: string | null
          staff_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_working_day?: boolean
          room?: string | null
          staff_id: string
          start_time: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_working_day?: boolean
          room?: string | null
          staff_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_schedules_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_schedules_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _audit_write: {
        Args: {
          p_action: string
          p_branch_id: string
          p_entity_id: string
          p_entity_type: string
          p_fallback?: string
          p_new: Json
          p_old: Json
        }
        Returns: undefined
      }
      _get_cron_secret: { Args: never; Returns: string }
      _set_cron_secret: { Args: { p_secret: string }; Returns: undefined }
      _treasury_assert_open_period: {
        Args: {
          _branch_id: string
          _business_date: string
          _treasury_id: string
        }
        Returns: undefined
      }
      add_treasury_tx: {
        Args: {
          _amount: number
          _by: string
          _desc_ar: string
          _desc_en: string
          _is_cash?: boolean
          _ref_id: string
          _ref_type: string
          _treasury_id: string
          _type: Database["public"]["Enums"]["treasury_tx_type"]
        }
        Returns: string
      }
      apply_coupon_code: {
        Args: { _code: string; _subtotal: number }
        Returns: Json
      }
      apply_inventory_tx: {
        Args: {
          _batch: string
          _branch_id: string
          _by: string
          _expiry: string
          _notes_ar: string
          _notes_en: string
          _product_id: string
          _ref_id: string
          _ref_type: string
          _signed_qty: number
          _type: Database["public"]["Enums"]["inventory_tx_type"]
          _unit_cost: number
        }
        Returns: string
      }
      apply_wallet_tx: {
        Args: {
          _amount: number
          _branch_id?: string
          _notes_ar: string
          _notes_en: string
          _patient_id: string
          _reference_id: string
          _reference_type: string
          _tx_type: Database["public"]["Enums"]["wallet_tx_type"]
        }
        Returns: string
      }
      check_expiry_alerts: { Args: never; Returns: number }
      current_user_branch_id: { Args: never; Returns: string }
      default_treasury_for_branch: {
        Args: { _branch_id: string }
        Returns: string
      }
      enqueue_appointment_reminders: {
        Args: { p_appointment_id: string }
        Returns: undefined
      }
      expense_treasury_self_audit: {
        Args: { _branch_id?: string }
        Returns: {
          action: string
          category: string
          id: string
          reason: string
          severity: string
          status: string
          title: string
        }[]
      }
      fn_consume_for_invoice: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
      fn_resolve_coverage: {
        Args: {
          _contract_id: string
          _item_type: Database["public"]["Enums"]["invoice_item_type"]
          _line_total: number
          _product_id: string
        }
        Returns: {
          covered_amount: number
          rule_id: string
        }[]
      }
      fn_treasury_day_cash_summary: {
        Args: { _business_date: string; _treasury_id: string; _tz?: string }
        Returns: {
          cash_expense: number
          cash_income: number
          expected_cash: number
          non_cash_total: number
          opening_cash: number
        }[]
      }
      generate_employee_id: { Args: never; Returns: string }
      generate_invoice_number: { Args: never; Returns: string }
      generate_po_number: { Args: never; Returns: string }
      generate_product_sku: { Args: never; Returns: string }
      generate_saas_invoice_number: { Args: never; Returns: string }
      get_clinic_logo: { Args: { _branch_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_tenant_owner: { Args: { _tenant_id: string }; Returns: boolean }
      merge_staff_position: {
        Args: { source_id: string; target_id: string }
        Returns: undefined
      }
      realtime_topic_branch_allowed: {
        Args: { _topic: string }
        Returns: boolean
      }
      recalc_commissions_for_invoice: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
      recalc_invoice_payments: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
      recalc_invoice_subtotal: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
      recalc_po_subtotal: { Args: { _po_id: string }; Returns: undefined }
      receive_po_item: {
        Args: {
          _batch: string
          _by: string
          _expiry: string
          _po_item_id: string
          _qty: number
        }
        Returns: undefined
      }
      render_template: {
        Args: { body: string; payload: Json }
        Returns: string
      }
      renumber_active_invoices: { Args: never; Returns: undefined }
      renumber_active_patient_codes: { Args: never; Returns: undefined }
      staff_target_actual: { Args: { _target_id: string }; Returns: number }
      storage_patient_docs_branch_allowed: {
        Args: { _name: string }
        Returns: boolean
      }
      user_has_branch_access: { Args: { _branch: string }; Returns: boolean }
      user_has_branch_access_via_invoice: {
        Args: { _invoice: string }
        Returns: boolean
      }
      user_has_branch_access_via_medical_record: {
        Args: { _rec: string }
        Returns: boolean
      }
      user_has_branch_access_via_patient: {
        Args: { _patient: string }
        Returns: boolean
      }
      user_has_branch_access_via_physio_case: {
        Args: { _case: string }
        Returns: boolean
      }
      user_has_branch_access_via_prescription: {
        Args: { _rx: string }
        Returns: boolean
      }
      user_has_branch_access_via_treasury: {
        Args: { _treasury: string }
        Returns: boolean
      }
      user_has_branch_access_via_treatment_plan: {
        Args: { _plan: string }
        Returns: boolean
      }
    }
    Enums: {
      addon_status: "active" | "cancelled"
      alert_type: "low_stock" | "out_of_stock" | "expiring_soon" | "expired"
      app_role:
        | "admin"
        | "doctor"
        | "receptionist"
        | "staff"
        | "manager"
        | "nurse"
        | "accountant"
        | "hr"
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
        | "departed"
      attendance_method:
        | "manual"
        | "fingerprint"
        | "face_recognition"
        | "qr_code"
      attendance_status:
        | "present"
        | "absent"
        | "late"
        | "early_leave"
        | "half_day"
        | "on_leave"
      billing_cycle: "monthly" | "yearly"
      claim_status:
        | "none"
        | "pending"
        | "submitted"
        | "approved"
        | "rejected"
        | "paid"
      commission_status: "pending" | "partial" | "earned" | "paid" | "cancelled"
      contract_type: "full_time" | "part_time" | "contract" | "freelance"
      document_type:
        | "lab_result"
        | "xray"
        | "mri"
        | "ct_scan"
        | "prescription"
        | "report"
        | "other"
      expense_method: "cash" | "card" | "bank_transfer"
      gender: "male" | "female"
      inventory_tx_type:
        | "purchase"
        | "sale"
        | "adjustment"
        | "transfer_in"
        | "transfer_out"
        | "return"
        | "expiry"
      invoice_item_type: "service" | "product" | "procedure"
      invoice_status: "draft" | "pending" | "paid" | "partial" | "cancelled"
      leave_request_status: "pending" | "approved" | "rejected" | "cancelled"
      medical_record_status: "draft" | "completed" | "reviewed"
      notification_channel: "email" | "sms" | "whatsapp" | "push"
      notification_type:
        | "appointment"
        | "payment"
        | "follow_up"
        | "system"
        | "alert"
      payment_method: "cash" | "card" | "bank_transfer" | "insurance" | "wallet"
      payment_method_type:
        | "cash"
        | "card"
        | "bank_transfer"
        | "wallet"
        | "insurance"
        | "other"
      payroll_status: "draft" | "approved" | "paid"
      physio_attendance: "scheduled" | "done" | "missed" | "cancelled"
      physio_case_status: "active" | "paused" | "completed" | "cancelled"
      physio_trend: "improving" | "unchanged" | "worsening"
      po_status: "draft" | "pending" | "partial" | "received" | "cancelled"
      prescription_status: "active" | "completed" | "cancelled"
      reminder_channel: "sms" | "email" | "whatsapp" | "push"
      reminder_status: "pending" | "sent" | "failed" | "cancelled"
      report_category:
        | "financial"
        | "operational"
        | "medical"
        | "hr"
        | "inventory"
      report_format: "pdf" | "excel" | "both"
      report_frequency: "daily" | "weekly" | "monthly"
      saas_invoice_status: "draft" | "sent" | "paid" | "void"
      saas_payment_method: "card" | "bank_transfer" | "cash"
      saas_payment_provider: "stripe" | "paymob" | "fawry" | "manual"
      saas_payment_status: "pending" | "completed" | "failed" | "refunded"
      salary_adjustment_type: "bonus" | "deduction" | "allowance" | "penalty"
      setting_value_type: "string" | "number" | "boolean" | "json"
      sms_provider: "twilio" | "messagebird" | "custom"
      staff_status: "active" | "on_leave" | "terminated" | "suspended"
      subscription_status:
        | "trial"
        | "active"
        | "past_due"
        | "cancelled"
        | "expired"
      tooth_status:
        | "healthy"
        | "caries"
        | "filled"
        | "crown"
        | "implant"
        | "extracted"
        | "root_canal"
        | "bridge"
      treasury_tx_type: "income" | "expense" | "transfer"
      visit_type: "consultation" | "follow_up" | "procedure" | "emergency"
      wallet_tx_type:
        | "topup"
        | "spend"
        | "refund"
        | "referral_reward"
        | "adjustment_credit"
        | "adjustment_debit"
      whatsapp_provider: "twilio" | "meta" | "custom"
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
      addon_status: ["active", "cancelled"],
      alert_type: ["low_stock", "out_of_stock", "expiring_soon", "expired"],
      app_role: [
        "admin",
        "doctor",
        "receptionist",
        "staff",
        "manager",
        "nurse",
        "accountant",
        "hr",
      ],
      appointment_status: [
        "scheduled",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
        "departed",
      ],
      attendance_method: [
        "manual",
        "fingerprint",
        "face_recognition",
        "qr_code",
      ],
      attendance_status: [
        "present",
        "absent",
        "late",
        "early_leave",
        "half_day",
        "on_leave",
      ],
      billing_cycle: ["monthly", "yearly"],
      claim_status: [
        "none",
        "pending",
        "submitted",
        "approved",
        "rejected",
        "paid",
      ],
      commission_status: ["pending", "partial", "earned", "paid", "cancelled"],
      contract_type: ["full_time", "part_time", "contract", "freelance"],
      document_type: [
        "lab_result",
        "xray",
        "mri",
        "ct_scan",
        "prescription",
        "report",
        "other",
      ],
      expense_method: ["cash", "card", "bank_transfer"],
      gender: ["male", "female"],
      inventory_tx_type: [
        "purchase",
        "sale",
        "adjustment",
        "transfer_in",
        "transfer_out",
        "return",
        "expiry",
      ],
      invoice_item_type: ["service", "product", "procedure"],
      invoice_status: ["draft", "pending", "paid", "partial", "cancelled"],
      leave_request_status: ["pending", "approved", "rejected", "cancelled"],
      medical_record_status: ["draft", "completed", "reviewed"],
      notification_channel: ["email", "sms", "whatsapp", "push"],
      notification_type: [
        "appointment",
        "payment",
        "follow_up",
        "system",
        "alert",
      ],
      payment_method: ["cash", "card", "bank_transfer", "insurance", "wallet"],
      payment_method_type: [
        "cash",
        "card",
        "bank_transfer",
        "wallet",
        "insurance",
        "other",
      ],
      payroll_status: ["draft", "approved", "paid"],
      physio_attendance: ["scheduled", "done", "missed", "cancelled"],
      physio_case_status: ["active", "paused", "completed", "cancelled"],
      physio_trend: ["improving", "unchanged", "worsening"],
      po_status: ["draft", "pending", "partial", "received", "cancelled"],
      prescription_status: ["active", "completed", "cancelled"],
      reminder_channel: ["sms", "email", "whatsapp", "push"],
      reminder_status: ["pending", "sent", "failed", "cancelled"],
      report_category: [
        "financial",
        "operational",
        "medical",
        "hr",
        "inventory",
      ],
      report_format: ["pdf", "excel", "both"],
      report_frequency: ["daily", "weekly", "monthly"],
      saas_invoice_status: ["draft", "sent", "paid", "void"],
      saas_payment_method: ["card", "bank_transfer", "cash"],
      saas_payment_provider: ["stripe", "paymob", "fawry", "manual"],
      saas_payment_status: ["pending", "completed", "failed", "refunded"],
      salary_adjustment_type: ["bonus", "deduction", "allowance", "penalty"],
      setting_value_type: ["string", "number", "boolean", "json"],
      sms_provider: ["twilio", "messagebird", "custom"],
      staff_status: ["active", "on_leave", "terminated", "suspended"],
      subscription_status: [
        "trial",
        "active",
        "past_due",
        "cancelled",
        "expired",
      ],
      tooth_status: [
        "healthy",
        "caries",
        "filled",
        "crown",
        "implant",
        "extracted",
        "root_canal",
        "bridge",
      ],
      treasury_tx_type: ["income", "expense", "transfer"],
      visit_type: ["consultation", "follow_up", "procedure", "emergency"],
      wallet_tx_type: [
        "topup",
        "spend",
        "refund",
        "referral_reward",
        "adjustment_credit",
        "adjustment_debit",
      ],
      whatsapp_provider: ["twilio", "meta", "custom"],
    },
  },
} as const
