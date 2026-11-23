import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { APP_NAME, CONTACT_EMAIL, OPERATOR } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy · More Than Email",
  description: "What More Than Email collects, including Google user data, how it is used, shared, kept and deleted.",
};

const UPDATED = "23 November 2026";

const A = "font-semibold text-terracotta hover:underline";

function Mail() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className={A}>
      {CONTACT_EMAIL}
    </a>
  );
}

export default function Privacy() {
  return (
    <main className="felt min-h-full p-4 sm:p-8">
      <article className="paper mx-auto max-w-2xl rounded-3xl border border-line p-6 text-bark sm:p-10 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-walnut [&_h3]:mt-5 [&_h3]:font-semibold [&_h3]:text-walnut [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-terracotta hover:underline">
          <Logo size={24} /> {APP_NAME}
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-walnut">Privacy policy</h1>
        <p className="text-sm text-muted">Last updated {UPDATED}</p>

        <p>
          {APP_NAME} (&ldquo;the app&rdquo;, &ldquo;we&rdquo;) is a workflow board for Gmail, available at
          morethanemail.vercel.app. You sign in with your Google account, and the app shows your email as cards you move
          through your own statuses (To do, Waiting, Done and so on), with notes and next actions kept on each card.
        </p>
        <p>
          This policy explains what information the app collects, including Google user data, how it is used, who it
          is shared with, how long it is kept, and how you can have it deleted. It applies to everyone who uses the app.
        </p>

        <h2>Who runs the app</h2>
        <p>
          The app is run by {OPERATOR}, who is the data controller for the information described here. You can contact
          them at <Mail />.
        </p>

        <h2>1. Information the app collects</h2>

        <h3>Google user data, with your permission</h3>
        <p>
          When you choose &ldquo;Sign in with Google&rdquo;, Google asks you to grant the app access. It requests only
          these permissions (OAuth scopes):
        </p>
        <ul>
          <li>
            <strong>Basic profile: name, email address and profile picture</strong> (<code>openid</code>,{" "}
            <code>email</code>, <code>profile</code>). Used to create your account, sign you in and show who is signed
            in.
          </li>
          <li>
            <strong>Gmail, read and modify</strong> (<code>https://www.googleapis.com/auth/gmail.modify</code>). Read
            access is used to list your threads and labels, and to show a thread&rsquo;s messages and attachments when
            you open it. Modify access is used only when you take an action in the app: adding or removing a label,
            archiving a thread (removing the Inbox label) or moving a thread to Trash. The app does not send email, and
            never deletes email permanently.
          </li>
          <li>
            <strong>Google Calendar events</strong> (<code>https://www.googleapis.com/auth/calendar.events</code>),
            optional and requested separately. Used only to show meetings you link to a card, and to create or update a
            calendar event when you ask the app to.
          </li>
        </ul>
        <p>
          Google also gives the app an access token and a refresh token, which let it make the requests above on your
          behalf while you use it.
        </p>

        <h3>Information you enter</h3>
        <p>
          Card titles, summaries, notes, next actions and due dates, links, statuses, label choices and your settings
          (such as your theme).
        </p>

        <h3>Technical information</h3>
        <ul>
          <li>
            A sign-in cookie (secure and HTTP-only) that keeps you signed in, and a cookie that remembers your theme. The
            app uses no advertising or tracking cookies, and no third-party analytics.
          </li>
          <li>
            Standard request logs kept by our hosting provider (such as IP address, browser type and time of request),
            used only to run the service and fix problems.
          </li>
        </ul>

        <h2>2. How the information is used</h2>
        <p>Google user data and other information is used only to provide and improve the features you use, for you:</p>
        <ul>
          <li>to sign you in and keep your account separate from everyone else&rsquo;s;</li>
          <li>to show your email threads as cards on your board, grouped by status and label;</li>
          <li>to apply the label, archive and Trash changes you ask for, in your Gmail;</li>
          <li>to show and create calendar events linked to your cards, if you turn that on;</li>
          <li>to keep the service secure and to fix errors.</li>
        </ul>
        <p>Your Google user data is not used for anything else. In particular:</p>
        <ul>
          <li>It is not sold or rented, and is not used for advertising, retargeting, profiling or market research.</li>
          <li>
            It is not used to develop, improve or train any AI or machine-learning model, general or otherwise. The app
            uses no AI features and sends none of your data to AI services.
          </li>
          <li>
            It is never used to create, edit or generate images, including AI-generated non-consensual intimate imagery
            (NCII) or any other sexual or intimate imagery.
          </li>
          <li>
            No person reads your email or data, except with your explicit permission (for example when you ask for help
            with a problem), when needed for security (for example to investigate abuse), or when the law requires it.
          </li>
        </ul>

        <h3>Google API Services User Data Policy</h3>
        <p>
          {APP_NAME}&rsquo;s use and transfer to any other app of information received from Google APIs will adhere to
          the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" className={A}>
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>

        <h2>3. What is stored, and for how long</h2>
        <p>The app stores the following in its database so your board works between visits:</p>
        <ul>
          <li>Your name, email address and profile picture URL.</li>
          <li>Your Google access and refresh tokens, used only for the requests described above.</li>
          <li>
            For emails on your board: the Gmail thread ID, subject, sender, a short snippet, the date and its label IDs,
            so a card can be shown without reloading Gmail every time.
          </li>
          <li>Everything you enter in the app, listed in section 1.</li>
        </ul>
        <p>
          The full body of your emails and their attachments are <strong>not</strong> stored. They are fetched from
          Gmail when you open a thread, passed straight to your browser and then discarded.
        </p>
        <p>
          Your information is kept while you have an account. If you remove the app&rsquo;s access in your Google
          account, it can no longer reach your Gmail or Calendar, and the stored tokens stop working. When you ask for
          your data to be deleted, everything listed above is permanently deleted within 30 days. Hosting request logs
          are kept by the hosting provider for a short period and then deleted automatically.
        </p>

        <h2>4. Sharing and disclosure</h2>
        <p>
          Your information, including Google user data, is not shared with, sold to or transferred to third parties,
          except:
        </p>
        <ul>
          <li>
            <strong>Service providers that run the app:</strong> Vercel Inc. (hosting) and Prisma Data, Inc. (managed
            Postgres database). They process data only to host and store it for the app, and may not use it for anything
            else.
          </li>
          <li>
            <strong>Legal reasons:</strong> if required by law, or to protect the safety, rights or security of users or
            others.
          </li>
          <li>
            <strong>Business transfer:</strong> if the app is ever transferred to someone else, in which case you would
            be told first and this policy would continue to apply.
          </li>
        </ul>

        <h2>5. Security</h2>
        <p>
          All traffic between your browser, the app, Google and the database is encrypted with HTTPS/TLS. The database
          is encrypted at rest by its provider and reachable only by the app. Each account can see only its own data.
          Access to Google is limited to the permissions listed above.
        </p>

        <h2>6. Your choices and rights</h2>
        <ul>
          <li>
            <strong>Remove access:</strong> you can stop the app&rsquo;s access to your Google account at any time from{" "}
            <a href="https://myaccount.google.com/permissions" className={A}>
              your Google account permissions
            </a>
            .
          </li>
          <li>
            <strong>Delete your data:</strong> email <Mail /> from the address you sign in with, and everything the app
            has stored about you will be deleted within 30 days. Your Gmail and Calendar themselves are not affected.
          </li>
          <li>
            <strong>Access or correct your data:</strong> email <Mail /> to get a copy of what is stored, or to have it
            corrected.
          </li>
          <li>
            If you are in the UK or EU, you also have the right to object to or restrict processing, and to complain to
            your data protection authority (in the UK, the Information Commissioner&rsquo;s Office). The legal basis for
            processing is providing the service you asked for (contract) and your consent to the Google permissions.
          </li>
        </ul>

        <h2>7. Children</h2>
        <p>
          The app is not meant for children under 13 (or under 16 in the EU), and does not knowingly collect their data.
        </p>

        <h2>8. Changes and contact</h2>
        <p>
          If this policy changes, the date at the top changes too. Questions or requests go to <Mail />.
        </p>
      </article>
    </main>
  );
}
