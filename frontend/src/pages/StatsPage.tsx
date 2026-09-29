import { useEffect, useState } from "react";
import { Database, Info, RefreshCw, Zap } from "lucide-react";
import { getStats } from "../api/client";
import type { ApiError } from "../api/client";
import type { StatsResponse } from "../api/types";
import { labelize } from "../lib/format";

function BarList({ title, data, colorByCategory }: { title: string; data: Record<string, number>; colorByCategory?: boolean }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const sum = entries.reduce((acc, [, n]) => acc + n, 0);
  return (
    <section className="panel">
      <h2>{title}</h2>
      {entries.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>No reports yet.</p>
      ) : (
        <ul className="bars">
          {entries.map(([key, count]) => (
            <li key={key} data-cat={colorByCategory ? key : undefined}>
              <div className="bar__row">
                <span>{labelize(key)}</span>
                <span className="bar__count">{count}</span>
              </div>
              <div className="bar__track">
                <div className="bar__fill" style={{ width: `${(count / sum) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function StatsPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [cacheStatus, setCacheStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadStats() {
    setLoading(true);
    setError(null);
    try {
      const result = await getStats();
      setStats(result.data);
      setCacheStatus(result.cacheStatus);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const fetchStats = async () => {
      await loadStats();
    };

    fetchStats();
  }, []);

  const total = stats ? Object.values(stats.by_category).reduce((a, b) => a + b, 0) : 0;
  const high = stats?.by_priority["high"] ?? 0;
  const topCategory = stats
    ? Object.entries(stats.by_category).sort((a, b) => b[1] - a[1])[0]?.[0]
    : undefined;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Statistics</h1>
          <p className="lede">Live counts across all reports.</p>
        </div>
        <button className="btn btn--ghost" onClick={loadStats} disabled={loading}>
          <RefreshCw size={16} className={loading ? "spin" : undefined} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="alert" role="alert">
          <Info size={18} aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      {cacheStatus && (
        <div className="cache" data-state={cacheStatus.toLowerCase()}>
          {cacheStatus === "HIT" ? <Zap size={16} aria-hidden="true" /> : <Database size={16} aria-hidden="true" />}
          <strong>Cache {cacheStatus}</strong>
          <span>
            {cacheStatus === "HIT"
              ? "Served from Redis with no database query."
              : "Read from Postgres, then cached for 30 seconds."}
          </span>
        </div>
      )}

      {!stats && loading && (
        <div className="panel">
          <span className="skeleton skeleton--short" />
          <span className="skeleton" />
          <span className="skeleton skeleton--mid" />
        </div>
      )}

      {stats && (
        <>
          <dl className="figures">
            <div className="figure">
              <dt>Total reports</dt>
              <dd>{total}</dd>
            </div>
            <div className="figure">
              <dt>High priority</dt>
              <dd>{high}</dd>
            </div>
            <div className="figure">
              <dt>Most reported</dt>
              <dd>{topCategory ? labelize(topCategory) : "—"}</dd>
            </div>
          </dl>

          <div className="bars-grid">
            <BarList title="By category" data={stats.by_category} colorByCategory />
            <BarList title="By priority" data={stats.by_priority} />
          </div>
        </>
      )}
    </>
  );
}