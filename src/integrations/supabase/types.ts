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
      appointments: {
        Row: {
          branch_id: string | null
          created_at: string
          doctor_id: string | null
          duration_minutes: number
          id: string
          notes: string | null
          patient_id: string
          procedure: string | null
          room: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          doctor_id?: string | null
          duration_minutes?: number
          id?: string
          notes?: string | null
          patient_id: string
          procedure?: string | null
          room?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          doctor_id?: string | null
          duration_minutes?: number
          id?: string
          notes?: string | null
          patient_id?: string
          procedure?: string | null
          room?: string | null
          scheduled_at?: string
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
      branches: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name_ar: string
          name_en: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name_ar: string
          name_en: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string
          phone?: string | null
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
          invoice_id: string
          item_type: Database["public"]["Enums"]["invoice_item_type"]
          quantity: number
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en: string
          id?: string
          invoice_id: string
          item_type?: Database["public"]["Enums"]["invoice_item_type"]
          quantity?: number
          total?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string
          id?: string
          invoice_id?: string
          item_type?: Database["public"]["Enums"]["invoice_item_type"]
          quantity?: number
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          discount: number
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          paid_amount: number
          patient_id: string
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          discount?: number
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          notes?: string | null
          paid_amount?: number
          patient_id: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          discount?: number
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          paid_amount?: number
          patient_id?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
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
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          branch_id: string | null
          city: string | null
          created_at: string
          created_by: string | null
          dob: string | null
          email: string | null
          first_name_ar: string | null
          first_name_en: string
          gender: Database["public"]["Enums"]["gender"] | null
          id: string
          last_name_ar: string | null
          last_name_en: string | null
          nationality: string | null
          notes: string | null
          patient_code: number
          phone: string | null
          referral_source: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          branch_id?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          dob?: string | null
          email?: string | null
          first_name_ar?: string | null
          first_name_en: string
          gender?: Database["public"]["Enums"]["gender"] | null
          id?: string
          last_name_ar?: string | null
          last_name_en?: string | null
          nationality?: string | null
          notes?: string | null
          patient_code?: number
          phone?: string | null
          referral_source?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          branch_id?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          dob?: string | null
          email?: string | null
          first_name_ar?: string | null
          first_name_en?: string
          gender?: Database["public"]["Enums"]["gender"] | null
          id?: string
          last_name_ar?: string | null
          last_name_en?: string | null
          nationality?: string | null
          notes?: string | null
          patient_code?: number
          phone?: string | null
          referral_source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_branch_id_fkey"
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
          id: string
          invoice_id: string | null
          notes: string | null
          patient_id: string
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          received_by: string | null
          reference_number: string | null
          treasury_id: string | null
        }
        Insert: {
          amount: number
          branch_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          patient_id: string
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          received_by?: string | null
          reference_number?: string | null
          treasury_id?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          patient_id?: string
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          received_by?: string | null
          reference_number?: string | null
          treasury_id?: string | null
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
      treasury: {
        Row: {
          branch_id: string
          created_at: string
          currency: string
          current_balance: number
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          currency?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          currency?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
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
      treasury_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          description_ar: string | null
          description_en: string
          id: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_treasury_tx: {
        Args: {
          _amount: number
          _by: string
          _desc_ar: string
          _desc_en: string
          _ref_id: string
          _ref_type: string
          _treasury_id: string
          _type: Database["public"]["Enums"]["treasury_tx_type"]
        }
        Returns: string
      }
      default_treasury_for_branch: {
        Args: { _branch_id: string }
        Returns: string
      }
      generate_invoice_number: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      recalc_invoice_payments: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
      recalc_invoice_subtotal: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "doctor" | "receptionist" | "staff"
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
        | "departed"
      expense_method: "cash" | "card" | "bank_transfer"
      gender: "male" | "female"
      invoice_item_type: "service" | "product" | "procedure"
      invoice_status: "draft" | "pending" | "paid" | "partial" | "cancelled"
      payment_method: "cash" | "card" | "bank_transfer" | "insurance" | "wallet"
      treasury_tx_type: "income" | "expense" | "transfer"
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
      app_role: ["admin", "doctor", "receptionist", "staff"],
      appointment_status: [
        "scheduled",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
        "departed",
      ],
      expense_method: ["cash", "card", "bank_transfer"],
      gender: ["male", "female"],
      invoice_item_type: ["service", "product", "procedure"],
      invoice_status: ["draft", "pending", "paid", "partial", "cancelled"],
      payment_method: ["cash", "card", "bank_transfer", "insurance", "wallet"],
      treasury_tx_type: ["income", "expense", "transfer"],
    },
  },
} as const
