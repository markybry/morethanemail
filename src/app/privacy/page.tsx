import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy · More Than Email",
  description: "What More Than Email does with your Google data.",
};

const UPDATED = "23 November 2026";

export default function Privacy() {
  return (
    <main className="felt min-h-full p-4 sm:p-8">
      <article className="paper mx-auto max-w-2xl rounded-3xl border border-line p-6 text-bark sm:p-10 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-walnut [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-terracotta hover:underline">
          <Logo size={24} /> More Than Email
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-walnut">Privacy policy</h1>
        <p className="text-sm text-muted">Last updated {UPDATED}</p>

        <p>
          More Than Email is a workflow board for Gmail. You sign in with your Google account, and the app shows your
          email as cards you move through your own statuses (To do, Waiting, Done and so on), with notes and next
          actions kept on each card. This policy explains what Google data the app uses, why, and what happens to it.
        </p>

        <h2>Google data the app accesses</h2>
        <p>When you sign in, you are asked to allow:</p>
        <ul>
          <li>
            <strong>Your name, email address and profile picture</strong> (openid, email, profile), to identify your
            account and show who is signed in.
          </li>
          <li>
            <strong>Gmail, &ldquo;view and modify&rdquo;</strong> (gmail.modify). Used to list and show your email
            threads and labels, and, only when you ask, to add or remove labels, archive a thread or
            move it to Trash. The app does not send email and never deletes email permanently.
          </li>
          <li>
            <strong>Google Calendar events</strong> (calendar.events), optional. Used only when you link a meeting to a
            card or create one from a card.
          </li>
        </ul>

        <h2>What is stored</h2>
        <p>The app keeps the following in its database, so your board works between visits:</p>
        <ul>
          <li>Your name, email address and profile picture.</li>
          <li>
            The Google access and refresh tokens that let the app reach Gmail and Calendar on your behalf. They are
            used only to make the requests described above.
          </li>
          <li>
            For emails you put on the board: the Gmail thread ID, subject, sender, a short snippet, the date and its
            label IDs, so the card can be shown without reloading Gmail each time.
          </li>
          <li>What you write in the app: card titles, summaries, notes, next actions, links, statuses and settings.</li>
        </ul>
        <p>
          The full text of your email is not stored. It is fetched from Gmail when you open a thread and shown to you
          only. Attachments are passed straight from Gmail to your browser and not kept.
        </p>

        <h2>How the data is used</h2>
        <ul>
          <li>Only to provide the features you use in the app, for you.</li>
          <li>It is not sold, rented or shared with anyone.</li>
          <li>It is not used for advertising, profiling or market research.</li>
          <li>It is not used to train AI or machine-learning models, and the app sends none of it to AI services.</li>
          <li>No person reads your email or data, except if you ask for help and agree to it, or if the law requires it.</li>
        </ul>
        <p>
          More Than Email&rsquo;s use and transfer of information received from Google APIs adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="font-semibold text-terracotta hover:underline"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>

        <h2>Where it is kept</h2>
        <p>
          The app runs on Vercel and its database is a hosted Postgres service. Data travels over encrypted (HTTPS/TLS)
          connections. Sign-in uses a secure, HTTP-only cookie.
        </p>

        <h2>Removing access and deleting your data</h2>
        <ul>
          <li>
            You can stop the app&rsquo;s access to your Google account at any time from{" "}
            <a href="https://myaccount.google.com/permissions" className="font-semibold text-terracotta hover:underline">
              your Google account permissions
            </a>
            .
          </li>
          <li>
            To delete everything the app has stored about you, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-terracotta hover:underline">
              {CONTACT_EMAIL}
            </a>
            . It is deleted within 30 days. Your Gmail and Calendar themselves are not affected.
          </li>
        </ul>

        <h2>Changes and contact</h2>
        <p>
          If this policy changes, the date at the top changes with it. Questions go to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-terracotta hover:underline">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </article>
    </main>
  );
}
