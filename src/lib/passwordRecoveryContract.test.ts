import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { recoveryRedirectTo } from "./passwordRecovery";
import { dict } from "./i18n";

/**
 * Batch 24 gave the patient portal the recovery entry it never had (P3) by
 * joining the staff desk's flow rather than copying it, and made the recovery
 * screen return each desk to its own login. Two screens, one action: the ways
 * that can drift apart are the request itself, the address it points at, and the
 * words the patient is answered with — so all three are frozen here, against the
 * source rather than against this file's memory of it.
 */

const sourceAt = (relative: string) => readFileSync(path.resolve(process.cwd(), relative), "utf8");
const staffLogin = sourceAt("src/pages/auth/Auth.tsx");
const portalLogin = sourceAt("src/pages/patientPortal/PatientPortalLogin.tsx");
const recoveryScreen = sourceAt("src/pages/auth/ResetPassword.tsx");
const routes = sourceAt("src/App.tsx");

const sourceTree = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sourceTree(full));
    else if (/\.(tsx|ts)$/.test(entry.name) && !/\.(test|spec)\.(tsx|ts)$/.test(entry.name)) out.push(full);
  }
  return out.sort();
};

describe("the two login screens share one recovery request (P3)", () => {
  it("keeps exactly one caller of the provider's recovery endpoint", () => {
    const callers = sourceTree("src").filter((file) => /resetPasswordForEmail\s*\(/.test(sourceAt(file)));
    expect(callers).toEqual(["src/lib/passwordRecovery.ts"]);
    expect(staffLogin).toContain("requestPasswordRecovery(email, \"staff\")");
    expect(portalLogin).toContain("requestPasswordRecovery(email, \"patient\")");
  });

  it("points both desks at the same screen and distinguishes only the origin", () => {
    const staff = recoveryRedirectTo("staff");
    const patient = recoveryRedirectTo("patient");
    // The staff value is what production has been sending; a change here is a
    // change to a link already in someone's inbox.
    expect(staff).toBe(`${window.location.origin}/reset-password`);
    expect(new URL(patient).pathname).toBe(new URL(staff).pathname);
    expect(new URL(patient).search).toBe("?from=patient");
    expect(new URL(staff).search).toBe("");
  });

  it("answers both desks with the same success words from the dictionary", () => {
    expect(staffLogin).toContain('t("resetLinkSent")');
    expect(portalLogin).toContain('t("resetLinkSent")');
    expect(dict.en.resetLinkSent).toBe("Check your email for the reset link");
    expect(dict.ar.resetLinkSent).toBe("تحقق من بريدك الإلكتروني للحصول على رابط إعادة التعيين");
  });

  it("holds the failure copy the staff desk speaks, in both dictionaries", () => {
    // Auth.tsx still carries these three sentences inline (the unification is a
    // deferred item, not this batch's scope); the portal reads the same words out
    // of the dictionary. So each English literal below is the reference, and the
    // ternary Auth.tsx must contain is composed from the dictionary's own Arabic
    // value: a re-word on either side — source, en, or ar — fails one of the two
    // assertions, which is the only thing standing between the two screens and a
    // second word for the same failure (C19's shape).
    const copies = [
      ["invalidRecoveryEmail", "Enter a valid email"],
      ["recoverySendFailed", "Unable to send the recovery link. Check your connection and try again later."],
      ["recoverySendUncertain", "Sending the link could not be confirmed. Check your inbox before trying again."],
    ] as const;
    for (const [key, en] of copies) {
      expect(dict.en[key], `the English desk no longer says what the staff desk says for ${key}`).toBe(en);
      expect(staffLogin, `Auth.tsx's ${key} sentence no longer matches the dictionaries`).toContain(
        `lang === "ar" ? "${dict.ar[key]}" : "${en}"`,
      );
      // Self-probe: the containment is value-sensitive, not a substring fluke --
      // one character of drift in the pinned Arabic flips this to `not.toContain`.
      expect(staffLogin).not.toContain(`lang === "ar" ? "${dict.ar[key]} " : "${en}"`);
      expect(portalLogin, `the portal stopped speaking ${key} from the dictionary`).toContain(`t("${key}")`);
    }
  });

  it("names only keys the dictionaries hold, on the screen the patient reads", () => {
    // Which words the portal can print is frozen, not how often: it asks for the
    // invalid-address key twice (once before the request, once as the guard that a
    // never-sent request is never reported as sent).
    const used = [...new Set([...portalLogin.matchAll(/\bt\("([^"]+)"\)/g)].map((m) => m[1]))].sort();
    expect(used.length).toBeGreaterThan(5);
    expect(used).toEqual([
      "cancel", "email", "forgotPassword", "invalidRecoveryEmail", "recoveryEmailHint",
      "recoverySendFailed", "recoverySendUncertain", "resetLinkSent", "sendResetLink",
    ]);
    for (const key of used) {
      expect(key in dict.en, `${key} is missing from the English desk`).toBe(true);
      expect(key in dict.ar, `${key} is missing from the Arabic desk`).toBe(true);
      expect(dict.ar[key], `${key} still holds its English text`).not.toBe(dict.en[key]);
    }
  });

  it("sends each recovery back to the login that asked, and that login exists", () => {
    expect(recoveryScreen).not.toMatch(/nav\("\/auth"/);
    expect(recoveryScreen).toContain('.get("from") === "patient" ? "/patient-portal/login" : "/auth"');
    // A destination that is not a route is a second dead end with a nicer name.
    expect(routes).toContain('path="/patient-portal/login"');
    expect(routes).toContain('path="/auth"');
    expect(recoveryScreen.match(/nav\(backToSignIn/g)?.length).toBe(3);
  });
});
