"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Button, Toggle, Input } from "@/shared/components";

/**
 * Security & Routing Settings Page
 *
 * Sections (admin only):
 *   - Access Control  (require login, proxy API key notice)
 *   - Routing Strategy (round-robin, sticky limit)
 *   - Network  (outbound proxy)
 *   - Observability
 *   - Circuit Breaker
 *   - IP Filter Rules
 *   - Wildcard Model Routes
 *   - Model Deprecation Overrides
 *   - Request Cache
 *   - Background Task Routing
 *   - Request Idempotency
 *   - Quota Preflight
 *   - MCP Server
 */

// ── Simple shared sub-components ──────────────────────────────────────────────

function Section({ title, icon, iconColor = "text-primary", iconBg = "bg-primary/10", children }) {
  return (
    <Card>
      {title && (
        <div className="flex items-center gap-3 mb-4">
          {icon && (
            <div className={`p-2 rounded-lg ${iconBg} ${iconColor}`}>
              <span className="material-symbols-outlined text-[20px]">{icon}</span>
            </div>
          )}
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
      )}
      {children}
    </Card>
  );
}

function SettingRow({ label, description, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        {description && <p className="text-sm text-text-muted">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SectionToggle({ label, description, checked, onChange, disabled }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <div className="font-medium text-sm">{label}</div>
        {description && <div className="text-xs text-text-muted mt-0.5">{description}</div>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
          checked ? "bg-primary" : "bg-muted"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function NumberInput({ label, value, onChange, min, placeholder }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <label className="text-sm font-medium w-60 shrink-0">{label}</label>
      <input
        type="number"
        min={min}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="border border-border rounded px-3 py-1.5 text-sm w-36 bg-background"
      />
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <label className="text-sm font-medium w-60 shrink-0">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="border border-border rounded px-3 py-1.5 text-sm w-72 bg-background"
      />
    </div>
  );
}

function RulesTable({ columns, rows, onDelete }) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-muted py-2">No entries.</p>;
  }
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b border-border">
          {columns.map((c) => (
            <th key={c} className="text-left py-2 px-3 font-medium text-text-muted">{c}</th>
          ))}
          <th className="py-2 px-3" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b border-border last:border-0 hover:bg-surface/50">
            {columns.map((c) => (
              <td key={c} className="py-2 px-3 font-mono text-xs">{row[c.toLowerCase().replace(/ /g, "")] ?? row[c] ?? ""}</td>
            ))}
            <td className="py-2 px-3 text-right">
              <button onClick={() => onDelete(row.id)} className="text-red-500 hover:text-red-600 text-xs">
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SaveButton({ saving, onClick }) {
  return (
    <Button variant="primary" onClick={onClick} loading={saving} className="mt-2">
      Save Settings
    </Button>
  );
}

// ── Main page component ────────────────────────────────────────────────────────

export default function SecurityPage() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // IP Filter
  const [ipRules, setIpRules] = useState([]);
  const [newIpMode, setNewIpMode] = useState("block");
  const [newIpCidr, setNewIpCidr] = useState("");
  const [addingIp, setAddingIp] = useState(false);

  // Wildcard Routes
  const [wildcardRoutes, setWildcardRoutes] = useState([]);
  const [newWcPattern, setNewWcPattern] = useState("");
  const [newWcTarget, setNewWcTarget] = useState("");
  const [newWcPriority, setNewWcPriority] = useState(100);
  const [addingWc, setAddingWc] = useState(false);

  // Model Deprecation
  const [deprecationOverrides, setDeprecationOverrides] = useState([]);
  const [newDepFrom, setNewDepFrom] = useState("");
  const [newDepTo, setNewDepTo] = useState("");
  const [addingDep, setAddingDep] = useState(false);

  // Outbound Proxy
  const [proxyForm, setProxyForm] = useState({ outboundProxyUrl: "", outboundNoProxy: "" });
  const [proxyStatus, setProxyStatus] = useState({ type: "", message: "" });
  const [proxyLoading, setProxyLoading] = useState(false);
  const [proxyTestLoading, setProxyTestLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    const [sRes, ipRes, wcRes, depRes] = await Promise.all([
      fetch("/api/settings").then(r => r.json()),
      fetch("/api/ip-filter-rules").then(r => r.ok ? r.json() : { rules: [] }),
      fetch("/api/wildcard-routes").then(r => r.ok ? r.json() : { routes: [] }),
      fetch("/api/model-deprecation").then(r => r.ok ? r.json() : { overrides: [] }),
    ]);
    setSettings(sRes);
    setProxyForm({
      outboundProxyUrl: sRes?.outboundProxyUrl || "",
      outboundNoProxy: sRes?.outboundNoProxy || "",
    });
    setIpRules(ipRes.rules || []);
    setWildcardRoutes(wcRes.routes || []);
    setDeprecationOverrides(depRes.overrides || []);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function saveSettings(updates) {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSettings(prev => ({ ...prev, ...data }));
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function updateSetting(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  // ── Outbound Proxy handlers ────────────────────────────────────────────────

  const updateOutboundProxyEnabled = async (enabled) => {
    setProxyLoading(true);
    setProxyStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outboundProxyEnabled: enabled }),
      });
      const data = await res.json();
      if (res.ok) {
        setSettings(prev => ({ ...prev, ...data }));
        setProxyStatus({ type: "success", message: enabled ? "Proxy enabled" : "Proxy disabled" });
      } else {
        setProxyStatus({ type: "error", message: data.error || "Failed to update proxy settings" });
      }
    } catch {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyLoading(false);
    }
  };

  const updateOutboundProxy = async (e) => {
    e.preventDefault();
    if (settings?.outboundProxyEnabled !== true) return;
    setProxyLoading(true);
    setProxyStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outboundProxyUrl: proxyForm.outboundProxyUrl,
          outboundNoProxy: proxyForm.outboundNoProxy,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSettings(prev => ({ ...prev, ...data }));
        setProxyStatus({ type: "success", message: "Proxy settings applied" });
      } else {
        setProxyStatus({ type: "error", message: data.error || "Failed to update proxy settings" });
      }
    } catch {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyLoading(false);
    }
  };

  const testOutboundProxy = async () => {
    const proxyUrl = (proxyForm.outboundProxyUrl || "").trim();
    if (!proxyUrl) {
      setProxyStatus({ type: "error", message: "Please enter a Proxy URL to test" });
      return;
    }
    setProxyTestLoading(true);
    setProxyStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings/proxy-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxyUrl }),
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        setProxyStatus({ type: "success", message: `Proxy test OK (${data.status}) in ${data.elapsedMs}ms` });
      } else {
        setProxyStatus({ type: "error", message: data?.error || "Proxy test failed" });
      }
    } catch {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyTestLoading(false);
    }
  };

  // ── IP Filter actions ──────────────────────────────────────────────────────

  async function addIpRule() {
    if (!newIpCidr.trim()) return;
    setAddingIp(true);
    try {
      const res = await fetch("/api/ip-filter-rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: newIpMode, cidr: newIpCidr.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setNewIpCidr("");
      await fetchAll();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setAddingIp(false);
    }
  }

  async function deleteIpRule(id) {
    await fetch(`/api/ip-filter-rules/${id}`, { method: "DELETE" });
    setIpRules(prev => prev.filter(r => r.id !== id));
  }

  // ── Wildcard Route actions ─────────────────────────────────────────────────

  async function addWildcardRoute() {
    if (!newWcPattern.trim() || !newWcTarget.trim()) return;
    setAddingWc(true);
    try {
      const res = await fetch("/api/wildcard-routes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pattern: newWcPattern.trim(), target: newWcTarget.trim(), priority: newWcPriority }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setNewWcPattern(""); setNewWcTarget(""); setNewWcPriority(100);
      await fetchAll();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setAddingWc(false);
    }
  }

  async function deleteWildcardRoute(id) {
    await fetch(`/api/wildcard-routes/${id}`, { method: "DELETE" });
    setWildcardRoutes(prev => prev.filter(r => r.id !== id));
  }

  // ── Model Deprecation actions ──────────────────────────────────────────────

  async function addDeprecationOverride() {
    if (!newDepFrom.trim() || !newDepTo.trim()) return;
    setAddingDep(true);
    try {
      const res = await fetch("/api/model-deprecation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromModel: newDepFrom.trim(), toModel: newDepTo.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setNewDepFrom(""); setNewDepTo("");
      await fetchAll();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setAddingDep(false);
    }
  }

  async function deleteDeprecationOverride(id) {
    await fetch(`/api/model-deprecation/${id}`, { method: "DELETE" });
    setDeprecationOverrides(prev => prev.filter(r => r.id !== id));
  }

  if (!settings) {
    return <div className="p-8 text-sm text-text-muted">Loading…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-col gap-6">

        {saveError && (
          <div className="p-3 bg-red-500/10 text-red-500 rounded-lg text-sm">{saveError}</div>
        )}

        {/* ── Access Control ── */}
        <Section title="Access Control" icon="admin_panel_settings" iconBg="bg-primary/10" iconColor="text-primary">
          <div className="flex flex-col gap-3">
            <SettingRow
              label="Require Login"
              description="When ON, dashboard requires password. When OFF, access without login."
            >
              <Toggle
                checked={settings.requireLogin === true}
                onChange={() => saveSettings({ requireLogin: !settings.requireLogin }).then(() =>
                  updateSetting("requireLogin", !settings.requireLogin)
                )}
                disabled={saving}
              />
            </SettingRow>
            <div className="rounded-lg border border-border bg-surface/50 px-4 py-3">
              <p className="font-medium text-text-main">Proxy API key</p>
              <p className="text-sm text-text-muted mt-0.5">
                Always required. All requests to the proxy must include a valid API key in the{" "}
                <code className="text-xs bg-black/5 dark:bg-white/5 px-1 rounded">Authorization: Bearer &lt;key&gt;</code>{" "}
                header. This cannot be disabled.
              </p>
            </div>
          </div>
        </Section>

        {/* ── Routing Strategy ── */}
        <Section title="Routing Strategy" icon="route" iconBg="bg-blue-500/10" iconColor="text-blue-500">
          <div className="flex flex-col gap-4">
            <SettingRow
              label="Round Robin"
              description="Cycle through accounts to distribute load"
            >
              <Toggle
                checked={settings.fallbackStrategy === "round-robin"}
                onChange={() => saveSettings({ fallbackStrategy: settings.fallbackStrategy === "round-robin" ? "fill-first" : "round-robin" })}
                disabled={saving}
              />
            </SettingRow>
            {settings.fallbackStrategy === "round-robin" && (
              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <div>
                  <p className="font-medium">Sticky Limit</p>
                  <p className="text-sm text-text-muted">Calls per account before switching</p>
                </div>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={settings.stickyRoundRobinLimit || 3}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v >= 1) saveSettings({ stickyRoundRobinLimit: v });
                  }}
                  disabled={saving}
                  className="w-20 text-center"
                />
              </div>
            )}
            <p className="text-xs text-text-muted italic pt-2 border-t border-border/50">
              {settings.fallbackStrategy === "round-robin"
                ? `Currently distributing requests across all available accounts with ${settings.stickyRoundRobinLimit || 3} calls per account.`
                : "Currently using accounts in priority order (Fill First)."}
            </p>
          </div>
        </Section>

        {/* ── Network ── */}
        <Section title="Network" icon="wifi" iconBg="bg-purple-500/10" iconColor="text-purple-500">
          <div className="flex flex-col gap-4">
            <SettingRow
              label="Outbound Proxy"
              description="Enable proxy for OAuth + provider outbound requests."
            >
              <Toggle
                checked={settings.outboundProxyEnabled === true}
                onChange={() => updateOutboundProxyEnabled(!(settings.outboundProxyEnabled === true))}
                disabled={proxyLoading}
              />
            </SettingRow>

            {settings.outboundProxyEnabled === true && (
              <form onSubmit={updateOutboundProxy} className="flex flex-col gap-4 pt-2 border-t border-border/50">
                <div className="flex flex-col gap-2">
                  <label className="font-medium text-sm">Proxy URL</label>
                  <Input
                    placeholder="http://127.0.0.1:7897"
                    value={proxyForm.outboundProxyUrl}
                    onChange={(e) => setProxyForm(prev => ({ ...prev, outboundProxyUrl: e.target.value }))}
                    disabled={proxyLoading}
                  />
                  <p className="text-sm text-text-muted">Leave empty to inherit existing env proxy (if any).</p>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="font-medium text-sm">No Proxy</label>
                  <Input
                    placeholder="localhost,127.0.0.1"
                    value={proxyForm.outboundNoProxy}
                    onChange={(e) => setProxyForm(prev => ({ ...prev, outboundNoProxy: e.target.value }))}
                    disabled={proxyLoading}
                  />
                  <p className="text-sm text-text-muted">Comma-separated hostnames/domains to bypass the proxy.</p>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                  <Button type="button" variant="secondary" loading={proxyTestLoading} disabled={proxyLoading} onClick={testOutboundProxy}>
                    Test proxy URL
                  </Button>
                  <Button type="submit" variant="primary" loading={proxyLoading}>
                    Apply
                  </Button>
                </div>
              </form>
            )}

            {proxyStatus.message && (
              <p className={`text-sm ${proxyStatus.type === "error" ? "text-red-500" : "text-green-500"}`}>
                {proxyStatus.message}
              </p>
            )}
          </div>
        </Section>

        {/* ── Observability ── */}
        <Section title="Observability" icon="monitoring" iconBg="bg-orange-500/10" iconColor="text-orange-500">
          <SettingRow
            label="Enable Observability"
            description="Record request details for inspection in the logs view"
          >
            <Toggle
              checked={settings.observabilityEnabled !== false}
              onChange={(v) => saveSettings({ observabilityEnabled: v })}
              disabled={saving}
            />
          </SettingRow>
        </Section>

        {/* ── Circuit Breaker ── */}
        <Section title="Circuit Breaker" icon="electric_bolt" iconBg="bg-yellow-500/10" iconColor="text-yellow-500">
          <SectionToggle
            label="Enable Circuit Breaker"
            description="Automatically skip failing provider connections after repeated errors."
            checked={!!settings.circuitBreakerEnabled}
            onChange={(v) => updateSetting("circuitBreakerEnabled", v)}
          />
          <NumberInput
            label="Failure Threshold"
            value={settings.circuitBreakerFailureThreshold}
            onChange={(v) => updateSetting("circuitBreakerFailureThreshold", v)}
            min={1}
            placeholder="5"
          />
          <NumberInput
            label="Recovery Window (ms)"
            value={settings.circuitBreakerRecoveryWindowMs}
            onChange={(v) => updateSetting("circuitBreakerRecoveryWindowMs", v)}
            min={1000}
            placeholder="60000"
          />
          <SaveButton
            saving={saving}
            onClick={() => saveSettings({
              circuitBreakerEnabled: settings.circuitBreakerEnabled,
              circuitBreakerFailureThreshold: settings.circuitBreakerFailureThreshold,
              circuitBreakerRecoveryWindowMs: settings.circuitBreakerRecoveryWindowMs,
            })}
          />
        </Section>

        {/* ── IP Filter ── */}
        <Section title="IP Filter Rules" icon="filter_alt" iconBg="bg-red-500/10" iconColor="text-red-500">
          <SectionToggle
            label="Enable IP Filtering"
            description="Block or allowlist IPs/CIDRs. Block rules take priority over allow rules."
            checked={settings.ipFilterEnabled !== false}
            onChange={(v) => { updateSetting("ipFilterEnabled", v); saveSettings({ ipFilterEnabled: v }); }}
          />
          <div className="mt-4">
            <RulesTable
              columns={["Mode", "CIDR"]}
              rows={ipRules.map(r => ({ ...r, Mode: r.mode, CIDR: r.cidr }))}
              onDelete={deleteIpRule}
            />
            <div className="flex items-center gap-2 mt-3">
              <select
                value={newIpMode}
                onChange={(e) => setNewIpMode(e.target.value)}
                className="border border-border rounded px-2 py-1.5 text-sm bg-background"
              >
                <option value="block">block</option>
                <option value="allow">allow</option>
              </select>
              <input
                type="text"
                placeholder="192.168.0.0/16 or ::1/128"
                value={newIpCidr}
                onChange={(e) => setNewIpCidr(e.target.value)}
                className="border border-border rounded px-3 py-1.5 text-sm w-56 bg-background"
                onKeyDown={(e) => e.key === "Enter" && addIpRule()}
              />
              <button
                onClick={addIpRule}
                disabled={addingIp || !newIpCidr.trim()}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </Section>

        {/* ── Wildcard Routes ── */}
        <Section title="Wildcard Model Routes" icon="alt_route" iconBg="bg-teal-500/10" iconColor="text-teal-500">
          <p className="text-sm text-text-muted mb-3">
            Map glob patterns to concrete model targets. Evaluated after model deprecation rewrites.
          </p>
          <RulesTable
            columns={["Pattern", "Target", "Priority"]}
            rows={wildcardRoutes.map(r => ({ ...r, Pattern: r.pattern, Target: r.target, Priority: r.priority }))}
            onDelete={deleteWildcardRoute}
          />
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <input
              type="text"
              placeholder="Pattern (e.g. gpt-4*)"
              value={newWcPattern}
              onChange={(e) => setNewWcPattern(e.target.value)}
              className="border border-border rounded px-3 py-1.5 text-sm w-40 bg-background"
            />
            <input
              type="text"
              placeholder="Target (e.g. openai/gpt-4o)"
              value={newWcTarget}
              onChange={(e) => setNewWcTarget(e.target.value)}
              className="border border-border rounded px-3 py-1.5 text-sm w-48 bg-background"
            />
            <input
              type="number"
              placeholder="Priority"
              value={newWcPriority}
              onChange={(e) => setNewWcPriority(Number(e.target.value))}
              className="border border-border rounded px-3 py-1.5 text-sm w-24 bg-background"
            />
            <button
              onClick={addWildcardRoute}
              disabled={addingWc || !newWcPattern.trim() || !newWcTarget.trim()}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </Section>

        {/* ── Model Deprecation ── */}
        <Section title="Model Deprecation Overrides" icon="swap_horiz" iconBg="bg-indigo-500/10" iconColor="text-indigo-500">
          <p className="text-sm text-text-muted mb-3">
            Override the built-in model deprecation map with your own renames.
            User overrides take precedence over built-in renames.
          </p>
          <RulesTable
            columns={["From Model", "To Model"]}
            rows={deprecationOverrides.map(r => ({ ...r, "From Model": r.fromModel, "To Model": r.toModel }))}
            onDelete={deleteDeprecationOverride}
          />
          <div className="flex items-center gap-2 mt-3">
            <input
              type="text"
              placeholder="From model (e.g. gpt-4)"
              value={newDepFrom}
              onChange={(e) => setNewDepFrom(e.target.value)}
              className="border border-border rounded px-3 py-1.5 text-sm w-48 bg-background"
            />
            <input
              type="text"
              placeholder="To model (e.g. gpt-4o)"
              value={newDepTo}
              onChange={(e) => setNewDepTo(e.target.value)}
              className="border border-border rounded px-3 py-1.5 text-sm w-48 bg-background"
            />
            <button
              onClick={addDeprecationOverride}
              disabled={addingDep || !newDepFrom.trim() || !newDepTo.trim()}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </Section>

        {/* ── Request Cache ── */}
        <Section title="Request Cache" icon="cached" iconBg="bg-cyan-500/10" iconColor="text-cyan-500">
          <SectionToggle
            label="Signature Cache"
            description="Cache identical non-streaming requests (keyed on full body hash)."
            checked={!!settings.signatureCacheEnabled}
            onChange={(v) => updateSetting("signatureCacheEnabled", v)}
          />
          <NumberInput
            label="Signature Cache TTL (ms)"
            value={settings.signatureCacheTtlMs}
            onChange={(v) => updateSetting("signatureCacheTtlMs", v)}
            min={1000}
            placeholder="60000"
          />
          <SectionToggle
            label="Semantic Cache"
            description="Cache requests with identical messages+system at temperature=0."
            checked={!!settings.semanticCacheEnabled}
            onChange={(v) => updateSetting("semanticCacheEnabled", v)}
          />
          <NumberInput
            label="Semantic Cache TTL (ms)"
            value={settings.semanticCacheTtlMs}
            onChange={(v) => updateSetting("semanticCacheTtlMs", v)}
            min={1000}
            placeholder="300000"
          />
          <div className="flex items-center gap-3 mt-2">
            <SaveButton
              saving={saving}
              onClick={() => saveSettings({
                signatureCacheEnabled: settings.signatureCacheEnabled,
                signatureCacheTtlMs: settings.signatureCacheTtlMs,
                semanticCacheEnabled: settings.semanticCacheEnabled,
                semanticCacheTtlMs: settings.semanticCacheTtlMs,
              })}
            />
            <Button
              variant="outline"
              className="mt-2 text-red-500 border-red-200 hover:bg-red-50 hover:border-red-300"
              onClick={async () => {
                if (!confirm("Flush all request caches?")) return;
                await fetch("/api/admin/cache/flush", { method: "POST" });
                alert("Cache flushed.");
              }}
            >
              Flush Cache Now
            </Button>
          </div>
        </Section>

        {/* ── Background Task Routing ── */}
        <Section title="Background Task Routing" icon="background_replace" iconBg="bg-stone-500/10" iconColor="text-stone-500">
          <SectionToggle
            label="Enable Background Task Routing"
            description="Automatically route CI/bot/batch requests to a dedicated model."
            checked={!!settings.backgroundTaskRoutingEnabled}
            onChange={(v) => updateSetting("backgroundTaskRoutingEnabled", v)}
          />
          <TextInput
            label="Background Task Model"
            value={settings.backgroundTaskModel}
            onChange={(v) => updateSetting("backgroundTaskModel", v)}
            placeholder="e.g. openai/gpt-4o-mini"
          />
          <SaveButton
            saving={saving}
            onClick={() => saveSettings({
              backgroundTaskRoutingEnabled: settings.backgroundTaskRoutingEnabled,
              backgroundTaskModel: settings.backgroundTaskModel,
            })}
          />
        </Section>

        {/* ── Request Idempotency ── */}
        <Section title="Request Idempotency" icon="commit" iconBg="bg-emerald-500/10" iconColor="text-emerald-500">
          <SectionToggle
            label="Enable Idempotency Deduplication"
            description="Return cached or in-flight responses for duplicate non-streaming requests."
            checked={!!settings.idempotencyEnabled}
            onChange={(v) => updateSetting("idempotencyEnabled", v)}
          />
          <NumberInput
            label="Idempotency TTL (ms)"
            value={settings.idempotencyTtlMs}
            onChange={(v) => updateSetting("idempotencyTtlMs", v)}
            min={1000}
            placeholder="5000"
          />
          <SaveButton
            saving={saving}
            onClick={() => saveSettings({
              idempotencyEnabled: settings.idempotencyEnabled,
              idempotencyTtlMs: settings.idempotencyTtlMs,
            })}
          />
        </Section>

        {/* ── Quota Preflight ── */}
        <Section title="Quota Preflight" icon="speed" iconBg="bg-amber-500/10" iconColor="text-amber-500">
          <SectionToggle
            label="Enable Quota Preflight"
            description="Exclude quota-exhausted connections before dispatch (soft hint — never blocks)."
            checked={!!settings.quotaPreflightEnabled}
            onChange={(v) => { updateSetting("quotaPreflightEnabled", v); saveSettings({ quotaPreflightEnabled: v }); }}
          />
        </Section>

        {/* ── MCP Server ── */}
        <Section title="MCP Server" icon="hub" iconBg="bg-violet-500/10" iconColor="text-violet-500">
          <SectionToggle
            label="Enable MCP HTTP Endpoint"
            description="Exposes /api/mcp for Model Context Protocol (HTTP/SSE transport)."
            checked={settings.mcpServerEnabled !== false}
            onChange={(v) => { updateSetting("mcpServerEnabled", v); saveSettings({ mcpServerEnabled: v }); }}
          />
          <p className="text-xs text-text-muted mt-2">
            For stdio transport, run:{" "}
            <code className="font-mono bg-surface px-1 rounded">MCP_API_KEY=&lt;key&gt; 9router mcp</code>
          </p>
        </Section>

      </div>
    </div>
  );
}
