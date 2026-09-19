import { PageHeader } from './PageHeader';
import { Footer } from './Footer';
import { GITHUB_URL } from './site-links';

const inlineLink =
  'font-medium text-ink underline decoration-hairline underline-offset-2 transition-colors duration-150 outline-offset-2 outline-accent hover:decoration-ink focus-visible:outline-2';

/**
 * The /privacy page: one short combined page (launch-chrome spec) — what is
 * stored, what is never done, crypto payments keep card data out, the
 * self-host escape hatch, and a one-line no-warranty caveat standing in for
 * the separate Terms page that doesn't exist.
 */
export function PrivacyPage() {
  return (
    <div className="flex min-h-full flex-col bg-canvas text-ink">
      <PageHeader />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>
        <p className="mt-2 max-w-prose text-sm text-ink-soft">
          PerfectMarkD holds as little as possible. Here is exactly what
          happens to your data.
        </p>

        <section aria-label="What is stored" className="mt-8">
          <h2 className="text-base font-semibold tracking-tight">
            What is stored
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-soft">
            <li>
              Your account email, if you create one — used to sign in and
              manage your plan.
            </li>
            <li>
              Nothing else, unless you pay: free users' Documents live entirely
              in their browser and are never uploaded. Client Exports (the
              browser's own print pipeline) never touch the server.
            </li>
            <li>
              Server Export PDFs on Premium: kept 30 days in Export History
              (encrypted at rest, auto-purged) so you can re-download them.
              Every other Server Export payload is processed in memory and
              deleted immediately after rendering — never written to disk,
              never logged.
            </li>
            <li>
              Your payment reference: the transaction ID and amount you submit
              with an Order, kept so your Manual Payment can be verified.
            </li>
          </ul>
        </section>

        <section aria-label="What is never done" className="mt-6">
          <h2 className="text-base font-semibold tracking-tight">
            What is never done
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-soft">
            <li>
              No third-party analytics, no ad tracking, no fingerprinting. The
              fonts are self-hosted, so your browser talks to no one else.
            </li>
            <li>
              Your PDF content is never read, used, or shared. Server Export
              renders it and throws it away.
            </li>
            <li>No cookies beyond your login session.</li>
          </ul>
        </section>

        <section aria-label="Payments" className="mt-6">
          <h2 className="text-base font-semibold tracking-tight">
            No card data
          </h2>
          <p className="mt-2 max-w-prose text-sm text-ink-soft">
            Payments are manual crypto (USDT or Litecoin): you send the funds
            yourself and submit the transaction for verification. No card data
            is held — there is no payment gateway to hold it.
          </p>
        </section>

        <section aria-label="Self-hosting" className="mt-6">
          <h2 className="text-base font-semibold tracking-tight">
            The self-host escape hatch
          </h2>
          <p className="mt-2 max-w-prose text-sm text-ink-soft">
            The whole app is AGPL-3.0:{' '}
            <a href={GITHUB_URL} className={inlineLink}>
              run your own instance
            </a>{' '}
            and your data never leaves it. Free users' Documents already live
            entirely in their browser, so you are not locked in either way.
          </p>
        </section>

        <p className="mt-10 border-t border-hairline pt-3 text-[11px] leading-relaxed text-ink-faint">
          PerfectMarkD is provided as-is, with no warranty. There is no
          separate Terms page.
        </p>
      </main>

      <Footer />
    </div>
  );
}
