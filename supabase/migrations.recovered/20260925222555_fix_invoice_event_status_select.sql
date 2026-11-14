-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260925222555
-- name: fix_invoice_event_status_select
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

create or replace function public.enqueue_invoice_event(p_invoice_id uuid, p_event_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i record;
  p record;
  b record;
  tpl record;
  payload jsonb;
begin
  if p_event_type <> 'invoice_issued' then return; end if;

  select inv.id, inv.patient_id, inv.branch_id, inv.invoice_number,
         inv.total, inv.paid_amount, inv.status
    into i
    from public.invoices inv
   where inv.id = p_invoice_id;

  if not found or i.branch_id is null or i.status::text = 'draft'
     or not public.communication_event_enabled(i.branch_id, p_event_type) then
    return;
  end if;

  select first_name_en, last_name_en, first_name_ar, last_name_ar, phone,
         whatsapp_opt_in, name_language
    into p
    from public.patients
   where id = i.patient_id and deleted_at is null;
  if not found then return; end if;

  select name_en, name_ar into b from public.branches where id = i.branch_id;

  for tpl in
    select * from public.communication_templates
     where branch_id = i.branch_id and event_type = p_event_type and enabled = true
  loop
    if tpl.channel = 'whatsapp' and not coalesce(p.whatsapp_opt_in, false) then continue; end if;
    if tpl.channel = 'whatsapp'
       and coalesce((select whatsapp_provider::text from public.notification_settings where branch_id = i.branch_id), 'custom') = 'meta'
       and nullif(trim(tpl.meta_template_name), '') is null then continue; end if;

    payload := jsonb_build_object(
      'patient_name', trim(coalesce(p.first_name_en,'') || ' ' || coalesce(p.last_name_en,'')),
      'patient_name_ar', trim(coalesce(p.first_name_ar,'') || ' ' || coalesce(p.last_name_ar,'')),
      'invoice_number', i.invoice_number,
      'total', i.total,
      'paid_amount', i.paid_amount,
      'remaining', greatest(coalesce(i.total,0) - coalesce(i.paid_amount,0), 0),
      'branch_name', coalesce(b.name_en, ''),
      'branch_name_ar', coalesce(b.name_ar, ''),
      'invoice_id', i.id,
      'meta_template_name', tpl.meta_template_name,
      'meta_template_language', tpl.meta_template_language,
      'meta_template_params', jsonb_build_array(
        case when coalesce(p.name_language, 'en') = 'ar'
          then trim(coalesce(p.first_name_ar,'') || ' ' || coalesce(p.last_name_ar,''))
          else trim(coalesce(p.first_name_en,'') || ' ' || coalesce(p.last_name_en,'')) end,
        i.invoice_number, i.total::text,
        greatest(coalesce(i.total,0) - coalesce(i.paid_amount,0), 0)::text
      )
    );

    insert into public.reminders (
      invoice_id, patient_id, branch_id, reminder_type, scheduled_time,
      message_en, message_ar, status, event_type, template_key, payload,
      destination_phone, destination_channel, dedupe_key
    ) values (
      i.id, i.patient_id, i.branch_id, tpl.channel::public.reminder_channel, now(),
      public.render_template(tpl.body_en, payload), public.render_template(tpl.body_ar, payload),
      'pending', p_event_type, p_event_type || ':' || tpl.channel, payload,
      p.phone, tpl.channel, i.id::text || ':' || p_event_type || ':' || tpl.channel
    ) on conflict do nothing;
  end loop;
end;
$$;
