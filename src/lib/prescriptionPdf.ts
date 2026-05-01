import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Lang = "en" | "ar";

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
}

export function generatePrescriptionPdf(opts: {
  prescription: any;
  items: any[];
  patient: any;
  doctorName?: string;
  clinic?: { name?: string; address?: string; phone?: string } | null;
  lang: Lang;
}) {
  const { prescription, items, patient, doctorName, clinic } = opts;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;

  // Header
  doc.setFillColor(58, 26, 94);
  doc.rect(0, 0, W, 28, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text(clinic?.name || "ZMedico Clinic", M, 14);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  if (clinic?.address) doc.text(clinic.address, M, 20);
  if (clinic?.phone) doc.text(clinic.phone, M, 25);
  doc.setFont("helvetica", "bold"); doc.setFontSize(20);
  doc.text("℞", W - M, 18, { align: "right" });

  doc.setTextColor(0);
  let y = 38;

  // Patient + date
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("PATIENT", M, y);
  doc.text("DATE", W - M - 50, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  const pname = `${patient?.first_name_en ?? ""} ${patient?.last_name_en ?? ""}`.trim();
  doc.text(pname + (patient?.patient_code ? ` #${patient.patient_code}` : ""), M, y);
  doc.text(fmtDate(prescription?.prescription_date || prescription?.created_at), W - M - 50, y);
  y += 5;
  if (patient?.phone) { doc.setTextColor(110); doc.text(patient.phone, M, y); doc.setTextColor(0); y += 5; }

  y += 4;

  autoTable(doc, {
    startY: y,
    head: [["#", "Medication", "Dosage", "Frequency", "Duration", "Qty"]],
    body: items.map((it, i) => [
      String(i + 1),
      `${it.medications?.name_en ?? ""}${it.medications?.strength ? ` ${it.medications.strength}` : ""}\n${it.instructions_en ? `Instr: ${it.instructions_en}` : ""}`,
      it.dosage ?? "—",
      it.frequency ?? "—",
      it.duration ?? "—",
      String(it.quantity ?? 1),
    ]),
    theme: "striped",
    headStyles: { fillColor: [58, 26, 94], textColor: 255 },
    styles: { fontSize: 10, cellPadding: 3 },
    margin: { left: M, right: M },
  });

  let cy = (doc as any).lastAutoTable.finalY + 12;

  if (prescription?.notes_en) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("Notes", M, cy);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    const split = doc.splitTextToSize(prescription.notes_en, W - 2 * M);
    doc.text(split, M, cy + 5);
    cy += 5 + split.length * 4 + 6;
  }

  // Signature
  const sigY = Math.min(H - 30, Math.max(cy + 20, H - 50));
  doc.setDrawColor(180); doc.line(W - M - 70, sigY, W - M, sigY);
  doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(120);
  doc.text(doctorName || "Prescribing Doctor", W - M, sigY + 5, { align: "right" });

  // Footer
  doc.setDrawColor(220); doc.line(M, H - 14, W - M, H - 14);
  doc.setFontSize(8);
  doc.text(`Generated ${new Date().toLocaleString("en-GB")}`, M, H - 8);

  doc.save(`Rx-${prescription?.id?.slice(0, 8) ?? "prescription"}.pdf`);
}