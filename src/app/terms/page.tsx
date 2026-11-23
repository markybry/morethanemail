import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { APP_NAME, CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: `Terms of service · ${APP_NAME}`,
  description: `The terms for using ${APP_NAME}.`,
};

const UPDATED = "23 November 2026";

export default function Terms() {
  const mail = (
    <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-terracotta hover:underline">
      {CONTACT_EMAIL}
    </a>
  );
  return (
    <main className="felt min-h-full p-4 sm:p-8">
      <article className="paper mx-auto max-w-2xl rounded-3xl border border-line p-6 text-bark sm:p-10 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-walnut [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-terracotta hover:underline">
          <Logo size={24} /> {APP_NAME}
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-walnut">Terms of service</h1>
        <p className="text-sm text-muted">Last updated {UPDATED}</p>

        <p>
          {APP_NAME} is a workflow board for Gmail: it shows your email as cards you move through your own statuses,
          with notes and next actions on each card. By signing in and using it, you agree to these terms.
        </p>

        <h2>Who can use it</h2>
        <p>
          {APP_NAME} is a small, independently run app. Access is by invitation: only Google accounts that have been
          allowed in can sign in.
        </p>

        <h2>Your account and your data</h2>
        <ul>
          <li>You sign in with your own Google account and are responsible for what happens under it.</li>
          <li>
            Your email stays in Gmail and belongs to you. The app acts on it only when you ask (for example, changing
            labels or archiving), as described in the{" "}
            <Link href="/privacy" className="font-semibold text-terracotta hover:underline">
              privacy policy
            </Link>
            .
          </li>
          <li>You can remove the app&rsquo;s access at any time from your Google account permissions.</li>
        </ul>

        <h2>Acceptable use</h2>
        <p>
          Use the app only for your own email and lawful purposes. Don&rsquo;t try to break, overload or get around
          its security, or to reach anyone else&rsquo;s data.
        </p>

        <h2>No warranty</h2>
        <p>
          The app is provided as is, without any warranty. It may change, be unavailable at times, or be withdrawn. Gmail
          remains the record of your email, so nothing in the app replaces it. As far as the law allows, the operator is
          not liable for any loss arising from using the app.
        </p>

        <h2>Ending use</h2>
        <p>
          You can stop using the app at any time and ask for your stored data to be deleted by emailing {mail}. Access
          may be withdrawn from accounts that misuse it.
        </p>

        <h2>Changes and contact</h2>
        <p>If these terms change, the date at the top changes with them. Questions go to {mail}.</p>
      </article>
    </main>
  );
}
