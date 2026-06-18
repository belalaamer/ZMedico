import { Link } from "react-router-dom";

export default function Trust() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-12 space-y-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Trust &amp; Privacy</p>
          <h1 className="text-3xl font-semibold">Security &amp; Privacy</h1>
          <p className="text-sm text-muted-foreground">
            This page is maintained by the clinic operator to answer common
            security and privacy questions about this application. It is
            editable content, not an independent certification.
          </p>
        </header>

        <section className="space-y-2">
          <h2 className="text-xl font-medium">Who this app is for</h2>
          <p className="text-sm text-muted-foreground">
            The application is an internal staff tool used by clinic
            personnel to manage appointments, patients, billing and inventory.
            It is not a public-facing patient portal.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-medium">Access &amp; authentication</h2>
          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
            <li>Access requires a staff account; there is no anonymous use.</li>
            <li>User roles (admin, manager, doctor, receptionist, staff, HR) determine which features and data a user can reach.</li>
            <li>Branch-level isolation restricts staff to the branches they are explicitly assigned to.</li>
            <li>Sensitive admin operations (user creation, password reset, exports) run through audited server-side functions.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-medium">Data protection</h2>
          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
            <li>Row-level security is enabled on application tables, scoped by branch or ownership.</li>
            <li>Patient documents are stored in a private bucket and served via short-lived signed URLs.</li>
            <li>Third-party credentials (SMS, WhatsApp, email) are readable only by administrators.</li>
            <li>Background jobs that bypass per-row rules authenticate with a shared cron secret.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-medium">Platform &amp; hosting</h2>
          <p className="text-sm text-muted-foreground">
            The application is built on Lovable and uses Lovable Cloud
            (Supabase) for authentication, database, storage and edge
            functions. Listing these platform capabilities is not a
            certification of the operator&apos;s practices.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-medium">Shared responsibility</h2>
          <p className="text-sm text-muted-foreground">
            The platform provides the secure infrastructure. The clinic
            operator is responsible for configuring access, managing staff
            accounts, defining retention practices, responding to data
            requests, and complying with applicable local regulations.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-medium">Reporting a security issue</h2>
          <p className="text-sm text-muted-foreground">
            If you believe you have found a vulnerability or a privacy
            concern, contact the clinic administrator directly so they can
            investigate and coordinate a fix.
          </p>
        </section>

        <footer className="pt-8 border-t text-xs text-muted-foreground">
          <Link to="/" className="underline hover:text-foreground">Return to app</Link>
        </footer>
      </div>
    </div>
  );
}