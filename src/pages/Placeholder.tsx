import { Card } from "@/components/ui/card";
import { Construction } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";

export default function Placeholder({ titleKey }: { titleKey: any }) {
  const { t, lang } = useI18n();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t(titleKey)}</h1>
      <Card className="p-12 text-center shadow-card">
        <div className="size-14 mx-auto rounded-2xl gradient-primary text-primary-foreground flex items-center justify-center">
          <Construction className="size-7" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">{lang === "ar" ? "قريباً" : "Coming soon"}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {lang === "ar" ? "هذه الوحدة قيد التطوير في المرحلة التالية." : "This module is part of the next phase."}
        </p>
      </Card>
    </div>
  );
}