import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A patient document delete touches two stores: the `patient_documents` row and
// the object it points at in the `patient-docs` bucket. In three screens the
// object was removed first and the row second, with no check in between — so a
// row that RLS filtered to zero answered 2xx, the file was gone anyway, and the
// screen kept listing a document that 404s when opened.
//
// zeroRowWriteContract.test.ts already proves the row half asks for its rows.
// This file freezes the half it cannot see: that the Storage removal happens
// only after the row count has been checked, in the same function.
const SURFACES = [
  "src/pages/medical/DocumentsCenter.tsx",
  "src/pages/patients/PatientDocumentsTab.tsx",
  "src/pages/medical/MedicalRecordEditor.tsx",
];

describe("patient document delete order (batch 17)", () => {
  for (const path of SURFACES) {
    it(`${path} removes the stored file only after the row delete is proved`, () => {
      const src = readFileSync(new URL("../../" + path, import.meta.url), "utf8");
      const lines = src.split("\n");
      const rowIndex = lines.findIndex((l) => /from\("patient_documents"\)\.delete\(\)/.test(l));
      expect(rowIndex, "no patient_documents delete in this file").toBeGreaterThan(-1);
      expect(lines[rowIndex]).toContain(".select(");

      const storageIndex = lines.findIndex((l) => /from\("patient-docs"\)\.remove\(/.test(l));
      expect(storageIndex, "no patient-docs removal in this file").toBeGreaterThan(rowIndex);
      // The guard sits between the two: nothing may touch Storage before it.
      const between = lines.slice(rowIndex + 1, storageIndex).join("\n");
      expect(between).toContain("rowsWritten(");
      expect(between).toMatch(/=== 0/);
    });
  }
});
