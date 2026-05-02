import { useEffect, useState } from "react";
import { Loader2, MapPin, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import LocationMap from "@/components/LocationMap";
import { useI18n } from "@/contexts/I18nContext";
import { getCurrentLocation, distanceMeters, type Coords } from "@/lib/geo";

type Branch = {
  id: string;
  name_en: string; name_ar: string;
  allowed_latitude: number | null;
  allowed_longitude: number | null;
  allowed_radius: number | null;
};

type Props = {
  open: boolean;
  mode: "in" | "out";
  branch: Branch | null;
  onClose: () => void;
  onConfirm: (payload: {
    coords: Coords;
    within: boolean;
    reason?: string;
  }) => Promise<void> | void;
};

export default function GpsCheckDialog({ open, mode, branch, onClose, onConfirm }: Props) {
  const { t, lang } = useI18n();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const radius = branch?.allowed_radius ?? 100;
  const branchHasLocation = !!(branch?.allowed_latitude && branch?.allowed_longitude);

  const distance = coords && branchHasLocation
    ? Math.round(distanceMeters(coords.lat, coords.lon, branch!.allowed_latitude!, branch!.allowed_longitude!))
    : null;
  const within = distance !== null ? distance <= radius : false;

  const fetchLocation = async () => {
    setLoading(true);
    setError(null);
    try {
      const c = await getCurrentLocation();
      setCoords(c);
    } catch (e: any) {
      setError(e.message || "Failed to get location");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setCoords(null); setError(null); setReason(""); setSubmitting(false);
      fetchLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleConfirm = async () => {
    if (!coords) return;
    if (!within && branchHasLocation && !reason.trim()) return;
    setSubmitting(true);
    try {
      await onConfirm({ coords, within: branchHasLocation ? within : true, reason: reason.trim() || undefined });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const branchName = branch ? (lang === "ar" ? branch.name_ar : branch.name_en) : "";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="size-5 text-primary" />
            {mode === "in" ? t("checkIn") : t("checkOut")} — {branchName}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /> {t("gettingLocation") ?? "Getting location..."}
          </div>
        )}

        {error && !loading && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
            <div className="mt-2"><Button size="sm" variant="outline" onClick={fetchLocation}>{t("retry") ?? "Retry"}</Button></div>
          </div>
        )}

        {coords && !loading && (
          <div className="space-y-3">
            {branchHasLocation ? (
              <>
                <LocationMap
                  center={{ lat: branch!.allowed_latitude!, lon: branch!.allowed_longitude! }}
                  user={{ lat: coords.lat, lon: coords.lon }}
                  radius={radius}
                />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {within ? (
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-0">
                      <CheckCircle2 className="size-3 me-1" /> {t("withinAllowedZone") ?? "Within allowed area"}
                    </Badge>
                  ) : (
                    <Badge className="bg-destructive/10 text-destructive border-0">
                      <AlertTriangle className="size-3 me-1" /> {t("outsideAllowedZone") ?? "Outside allowed area"}
                    </Badge>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {(t("distance") ?? "Distance")}: {distance} m · {(t("accuracy") ?? "Accuracy")}: ±{coords.accuracy ?? "?"} m
                  </div>
                </div>
                {!within && (
                  <div>
                    <Label>{t("reason") ?? "Reason"} *</Label>
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonForOutsideZone") ?? "Why are you outside the allowed zone?"} />
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                {t("branchLocationNotSet") ?? "Branch location not set. Location will be recorded without zone validation."}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>{t("cancel")}</Button>
          <Button
            onClick={handleConfirm}
            disabled={!coords || loading || submitting || (!within && branchHasLocation && !reason.trim())}
          >
            {submitting ? <Loader2 className="size-4 animate-spin me-1" /> : null}
            {mode === "in" ? t("checkIn") : t("checkOut")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
