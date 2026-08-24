import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import SettingsLayout, { EmbeddedSettingsProvider } from "./SettingsLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/contexts/I18nContext";
import NotificationSettings from "./NotificationSettings";
import RemindersSettings from "./RemindersSettings";
import AutomatedCommunication from "./AutomatedCommunication";
import Templates from "./Templates";
import MetaAdsConnection from "./MetaAdsConnection";

const TABS = ["notifications", "reminders", "automated", "email", "sms", "whatsapp", "meta"] as const;
type TabId = typeof TABS[number];

export default function Communication() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab") as TabId | null;
  const tab: TabId = useMemo(() => (raw && (TABS as readonly string[]).includes(raw) ? raw : "notifications"), [raw]);

  const setTab = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", v);
    setParams(next, { replace: true });
  };

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("communicationHub")}</h1>
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="notifications">{t("notificationSettings")}</TabsTrigger>
            <TabsTrigger value="reminders">{t("reminders")}</TabsTrigger>
            <TabsTrigger value="automated">{t("automatedComm")}</TabsTrigger>
            <TabsTrigger value="email">{t("emailTemplates")}</TabsTrigger>
            <TabsTrigger value="sms">{t("smsTemplates")}</TabsTrigger>
            <TabsTrigger value="whatsapp">{t("whatsappTemplates")}</TabsTrigger>
            <TabsTrigger value="meta">Meta Ads</TabsTrigger>
          </TabsList>
          <EmbeddedSettingsProvider value={true}>
            <TabsContent value="notifications" className="mt-4"><NotificationSettings /></TabsContent>
            <TabsContent value="reminders" className="mt-4"><RemindersSettings /></TabsContent>
            <TabsContent value="automated" className="mt-4"><AutomatedCommunication /></TabsContent>
            <TabsContent value="email" className="mt-4"><Templates kind="email" /></TabsContent>
            <TabsContent value="sms" className="mt-4"><Templates kind="sms" /></TabsContent>
            <TabsContent value="whatsapp" className="mt-4"><Templates kind="whatsapp" /></TabsContent>
            <TabsContent value="meta" className="mt-4"><MetaAdsConnection /></TabsContent>
          </EmbeddedSettingsProvider>
        </Tabs>
      </div>
    </SettingsLayout>
  );
}