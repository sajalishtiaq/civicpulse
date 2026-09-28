import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import { Activity, Gauge, LayoutDashboard, Send } from "lucide-react";
import { SubmitPage } from "./pages/SubmitPage";
import { DashboardPage } from "./pages/DashboardPage";
import { StatsPage } from "./pages/StatsPage";
import { ErrorBoundary } from "./components/ErrorBoundary";

function App() {
  return (
    <BrowserRouter>
      <header className="site-header">
        <div className="site-header__inner">
          <Link to="/" className="brand">
            <span className="brand__mark">
              <Activity size={18} aria-hidden="true" />
            </span>
            CivicPulse
          </Link>
          <nav className="nav" aria-label="Main">
            <NavLink to="/" end>
              <Send size={16} aria-hidden="true" />
              <span>Report</span>
            </NavLink>
            <NavLink to="/dashboard">
              <LayoutDashboard size={16} aria-hidden="true" />
              <span>Dashboard</span>
            </NavLink>
            <NavLink to="/stats">
              <Gauge size={16} aria-hidden="true" />
              <span>Stats</span>
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="page">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<SubmitPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/stats" element={<StatsPage />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </BrowserRouter>
  );
}

export default App;