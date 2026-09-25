-- Harden tenant integration/configuration writes.
--
-- Tenant membership is a scope check, not authorization to mutate integration
-- configuration. Canonical settings.integrations.manage is currently granted
-- to clinic Admin (and System Owner globally), not to Manager/Accountant/other
-- tenant members.

DROP POLICY IF EXISTS ai_tenant_settings_write_scoped
  ON public.ai_tenant_settings;
CREATE POLICY ai_tenant_settings_write_scoped
ON public.ai_tenant_settings
FOR ALL TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.integrations.manage')
  )
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.integrations.manage')
  )
);

DROP POLICY IF EXISTS channel_accounts_write_scoped
  ON public.channel_accounts;
CREATE POLICY channel_accounts_write_scoped
ON public.channel_accounts
FOR ALL TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.integrations.manage')
  )
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.integrations.manage')
  )
);

DROP POLICY IF EXISTS "comm_tpl admin write"
  ON public.communication_templates;
CREATE POLICY "comm_tpl admin write"
ON public.communication_templates
FOR ALL TO authenticated
USING (
  (
    public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
    OR public.has_permission((SELECT auth.uid()), 'settings.integrations.manage')
  )
  AND public.user_has_branch_access(branch_id)
)
WITH CHECK (
  (
    public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
    OR public.has_permission((SELECT auth.uid()), 'settings.integrations.manage')
  )
  AND public.user_has_branch_access(branch_id)
);
