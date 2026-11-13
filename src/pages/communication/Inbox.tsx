import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Bot, CircleAlert, MessageSquare, Search, Send, UserRound } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { patientDisplayName, patientDisplayDirection } from "@/lib/patientName";
import { notConfirmedCopy, rowsWritten } from "@/lib/writeOutcome";
import { deskFailure } from "@/lib/deskFailure";
import { useToast } from "@/hooks/use-toast";
import {
  bucketLabel,
  canClose,
  canHandBack,
  canReply,
  canTakeOver,
  conversationBucket,
  countByBucket,
  previewOf,
  sortForDesk,
  statusForAction,
  waitedLabel,
  type InboxAction,
  type InboxBucket,
} from "@/lib/inbox";

type Conversation = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  channel: string | null;
  external_contact_id: string | null;
  patient_id: string | null;
  status: string;
  state: unknown;
  assigned_staff_id: string | null;
  handoff_reason: string | null;
  handoff_at: string | null;
  last_message_at: string | null;
};

type Message = {
  id: string;
  conversation_id: string;
  direction: string;
  sender_type: string | null;
  content: string | null;
  delivery_status: string | null;
  ai_generated: boolean | null;
  created_at: string;
};

type PatientName = {
  id: string;
  first_name_en: string | null;
  last_name_en: string | null;
  first_name_ar: string | null;
  last_name_ar: string | null;
  phone: string | null;
};

const FILTERS: { key: InboxBucket | "all" }[] = [
  { key: "needs_human" },
  { key: "ai" },
  { key: "closed" },
  { key: "all" },
];

/**
 * The patient-conversation inbox: where a conversation the AI handed to a human
 * actually gets answered.
 *
 * The backend already does the hard part. `ai-agent-respond` writes
 * `status = 'human_active'` (plus `handoff_reason` and `handoff_at`) when it calls
 * `handoff_to_human`, and again when its own turn fails; `whatsapp-webhook` does the
 * same when it cannot reach the orchestrator. From that moment the assistant stays
 * silent -- it refuses to run unless the status is `ai_active` -- so a handoff with
 * no staff surface is a patient nobody answers. This screen is that surface:
 * triage, take over, reply, hand back, close.
 *
 * The reply path is deliberately two steps. The outbound `messages` row is written
 * first so the thread shows exactly what the staff member typed even if delivery
 * fails, then `send-conversation-reply` decides whether the send is still allowed
 * (the thread must still be held by a human, and the branch must have WhatsApp
 * enabled) and writes the outcome back onto that row.
 */
export default function CommunicationInbox() {
  const { lang } = useI18n();
  const { currentBranchId, branchSelectionReady } = useBranch();
  const { user } = useAuth();
  const { authz } = useAuthorization("CommunicationInbox");
  const { toast } = useToast();

  const [rows, setRows] = useState<Conversation[]>([]);
  const [names, setNames] = useState<Record<string, PatientName>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<InboxBucket | "all">("needs_human");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const threadEnd = useRef<HTMLDivElement | null>(null);

  const canView = authz.can("communication.view");
  const canRespond = authz.can("communication.respond");

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);
  const counts = useMemo(() => countByBucket(rows), [rows]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (filter !== "all" && conversationBucket(row.status) !== filter) return false;
      if (!needle) return true;
      const patient = row.patient_id ? names[row.patient_id] : null;
      const haystack = [
        patient ? patientDisplayName(patient, lang) : "",
        patient?.phone ?? "",
        row.external_contact_id ?? "",
        row.handoff_reason ?? "",
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
    return sortForDesk(filtered);
  }, [rows, filter, search, names, lang]);

  // Re-render the "waiting N min" labels once a minute; a queue that never moves
  // would otherwise keep claiming the wait it had when the page opened.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const loadConversations = async () => {
    if (!branchSelectionReady || !currentBranchId || !canView) {
      setRows([]);
      setLoading(!branchSelectionReady);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("conversations")
      .select("id,tenant_id,branch_id,channel,external_contact_id,patient_id,status,state,assigned_staff_id,handoff_reason,handoff_at,last_message_at")
      .eq("branch_id", currentBranchId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) {
      const failure = deskFailure(error, lang, lang === "ar" ? "تعذر تحميل المحادثات." : "Could not load the conversations.");
      toast({ title: failure.title, description: failure.description, variant: "destructive" });
      setRows([]);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as Conversation[];
    setRows(list);

    const patientIds = Array.from(new Set(list.map((r) => r.patient_id).filter(Boolean))) as string[];
    if (patientIds.length) {
      const { data: patients } = await supabase
        .from("patients")
        .select("id,first_name_en,last_name_en,first_name_ar,last_name_ar,phone")
        .in("id", patientIds);
      const map: Record<string, PatientName> = {};
      for (const p of (patients ?? []) as PatientName[]) map[p.id] = p;
      setNames(map);
    } else {
      setNames({});
    }
    setLoading(false);
  };

  const loadThread = async (conversationId: string) => {
    setThreadLoading(true);
    const { data, error } = await supabase
      .from("messages")
      .select("id,conversation_id,direction,sender_type,content,delivery_status,ai_generated,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(300);
    if (error) {
      const failure = deskFailure(error, lang, lang === "ar" ? "تعذر تحميل الرسائل." : "Could not load the messages.");
      toast({ title: failure.title, description: failure.description, variant: "destructive" });
    }
    setMessages((data ?? []) as Message[]);
    setThreadLoading(false);
  };

  useEffect(() => {
    void loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchSelectionReady, currentBranchId, canView]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    setDraft("");
    void loadThread(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  /** Take over / hand back / close — the three halves of the human handoff. */
  const applyAction = async (action: InboxAction) => {
    if (!selected || busy) return;
    setBusy(true);
    const patch: Record<string, unknown> = { status: statusForAction(action) };
    if (action === "take_over") {
      patch.assigned_staff_id = user?.id ?? null;
      // S1: keep the original `handoff_at`. It is when the patient was escalated,
      // and the screen shows wait time from it; overwriting it with "now" erased
      // how long the patient actually waited.
    }
    if (action === "hand_back") {
      // S2: keep `handoff_reason`/`handoff_at`. Clearing them destroyed the record
      // of why the patient was escalated in the first place. A later escalation
      // overwrites them itself, so preserving them here is safe.
      patch.assigned_staff_id = null;
    }
    const { data, error } = await supabase
      .from("conversations")
      .update(patch as never)
      .eq("id", selected.id)
      .select("id");
    setBusy(false);
    if (error) {
      const failure = deskFailure(error, lang, lang === "ar" ? "تعذر تحديث المحادثة." : "The conversation was not updated.");
      toast({ title: failure.title, description: failure.description, variant: "destructive" });
      return;
    }
    // RLS answers a write it filtered to zero rows with 2xx and no representation,
    // so "nothing came back" is the only signal that the change did not happen.
    if (rowsWritten(data) === 0) {
      toast({ title: notConfirmedCopy(lang, "save"), variant: "destructive" });
      void loadConversations();
      return;
    }
    // S6: record the action in the audit trail. Best-effort: the status change has
    // already happened, and an audit RPC that is not yet deployed must not make a
    // completed handover look failed. The RPC attributes the row to auth.uid().
    void supabase
      .rpc("log_conversation_action" as never, { p_conversation_id: selected.id, p_action: action } as never)
      .then(({ error: auditError }) => {
        if (auditError) console.warn("[inbox] conversation audit failed", auditError.message);
      }, () => undefined);
    setRows((current) => current.map((row) => (row.id === selected.id ? { ...row, ...patch } as Conversation : row)));
    toast({
      title:
        action === "take_over"
          ? lang === "ar" ? "التحويل إليك — المساعد توقف عن الرد" : "Taken over — the assistant stopped replying"
          : action === "hand_back"
            ? lang === "ar" ? "أُعيد إلى المساعد" : "Handed back to the assistant"
            : lang === "ar" ? "أُغلقت المحادثة" : "Conversation closed",
    });
  };

  const sendReply = async () => {
    if (!selected || busy) return;
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: selected.id,
        tenant_id: selected.tenant_id,
        direction: "outbound",
        sender_type: "staff",
        content: body,
        delivery_status: "queued",
        ai_generated: false,
      })
      .select("id")
      .single();
    if (error || !data) {
      setBusy(false);
      const failure = deskFailure(error, lang, lang === "ar" ? "لم يُحفظ الرد." : "The reply was not saved.");
      toast({ title: failure.title, description: failure.description, variant: "destructive" });
      return;
    }

    const messageId = (data as { id: string }).id;
    // S3: the draft is NOT cleared yet. If sending fails the operator must not
    // have to retype a paragraph they just wrote.
    // Optimistic row so the thread shows the sentence immediately; the reload below
    // replaces it with what was actually recorded.
    setMessages((current) => [
      ...current,
      {
        id: messageId,
        conversation_id: selected.id,
        direction: "outbound",
        sender_type: "staff",
        content: body,
        delivery_status: "queued",
        ai_generated: false,
        created_at: new Date().toISOString(),
      },
    ]);

    const { data: result, error: sendError } = await supabase.functions.invoke("send-conversation-reply", {
      body: { message_id: messageId },
    });
    setBusy(false);
    await loadThread(selected.id);
    void loadConversations();

    // S4: on a non-2xx reply `supabase.functions.invoke` returns `data = null` and
    // puts the response on `error.context`; the function's `code` is only reachable
    // there. Reading `payload.code` alone always saw undefined and fell through to
    // a raw error string.
    const payload = (result ?? {}) as { sent?: boolean; recorded?: boolean; error?: string; code?: string };
    let resolvedCode = payload.code;
    let resolvedMessage = payload.error ?? sendError?.message;
    const context = (sendError as { context?: Response } | null)?.context;
    if (!resolvedCode && context && typeof context.clone === "function") {
      try {
        const parsed = await context.clone().json() as { code?: string; error?: string };
        resolvedCode = parsed?.code;
        resolvedMessage = parsed?.error ?? resolvedMessage;
      } catch { /* the body was not JSON; keep the generic message */ }
    }

    if (sendError || !payload.sent) {
      const reason = resolvedCode === "NOT_HUMAN_HELD"
        ? lang === "ar" ? "أُعيدت المحادثة للمساعد، فلم يُرسل الرد." : "The conversation went back to the assistant, so the reply was not sent."
        : resolvedCode === "WHATSAPP_DISABLED"
          ? lang === "ar" ? "إرسال واتساب معطّل لهذا الفرع." : "WhatsApp delivery is disabled for this branch."
          : resolvedCode === "WHATSAPP_NOT_CONFIGURED"
            ? lang === "ar" ? "واتساب غير مُهيّأ لهذا الفرع." : "WhatsApp is not configured for this branch."
            : resolvedCode === "ALREADY_SENT"
              ? lang === "ar" ? "هذا الرد أُرسل بالفعل." : "This reply was already sent."
              : resolvedCode === "IN_FLIGHT"
                ? lang === "ar" ? "هذا الرد قيد الإرسال بالفعل. انتظر لحظة ثم أعد المحاولة." : "This reply is already being sent. Wait a moment, then retry."
                : resolvedMessage ?? (lang === "ar" ? "تعذّر الإرسال." : "The reply was not sent.");
      toast({ title: reason, description: lang === "ar" ? "الرسالة محفوظة في المحادثة ولم تُسلَّم للمريض." : "The message is kept in the thread and was not delivered.", variant: "destructive" });
      return;
    }
    // Only a delivered reply consumes the draft.
    setDraft("");
    toast({
      title: payload.recorded === false
        ? lang === "ar" ? "أُرسل للمريض، لكن لم يُسجَّل تأكيد التسليم" : "Sent to the patient, but the delivery confirmation was not recorded"
        : lang === "ar" ? "أُرسل" : "Sent",
    });
  };

  if (!canView) {
    return (
      <Card className="p-8 text-center">
        <CircleAlert className="mx-auto mb-3 size-8 text-destructive" />
        <div className="font-semibold">{lang === "ar" ? "هذه الشاشة تحتاج صلاحية عرض المحادثات" : "This screen needs the conversations permission"}</div>
      </Card>
    );
  }

  if (!branchSelectionReady) {
    return <Card className="p-8 text-center text-muted-foreground">{lang === "ar" ? "جارٍ تحديد الفرع…" : "Choosing the branch…"}</Card>;
  }

  const emptyQueue = lang === "ar" ? "لا توجد محادثات في هذا التصنيف" : "No conversations in this view";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <MessageSquare className="size-4" />
            {lang === "ar" ? "محادثات المرضى" : "Patient conversations"}
          </div>
          <h1 className="text-2xl font-bold">{lang === "ar" ? "صندوق المحادثات" : "Conversation inbox"}</h1>
          <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
            {lang === "ar"
              ? "المحادثات التي حوّلها المساعد الذكي إلى موظف تظهر أولًا. المساعد يتوقف عن الرد بمجرد أن تستلمها."
              : "Threads the assistant handed to a person come first. The assistant stops replying the moment you take one over."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((entry) => {
            const active = filter === entry.key;
            const total = entry.key === "all" ? rows.length : counts[entry.key];
            return (
              <Button
                key={entry.key}
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => setFilter(entry.key)}
              >
                {entry.key === "all" ? (lang === "ar" ? "الكل" : "All") : bucketLabel(entry.key, lang)}
                <Badge variant="secondary" className="ms-2">{total}</Badge>
              </Button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="flex min-h-[32rem] flex-col overflow-hidden">
          <div className="border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="ps-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={lang === "ar" ? "ابحث بالاسم أو الرقم" : "Search by name or number"}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">{lang === "ar" ? "جارٍ التحميل…" : "Loading…"}</div>
            ) : visible.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">{emptyQueue}</div>
            ) : (
              <ul className="divide-y">
                {visible.map((row) => {
                  const patient = row.patient_id ? names[row.patient_id] : null;
                  const name = patient ? patientDisplayName(patient, lang) : row.external_contact_id ?? (lang === "ar" ? "رقم غير معروف" : "Unknown number");
                  const bucket = conversationBucket(row.status);
                  const isSelected = row.id === selectedId;
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.id)}
                        className={`flex w-full flex-col gap-1 p-3 text-start transition-colors hover:bg-muted/60 ${isSelected ? "bg-muted" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="min-w-0 truncate font-semibold"
                            dir={patient ? patientDisplayDirection(patient, lang) : "ltr"}
                          >
                            {name}
                          </span>
                          <Badge variant={bucket === "needs_human" ? "destructive" : bucket === "ai" ? "secondary" : "outline"}>
                            {bucketLabel(bucket, lang)}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="min-w-0 truncate">{previewOf(row.handoff_reason) || row.external_contact_id || ""}</span>
                          <span className="shrink-0">
                            {bucket === "needs_human"
                              ? waitedLabel(row.handoff_at ?? row.last_message_at, now, lang)
                              : formatDateTime(row.last_message_at, lang)}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        <Card className="flex min-h-[32rem] flex-col overflow-hidden">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
              {lang === "ar" ? "اختر محادثة من القائمة لعرضها" : "Choose a conversation to read it"}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2 border-b p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold">
                    <UserRound className="size-4 text-muted-foreground" />
                    <span className="truncate">
                      {selected.patient_id && names[selected.patient_id]
                        ? patientDisplayName(names[selected.patient_id], lang)
                        : selected.external_contact_id ?? (lang === "ar" ? "رقم غير معروف" : "Unknown number")}
                    </span>
                    <Badge variant={conversationBucket(selected.status) === "needs_human" ? "destructive" : "outline"}>
                      {bucketLabel(conversationBucket(selected.status), lang)}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span dir="ltr">{selected.external_contact_id ?? "—"}</span>
                    <span>{selected.channel ?? "whatsapp"}</span>
                    {selected.handoff_reason ? <span className="truncate">{previewOf(selected.handoff_reason, 60)}</span> : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canRespond && canTakeOver(selected.status) ? (
                    <Button size="sm" disabled={busy} onClick={() => void applyAction("take_over")}>
                      {lang === "ar" ? "استلام المحادثة" : "Take over"}
                    </Button>
                  ) : null}
                  {canRespond && canHandBack(selected.status) ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void applyAction("hand_back")}>
                      <Bot className="me-1 size-4" />
                      {lang === "ar" ? "إعادة إلى المساعد" : "Hand back to assistant"}
                    </Button>
                  ) : null}
                  {canRespond && canClose(selected.status) ? (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void applyAction("close")}>
                      {lang === "ar" ? "إغلاق" : "Close"}
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {threadLoading ? (
                  <div className="text-center text-sm text-muted-foreground">{lang === "ar" ? "جارٍ تحميل الرسائل…" : "Loading messages…"}</div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground">{lang === "ar" ? "لا رسائل بعد" : "No messages yet"}</div>
                ) : (
                  messages.map((message) => {
                    const outbound = message.direction === "outbound";
                    const fromAi = message.sender_type === "ai" || message.ai_generated === true;
                    const failed = message.delivery_status === "failed";
                    const queued = message.delivery_status === "queued";
                    return (
                      <div key={message.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[85%] rounded-xl border px-3 py-2 text-sm ${outbound ? "bg-primary/5" : "bg-muted"}`}
                        >
                          <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>
                              {outbound
                                ? fromAi
                                  ? lang === "ar" ? "المساعد" : "Assistant"
                                  : lang === "ar" ? "الموظف" : "Staff"
                                : lang === "ar" ? "المريض" : "Patient"}
                            </span>
                            <span>{formatDateTime(message.created_at, lang)}</span>
                            {failed ? <Badge variant="destructive">{lang === "ar" ? "لم تُسلَّم" : "Not delivered"}</Badge> : null}
                            {queued ? <Badge variant="outline">{lang === "ar" ? "قيد الإرسال" : "Sending"}</Badge> : null}
                          </div>
                          <div className="whitespace-pre-wrap break-words">{message.content ?? ""}</div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={threadEnd} />
              </div>

              <div className="border-t p-3">
                {canRespond && canReply(selected.status) ? (
                  <div className="space-y-2">
                    <Textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      rows={3}
                      placeholder={lang === "ar" ? "اكتب ردك للمريض…" : "Write your reply to the patient…"}
                      disabled={busy}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {lang === "ar" ? "يُرسل عبر واتساب ويُحفظ في المحادثة" : "Sends over WhatsApp and is kept in the thread"}
                      </span>
                      <Button size="sm" disabled={busy || !draft.trim()} onClick={() => void sendReply()}>
                        <Send className="me-1 size-4" />
                        {lang === "ar" ? "إرسال" : "Send"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {conversationBucket(selected.status) === "closed"
                      ? lang === "ar" ? "هذه المحادثة مغلقة. رسالة المريض القادمة تبدأ محادثة جديدة." : "This thread is closed. The patient's next message starts a new one."
                      : !canRespond
                        ? lang === "ar" ? "تحتاج صلاحية الرد على المرضى لإرسال رسالة." : "You need the respond permission to send a message."
                        : lang === "ar" ? "استلم المحادثة أولًا لتتمكن من الرد — المساعد يردّ حاليًا." : "Take the conversation over before replying — the assistant is answering right now."}
                  </div>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
