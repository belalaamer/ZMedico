-- Allow only the server-side Edge Function role to use the existing SECURITY DEFINER audit helper.
GRANT EXECUTE ON FUNCTION public._audit_write(text, uuid, text, jsonb, jsonb, uuid, uuid) TO service_role;
