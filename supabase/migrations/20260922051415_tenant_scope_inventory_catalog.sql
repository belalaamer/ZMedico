ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT;
ALTER TABLE public.product_categories
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT;

WITH product_tenants AS (
  SELECT i.product_id, min(b.tenant_id::text)::uuid AS tenant_id
  FROM public.inventory i
  JOIN public.branches b ON b.id = i.branch_id
  WHERE b.tenant_id IS NOT NULL
  GROUP BY i.product_id
  HAVING count(DISTINCT b.tenant_id) = 1
)
UPDATE public.products p
SET tenant_id = pt.tenant_id
FROM product_tenants pt
WHERE p.id = pt.product_id AND p.tenant_id IS NULL;

WITH supplier_tenants AS (
  SELECT supplier_id, min(tenant_id::text)::uuid AS tenant_id
  FROM public.products
  WHERE supplier_id IS NOT NULL AND tenant_id IS NOT NULL
  GROUP BY supplier_id
  HAVING count(DISTINCT tenant_id) = 1
)
UPDATE public.suppliers s
SET tenant_id = st.tenant_id
FROM supplier_tenants st
WHERE s.id = st.supplier_id AND s.tenant_id IS NULL;

WITH category_tenants AS (
  SELECT category_id, min(tenant_id::text)::uuid AS tenant_id
  FROM public.products
  WHERE category_id IS NOT NULL AND tenant_id IS NOT NULL
  GROUP BY category_id
  HAVING count(DISTINCT tenant_id) = 1
)
UPDATE public.product_categories c
SET tenant_id = ct.tenant_id
FROM category_tenants ct
WHERE c.id = ct.category_id AND c.tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON public.products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_id ON public.suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_tenant_id ON public.product_categories(tenant_id);

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_barcode_key;

CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_sku_key
  ON public.products(tenant_id, sku);
CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_barcode_key
  ON public.products(tenant_id, barcode)
  WHERE barcode IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_inventory_catalog_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_related_tenant uuid;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required for inventory catalog rows'
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'products' THEN
    IF NEW.category_id IS NOT NULL THEN
      SELECT tenant_id INTO v_related_tenant
      FROM public.product_categories
      WHERE id = NEW.category_id;
      IF v_related_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'product category belongs to a different tenant'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    IF NEW.supplier_id IS NOT NULL THEN
      SELECT tenant_id INTO v_related_tenant
      FROM public.suppliers
      WHERE id = NEW.supplier_id;
      IF v_related_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'product supplier belongs to a different tenant'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'product_categories' AND NEW.parent_id IS NOT NULL THEN
    SELECT tenant_id INTO v_related_tenant
    FROM public.product_categories
    WHERE id = NEW.parent_id;
    IF v_related_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'parent category belongs to a different tenant'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_products_tenant_guard ON public.products;
CREATE TRIGGER trg_products_tenant_guard
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.enforce_inventory_catalog_tenant();

DROP TRIGGER IF EXISTS trg_suppliers_tenant_guard ON public.suppliers;
CREATE TRIGGER trg_suppliers_tenant_guard
BEFORE INSERT OR UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.enforce_inventory_catalog_tenant();

DROP TRIGGER IF EXISTS trg_product_categories_tenant_guard ON public.product_categories;
CREATE TRIGGER trg_product_categories_tenant_guard
BEFORE INSERT OR UPDATE ON public.product_categories
FOR EACH ROW EXECUTE FUNCTION public.enforce_inventory_catalog_tenant();

DROP POLICY IF EXISTS prd_select ON public.products;
DROP POLICY IF EXISTS prd_insert_admin ON public.products;
DROP POLICY IF EXISTS prd_update_admin ON public.products;
DROP POLICY IF EXISTS prd_delete_admin ON public.products;
DROP POLICY IF EXISTS manager_products_insert ON public.products;
DROP POLICY IF EXISTS manager_products_update ON public.products;

CREATE POLICY prd_select ON public.products FOR SELECT TO public
USING (
  public.has_role(auth.uid(), 'system_owner'::public.app_role)
  OR (
    (public.has_permission(auth.uid(), 'inventory.view')
     OR public.has_permission(auth.uid(), 'settings.view'))
    AND public.user_has_tenant_access(tenant_id)
  )
);

CREATE POLICY prd_insert ON public.products FOR INSERT TO authenticated
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.user_has_tenant_access(tenant_id)
  AND (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  )
);

CREATE POLICY prd_update ON public.products FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'system_owner'::public.app_role)
  OR (
    public.user_has_tenant_access(tenant_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
    )
  )
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.user_has_tenant_access(tenant_id)
  AND (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  )
);

CREATE POLICY prd_delete ON public.products FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'system_owner'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.user_has_tenant_access(tenant_id)
  )
);

DROP POLICY IF EXISTS sup_select ON public.suppliers;
DROP POLICY IF EXISTS sup_insert_admin ON public.suppliers;
DROP POLICY IF EXISTS sup_update_admin ON public.suppliers;
DROP POLICY IF EXISTS sup_delete_admin ON public.suppliers;
DROP POLICY IF EXISTS manager_suppliers_insert ON public.suppliers;
DROP POLICY IF EXISTS manager_suppliers_update ON public.suppliers;

CREATE POLICY sup_select ON public.suppliers FOR SELECT TO public
USING (
  public.has_role(auth.uid(), 'system_owner'::public.app_role)
  OR (
    (public.has_permission(auth.uid(), 'inventory.view')
     OR public.has_permission(auth.uid(), 'settings.view'))
    AND public.user_has_tenant_access(tenant_id)
  )
);

CREATE POLICY sup_insert ON public.suppliers FOR INSERT TO authenticated
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.user_has_tenant_access(tenant_id)
  AND (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  )
);

CREATE POLICY sup_update ON public.suppliers FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'system_owner'::public.app_role)
  OR (
    public.user_has_tenant_access(tenant_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
    )
  )
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.user_has_tenant_access(tenant_id)
  AND (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  )
);

CREATE POLICY sup_delete ON public.suppliers FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'system_owner'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.user_has_tenant_access(tenant_id)
  )
);

DROP POLICY IF EXISTS cat_select ON public.product_categories;
DROP POLICY IF EXISTS cat_insert_admin ON public.product_categories;
DROP POLICY IF EXISTS cat_update_admin ON public.product_categories;
DROP POLICY IF EXISTS cat_delete_admin ON public.product_categories;
DROP POLICY IF EXISTS manager_product_categories_insert ON public.product_categories;
DROP POLICY IF EXISTS manager_product_categories_update ON public.product_categories;

CREATE POLICY cat_select ON public.product_categories FOR SELECT TO public
USING (
  public.has_role(auth.uid(), 'system_owner'::public.app_role)
  OR (
    (public.has_permission(auth.uid(), 'inventory.view')
     OR public.has_permission(auth.uid(), 'settings.view'))
    AND public.user_has_tenant_access(tenant_id)
  )
);

CREATE POLICY cat_insert ON public.product_categories FOR INSERT TO authenticated
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.user_has_tenant_access(tenant_id)
  AND (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  )
);

CREATE POLICY cat_update ON public.product_categories FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'system_owner'::public.app_role)
  OR (
    public.user_has_tenant_access(tenant_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
    )
  )
)
WITH CHECK (
  tenant_id IS NOT NULL
  AND public.user_has_tenant_access(tenant_id)
  AND (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  )
);

CREATE POLICY cat_delete ON public.product_categories FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'system_owner'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND public.user_has_tenant_access(tenant_id)
  )
);
