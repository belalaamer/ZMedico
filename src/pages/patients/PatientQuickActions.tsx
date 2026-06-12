import { Calendar, CreditCard, Wallet, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/contexts/I18nContext";
import { usePermissions } from "@/hooks/usePermissions";

type Props = {
  onBook?: () => void;
  onRecordPayment?: () => void;
  onTopupWallet?: () => void;
  onCreateInvoice?: () => void;
  onUploadDocument?: () => void;
};

export default function PatientQuickActions({
  onBook, onRecordPayment, onTopupWallet, onCreateInvoice, onUploadDocument,
}: Props) {
  const { lang } = useI18n();
  const { can } = usePermissions();

  const items: { key: string; icon: any; label: string; onClick?: () => void; show: boolean }[] = [
    {
      key: "book",
      icon: Calendar,
      label: lang === "ar" ? "حجز موعد" : "Book appointment",
      onClick: onBook,
      show: can("appointments", "create"),
    },
    {
      key: "invoice",
      icon: FileText,
      label: lang === "ar" ? "إنشاء فاتورة" : "Create invoice",
      onClick: onCreateInvoice,
      show: can("invoices", "create"),
    },
    {
      key: "pay",
      icon: CreditCard,
      label: lang === "ar" ? "تسجيل دفعة" : "Record payment",
      onClick: onRecordPayment,
      show: can("invoices", "create"),
    },
    {
      key: "topup",
      icon: Wallet,
      label: lang === "ar" ? "شحن المحفظة" : "Top-up wallet",
      onClick: onTopupWallet,
      show: can("invoices", "create"),
    },
    {
      key: "upload",
      icon: Upload,
      label: lang === "ar" ? "رفع مستند" : "Upload document",
      onClick: onUploadDocument,
      show: can("medical_records", "create") || can("patients", "edit"),
    },
  ];

  const visible = items.filter((i) => i.show);
  if (!visible.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((it) => {
        const Icon = it.icon;
        return (
          <Button key={it.key} size="sm" variant="outline" onClick={it.onClick} className="gap-2">
            <Icon className="size-4" />
            {it.label}
          </Button>
        );
      })}
    </div>
  );
}