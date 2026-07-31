// Permissive fallback schema types for the external Supabase project
// (rqcmnfzfytyyicelvifk). Replace with generated types when a service-role
// key or Supabase access token is available.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type GenericRow = { [key: string]: any }

type GenericTable = {
  Row: GenericRow
  Insert: GenericRow
  Update: GenericRow
  Relationships: []
}

type GenericFunction = {
  Args: GenericRow
  Returns: any
}

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12.2.3"
  }
  public: {
    Tables: { [key: string]: GenericTable }
    Views: { [key: string]: GenericTable }
    Functions: { [key: string]: GenericFunction }
    Enums: { [key: string]: string }
    CompositeTypes: { [key: string]: GenericRow }
  }
}

export type Tables<_T extends string = string> = GenericRow
export type TablesInsert<_T extends string = string> = GenericRow
export type TablesUpdate<_T extends string = string> = GenericRow
export type Enums<_T extends string = string> = string
export type CompositeTypes<_T extends string = string> = GenericRow

export const Constants = {
  public: {
    Enums: {},
  },
} as const
