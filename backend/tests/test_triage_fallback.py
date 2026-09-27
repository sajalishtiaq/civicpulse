from app.providers.triage.factory import triage_with_fallback
import app.config as config_module


def test_fallback_when_provider_always_fails(monkeypatch):
    # Force the factory to use the always-failing provider for this test only.
    monkeypatch.setattr(config_module.settings, "triage_provider", "always_fails")

    result, triaged_by, latency_ms = triage_with_fallback(
        text="burst water main flooding street 12",
        location="Street 12",
    )

    assert triaged_by == "rules:fallback"
    assert result.category is not None
    assert result.priority is not None


def test_fallback_when_provider_returns_malformed_output(monkeypatch):
    monkeypatch.setattr(config_module.settings, "triage_provider", "always_malformed")

    result, triaged_by, latency_ms = triage_with_fallback(
        text="burst water main flooding street 12",
        location="Street 12",
    )

    assert triaged_by == "rules:fallback"