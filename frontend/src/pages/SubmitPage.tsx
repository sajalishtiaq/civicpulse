import { useState } from "react";
import type { FormEvent } from "react";
import { Info, RefreshCw, Send } from "lucide-react";
import { createComplaint } from "../api/client";
import type { ApiError } from "../api/client";
import type { Complaint } from "../api/types";
import { CategoryChip, PrioritySignal, ProviderChip } from "../components/Badges";

export function SubmitPage() {
  const [text, setText] = useState("");
  const [location, setLocation] = useState("");
  const [contact, setContact] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Complaint | null>(null);

  const textError =
    text.length > 0 && text.length < 10 ? "Describe the problem in at least 10 characters." : null;
  const locationError =
    location.length > 0 && location.length < 3 ? "Enter a location of at least 3 characters." : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (text.length < 10 || location.length < 3) {
      setError("Add a description (10+ characters) and a location (3+ characters).");
      return;
    }

    setLoading(true);
    try {
      const complaint = await createComplaint({
        text,
        location,
        reporter_contact: contact || undefined,
      });
      setResult(complaint);
      setText("");
      setLocation("");
      setContact("");
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.status === 429) {
        setError(`You've sent too many reports. Try again in ${apiErr.retryAfter ?? "a few"} seconds.`);
      } else {
        setError(apiErr.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Report a problem</h1>
          <p className="lede">
            Tell us what's wrong and where. Your report is sorted by category and priority automatically.
          </p>
        </div>
      </div>

      <div className="split">
        <form className="panel form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="text">What's the problem?</label>
            <textarea
              id="text"
              rows={6}
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="For example: burst water main flooding Street 12, water entering ground floors"
              aria-invalid={textError ? true : undefined}
            />
            <div className="field__foot">
              <span className="field__error">{textError}</span>
              <span className="field__count">{text.length}/2000</span>
            </div>
          </div>

          <div className="field">
            <label htmlFor="location">Where is it?</label>
            <input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Street, area or landmark"
              aria-invalid={locationError ? true : undefined}
            />
            <div className="field__foot">
              <span className="field__error">{locationError}</span>
            </div>
          </div>

          <div className="field">
            <label htmlFor="contact">
              How can we reach you? <span className="optional">(optional)</span>
            </label>
            <input
              id="contact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Phone or email"
            />
          </div>

          <button className="btn btn--primary" type="submit" disabled={loading}>
            {loading ? (
              <>
                <RefreshCw size={16} className="spin" aria-hidden="true" /> Sending report…
              </>
            ) : (
              <>
                <Send size={16} aria-hidden="true" /> Send report
              </>
            )}
          </button>

          {error && (
            <div className="alert" role="alert">
              <Info size={18} aria-hidden="true" />
              <p>{error}</p>
            </div>
          )}
        </form>

        <div className="side" aria-live="polite">
          {loading && (
            <section className="panel" aria-busy="true">
              <h2>Reviewing your report</h2>
              <p className="muted" style={{ margin: "8px 0 16px" }}>
                Sorting it by category and priority. This can take a few seconds.
              </p>
              <span className="skeleton skeleton--short" />
              <span className="skeleton" />
              <span className="skeleton skeleton--mid" />
            </section>
          )}

          {!loading && result && (
            <section className="panel ticket" data-cat={result.category}>
              <h2>Report received</h2>
              <div className="ticket__chips">
                <CategoryChip category={result.category} />
                <PrioritySignal priority={result.priority} />
              </div>
              {result.ai_summary && <p className="ticket__summary">{result.ai_summary}</p>}
              <dl className="facts">
                <div>
                  <dt>Sorted by</dt>
                  <dd><ProviderChip provider={result.triaged_by} /></dd>
                </div>
                <div>
                  <dt>Time to sort</dt>
                  <dd>{result.triage_latency_ms ?? 0} ms</dd>
                </div>
                <div>
                  <dt>Reference</dt>
                  <dd>{result.id.slice(0, 8)}</dd>
                </div>
              </dl>
            </section>
          )}

          {!loading && !result && (
            <section className="panel">
              <h2>What happens next</h2>
              <ol className="next">
                <li>We read your report and pick a category and priority.</li>
                <li>It appears on the operations dashboard for the team.</li>
                <li>An operator moves it from open to resolved.</li>
              </ol>
            </section>
          )}
        </div>
      </div>
    </>
  );
}