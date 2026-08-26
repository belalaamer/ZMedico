-- Editable templates for manually sharing Patient Portal credentials.
-- Passwords are never stored in templates; they are runtime placeholders only.
INSERT INTO public.email_templates
  (template_key, name_ar, name_en, subject_ar, subject_en, body_ar, body_en, variables, is_active)
VALUES
  (
    'patient_portal_credentials',
    'بيانات دخول بوابة المريض',
    'Patient Portal Credentials',
    'بيانات دخول بوابة المريض',
    'Your Patient Portal access details',
    'عزيزي/عزيزتي {{patient_name_ar}}،\n\nيمكنك الدخول إلى بوابة المريض للاطلاع على مواعيدك وجلساتك وبيانات المتابعة من الرابط التالي:\n{{patient_portal_url}}\n\nاسم المستخدم: {{patient_portal_username}}\nكلمة المرور المؤقتة: {{patient_portal_password}}\n\nيرجى تغيير كلمة المرور بعد أول دخول.\nللدعم أو الشكاوى: {{support_contact}}',
    'Dear {{patient_name}},\n\nYou can access your Patient Portal to view your appointments, sessions, and follow-up details:\n{{patient_portal_url}}\n\nUsername: {{patient_portal_username}}\nTemporary password: {{patient_portal_password}}\n\nPlease change the password after your first sign-in.\nSupport: {{support_contact}}',
    ARRAY['patient_name','patient_name_ar','patient_portal_username','patient_portal_password','patient_portal_url','support_contact'],
    true
  )
ON CONFLICT (template_key) DO NOTHING;

INSERT INTO public.sms_templates
  (template_key, name_ar, name_en, body_ar, body_en, variables, is_active)
VALUES
  (
    'patient_portal_credentials',
    'بيانات دخول بوابة المريض',
    'Patient Portal Credentials',
    'بوابة المريض: {{patient_portal_url}} | المستخدم: {{patient_portal_username}} | كلمة المرور المؤقتة: {{patient_portal_password}} | الدعم: {{support_contact}}',
    'Patient Portal: {{patient_portal_url}} | Username: {{patient_portal_username}} | Temporary password: {{patient_portal_password}} | Support: {{support_contact}}',
    ARRAY['patient_portal_username','patient_portal_password','patient_portal_url','support_contact'],
    true
  )
ON CONFLICT (template_key) DO NOTHING;

INSERT INTO public.whatsapp_templates
  (template_key, name_ar, name_en, body_ar, body_en, variables, is_active)
VALUES
  (
    'patient_portal_credentials',
    'بيانات دخول بوابة المريض',
    'Patient Portal Credentials',
    'مرحبًا {{patient_name_ar}}،\n\nبيانات دخول بوابة المريض:\nالرابط: {{patient_portal_url}}\nاسم المستخدم: {{patient_portal_username}}\nكلمة المرور المؤقتة: {{patient_portal_password}}\n\nيرجى تغيير كلمة المرور بعد أول دخول.\nللدعم: {{support_contact}}',
    'Hello {{patient_name}},\n\nYour Patient Portal access details:\nLink: {{patient_portal_url}}\nUsername: {{patient_portal_username}}\nTemporary password: {{patient_portal_password}}\n\nPlease change the password after your first sign-in.\nSupport: {{support_contact}}',
    ARRAY['patient_name','patient_name_ar','patient_portal_username','patient_portal_password','patient_portal_url','support_contact'],
    true
  )
ON CONFLICT (template_key) DO NOTHING;
