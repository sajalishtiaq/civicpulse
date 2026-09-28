import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { ChevronLeft, ChevronRight, Clock, Inbox, Info, MapPin, Sparkles, X } from "lucide-react";
import { listComplaints, updateComplaintStatus } from "../api/client";
import type { ApiError } from "../api/client";
import type { Category, Complaint, Priority, Status } from "../api/types";
import { CategoryChip, PrioritySignal, ProviderChip, StatusBadge } from "../components/Badges";
import { labelize, timeAgo } from "../lib/format";

const PAGE_SIZE = 10;
const CATEGORIES: Category[] = ["water", "electricity", "sanitation", "roads", "streetlights", "other"];
const PRIORITIES: Priority[] = ["high", "normal", "low"];
const STATUSES: Status[] = ["open", "in_progress", "resolved", "rejected"];

export function DashboardPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  async function loadComplaints() {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await listComplaints({
        category: categoryFilter || undefined,
        priority: priorityFilter || undefined,
        status: statusFilter || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      setComplaints(response.items);
      setTotal(response.total);
    } catch (err) {
      setLoadError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadComplaints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, categoryFilter, priorityFilter, statusFilter]);

  async function handleStatusChange(id: string, newStatus: Status) {
    setTransitionError(null);
    try {
      await updateComplaintStatus(id, newStatus);
      loadComplaints();
    } catch (err) {
      // The server's 409 message is shown verbatim.
      setTransitionError((err as ApiError).message);
    }
  }

  function onFilter(setter: (value: string) => void) {
    return (e: ChangeEvent<HTMLSelectElement>) => {
      setter(e.target.value);
      setPage(1);
    };
  }

  function clearFilters() {
    setCategoryFilter("");
    setPriorityFilter("");
    setStatusFilter("");
    setPage(1);
  }

  const filtersActive = Boolean(categoryFilter || priorityFilter || statusFilter);
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="lede">Review incoming reports and move them through the workflow.</p>
        </div>
      </div>

      <div className="toolbar">
        <label className="sr-only" htmlFor="f-category">Category</label>
        <select id="f-category" value={categoryFilter} onChange={onFilter(setCategoryFilter)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{labelize(c)}</option>)}
        </select>

        <label className="sr-only" htmlFor="f-priority">Priority</label>
        <select id="f-priority" value={priorityFilter} onChange={onFilter(setPriorityFilter)}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{labelize(p)}</option>)}
        </select>

        <label className="sr-only" htmlFor="f-status">Status</label>
        <select id="f-status" value={statusFilter} onChange={onFilter(setStatusFilter)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
        </select>

        {filtersActive && (
          <button className="btn btn--ghost btn--small" onClick={clearFilters}>
            <X size={14} aria-hidden="true" /> Clear filters
          </button>
        )}
      </div>

      {transitionError && (
        <div className="alert" role="alert">
          <Info size={18} aria-hidden="true" />
          <p>{transitionError}</p>
          <button onClick={() => setTransitionError(null)} aria-label="Dismiss message">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      {loadError && (
        <div className="alert" role="alert">
          <Info size={18} aria-hidden="true" />
          <p>{loadError}</p>
        </div>
      )}

      <div className="ledger" aria-busy={loading}>
        {loading && complaints.length === 0 &&
          [0, 1, 2].map((i) => (
            <div className="row" key={i}>
              <div className="row__tab" aria-hidden="true" />
              <div className="row__body">
                <span className="skeleton skeleton--short" />
                <span className="skeleton" />
                <span className="skeleton skeleton--mid" />
              </div>
            </div>
          ))}

        {!loading && complaints.length === 0 && !loadError && (
          <div className="empty">
            <Inbox size={28} aria-hidden="true" />
            <h2>No reports match</h2>
            <p>{filtersActive ? "Clear a filter to see more reports." : "New reports will appear here as they arrive."}</p>
            {filtersActive && (
              <button className="btn btn--ghost btn--small" onClick={clearFilters}>Clear filters</button>
            )}
          </div>
        )}

        {complaints.map((c) => (
          <article className="row" data-cat={c.category} key={c.id}>
            <div className="row__tab" aria-hidden="true" />
            <div className="row__body">
              <div className="row__head">
                <span className="row__where">
                  <MapPin size={14} aria-hidden="true" />
                  {c.location}
                </span>
                <span className="row__when">
                  <Clock size={13} aria-hidden="true" />
                  {timeAgo(c.created_at)}
                </span>
                <PrioritySignal priority={c.priority} />
              </div>

              <p className="row__text">{c.text}</p>
              {c.ai_summary && (
                <p className="row__summary">
                  <Sparkles size={14} aria-hidden="true" />
                  {c.ai_summary}
                </p>
              )}

              <div className="row__foot">
                <div className="row__chips">
                  <CategoryChip category={c.category} />
                  <StatusBadge status={c.status} />
                  <ProviderChip provider={c.triaged_by} />
                </div>
                <div className="row__control">
                  <label htmlFor={`status-${c.id}`}>Set status</label>
                  <select
                    id={`status-${c.id}`}
                    value={c.status}
                    onChange={(e) => handleStatusChange(c.id, e.target.value as Status)}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="pager">
        <span>{total === 0 ? "No reports" : `Showing ${start}–${end} of ${total} reports`}</span>
        <div className="pager__controls">
          <button className="btn btn--ghost btn--small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft size={16} aria-hidden="true" /> Previous
          </button>
          <span>Page {page}</span>
          <button className="btn btn--ghost btn--small" disabled={page * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>
            Next <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );
}