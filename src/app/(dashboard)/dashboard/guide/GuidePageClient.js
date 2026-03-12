"use client";

import { useState } from "react";
import Card from "@/shared/components/Card";

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({ icon, title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-sidebar/50 hover:bg-sidebar/80 transition-colors text-left"
      >
        <span className="flex items-center gap-2 font-semibold text-sm text-text-main">
          <span className="material-symbols-outlined text-[18px] text-primary">{icon}</span>
          {title}
        </span>
        <span className="material-symbols-outlined text-[18px] text-text-muted">
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>
      {open && (
        <div className="px-4 py-4 bg-surface/40 text-sm space-y-3 border-t border-border">
          {children}
        </div>
      )}
    </div>
  );
}

function Code({ children, block = false }) {
  if (block) {
    return (
      <pre className="font-mono bg-black/5 dark:bg-white/5 border border-border rounded-lg px-4 py-3 overflow-x-auto whitespace-pre text-xs text-text-main leading-relaxed">
        {children}
      </pre>
    );
  }
  return (
    <code className="font-mono bg-black/5 dark:bg-white/5 rounded px-1.5 py-0.5 text-xs text-text-main">
      {children}
    </code>
  );
}

function Callout({ type = "info", children }) {
  const styles = {
    info:    "bg-blue-50   border-blue-200   dark:bg-blue-900/20   dark:border-blue-800   text-blue-800   dark:text-blue-200",
    warning: "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200",
    success: "bg-green-50  border-green-200  dark:bg-green-900/20  dark:border-green-800  text-green-800  dark:text-green-200",
  };
  const icons = { info: "info", warning: "warning", success: "check_circle" };
  return (
    <div className={`flex gap-2 p-3 rounded-lg border text-xs ${styles[type]}`}>
      <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">{icons[type]}</span>
      <span>{children}</span>
    </div>
  );
}

function AuthBadge({ type }) {
  if (type === "oauth")  return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">OAuth</span>;
  if (type === "apikey") return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">API Key</span>;
  return null;
}

function ProviderRow({ name, alias, model, auth, note }) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="py-2 px-3 font-medium text-text-main whitespace-nowrap text-xs">
        {name}
        {alias && <span className="ml-1 text-[10px] text-text-muted">({alias})</span>}
      </td>
      <td className="py-2 px-3 font-mono text-[11px] text-text-muted whitespace-nowrap">{model}</td>
      <td className="py-2 px-3 whitespace-nowrap"><AuthBadge type={auth} /></td>
      {note && <td className="py-2 px-3 text-[11px] text-text-muted">{note}</td>}
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GuidePageClient() {
  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-main mb-1">User Guide</h1>
        <p className="text-text-muted text-sm">
          Everything you need to connect any AI client or CLI to 9Router.
        </p>
      </div>

      {/* Quick Start */}
      <Card>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">rocket_launch</span>
          Quick Start
        </h2>
        <ol className="space-y-2 list-decimal list-inside text-sm text-text-main">
          <li><strong>Create an API Key</strong> — go to <strong>Dashboard → Endpoint</strong> and click <em>Create Key</em>.</li>
          <li><strong>Add a Provider</strong> — go to <strong>Dashboard → Providers</strong> and configure at least one provider (OAuth sign-in or paste an API key).</li>
          <li><strong>Point your client at the endpoint</strong> — use the base URL shown on the Endpoint page and your API key as the bearer token.</li>
        </ol>
        <div className="mt-3">
          <Callout type="success">
            Use model format <strong>provider/model-id</strong> (e.g. <Code>cc/claude-sonnet-4-6</Code>) in every request body.
          </Callout>
        </div>
      </Card>

      {/* API Endpoints */}
      <Card>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">api</span>
          API Endpoints
        </h2>
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-sidebar/50 border-b border-border">
                <th className="text-left py-2 px-3 font-semibold">Method</th>
                <th className="text-left py-2 px-3 font-semibold">Path</th>
                <th className="text-left py-2 px-3 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody className="text-text-main divide-y divide-border">
              <tr><td className="py-2 px-3 font-mono">POST</td><td className="py-2 px-3 font-mono">/v1/chat/completions</td><td className="py-2 px-3 text-text-muted">OpenAI-format chat (most providers)</td></tr>
              <tr><td className="py-2 px-3 font-mono">POST</td><td className="py-2 px-3 font-mono">/v1/messages</td><td className="py-2 px-3 text-text-muted">Anthropic-format messages</td></tr>
              <tr><td className="py-2 px-3 font-mono">POST</td><td className="py-2 px-3 font-mono">/v1/responses</td><td className="py-2 px-3 text-text-muted">OpenAI Responses API</td></tr>
              <tr><td className="py-2 px-3 font-mono">POST</td><td className="py-2 px-3 font-mono">/v1/embeddings</td><td className="py-2 px-3 text-text-muted">Embeddings (OpenAI-compatible)</td></tr>
              <tr><td className="py-2 px-3 font-mono">GET</td><td className="py-2 px-3 font-mono">/v1/models</td><td className="py-2 px-3 text-text-muted">List all available models</td></tr>
              <tr><td className="py-2 px-3 font-mono">POST</td><td className="py-2 px-3 font-mono">/v1/messages/count_tokens</td><td className="py-2 px-3 text-text-muted">Token counting (Anthropic-compatible)</td></tr>
              <tr><td className="py-2 px-3 font-mono">POST</td><td className="py-2 px-3 font-mono">/v1beta/models/…</td><td className="py-2 px-3 text-text-muted">Gemini generateContent format</td></tr>
              <tr><td className="py-2 px-3 font-mono">POST</td><td className="py-2 px-3 font-mono">/v1/api/chat</td><td className="py-2 px-3 text-text-muted">Ollama-style transform path</td></tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <Callout type="info">
            All paths accept both OpenAI and Anthropic request formats — 9Router auto-detects and translates.
          </Callout>
        </div>
      </Card>

      {/* Provider Reference */}
      <Card>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">hub</span>
          Provider Reference
        </h2>
        <p className="text-sm text-text-muted mb-4">
          Use the <strong>alias</strong> (short form) or full provider ID as the prefix: <Code>alias/model-id</Code>.
        </p>

        <p className="text-xs font-semibold text-text-main uppercase tracking-wide mb-2">OAuth Providers — sign in once, tokens auto-refresh</p>
        <div className="overflow-x-auto rounded border border-border mb-5">
          <table className="w-full">
            <thead>
              <tr className="bg-sidebar/50 border-b border-border text-xs">
                <th className="text-left py-2 px-3 font-semibold">Provider</th>
                <th className="text-left py-2 px-3 font-semibold">Example model</th>
                <th className="text-left py-2 px-3 font-semibold">Auth</th>
                <th className="text-left py-2 px-3 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              <ProviderRow name="Claude Code"      alias="cc"           model="cc/claude-sonnet-4-6"                   auth="oauth"  note="Anthropic PKCE flow" />
              <ProviderRow name="Gemini CLI"       alias="gc"           model="gc/gemini-3-flash-preview"              auth="oauth"  note="Google Cloud OAuth" />
              <ProviderRow name="Antigravity"      alias="ag"           model="ag/gemini-3.1-pro-high"                 auth="oauth"  note="Google Cloud Code" />
              <ProviderRow name="GitHub Copilot"   alias="gh"           model="gh/gpt-5"                               auth="oauth"  note="Device code flow" />
              <ProviderRow name="OpenAI Codex"     alias="cx"           model="cx/gpt-5.3-codex"                       auth="oauth"  note="OpenAI PKCE flow" />
              <ProviderRow name="Qwen Code"        alias="qw"           model="qw/qwen3-coder-plus"                    auth="oauth"  note="Device code + PKCE" />
              <ProviderRow name="iFlow AI"         alias="if"           model="if/kimi-k2"                             auth="oauth"  note="iflow.cn OAuth" />
              <ProviderRow name="Kiro AI"          alias="kr"           model="kr/claude-sonnet-4.5"                   auth="oauth"  note="AWS Builder ID / IDC / Social" />
              <ProviderRow name="Cursor (import)"  alias="cu"           model="cu/claude-4.5-sonnet"                   auth="oauth"  note="Import from Cursor SQLite" />
              <ProviderRow name="KiloCode"         alias="kc"           model="kc/anthropic/claude-sonnet-4-20250514"  auth="oauth"  note="Device auth" />
              <ProviderRow name="Cline"            alias="cl"           model="cl/anthropic/claude-sonnet-4.6"         auth="oauth"  note="Local callback" />
            </tbody>
          </table>
        </div>

        <p className="text-xs font-semibold text-text-main uppercase tracking-wide mb-2">API Key Providers — paste key in Dashboard → Providers</p>
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full">
            <thead>
              <tr className="bg-sidebar/50 border-b border-border text-xs">
                <th className="text-left py-2 px-3 font-semibold">Provider</th>
                <th className="text-left py-2 px-3 font-semibold">Example model</th>
                <th className="text-left py-2 px-3 font-semibold">Auth</th>
              </tr>
            </thead>
            <tbody>
              <ProviderRow name="OpenAI"        alias="openai"       model="openai/gpt-4o"                              auth="apikey" />
              <ProviderRow name="Anthropic"     alias="anthropic"    model="anthropic/claude-3-5-sonnet"                auth="apikey" />
              <ProviderRow name="Gemini"        alias="gemini"       model="gemini/gemini-2.0-flash"                    auth="apikey" />
              <ProviderRow name="DeepSeek"      alias="ds"           model="ds/deepseek-chat"                           auth="apikey" />
              <ProviderRow name="Groq"          alias="groq"         model="groq/llama-3.3-70b-versatile"               auth="apikey" />
              <ProviderRow name="xAI (Grok)"   alias="xai"          model="xai/grok-4"                                 auth="apikey" />
              <ProviderRow name="Mistral"       alias="mistral"      model="mistral/codestral-latest"                   auth="apikey" />
              <ProviderRow name="OpenRouter"    alias="openrouter"   model="openrouter/meta-llama/llama-3.1-8b"         auth="apikey" />
              <ProviderRow name="GLM"           alias="glm"          model="glm/glm-5"                                  auth="apikey" />
              <ProviderRow name="Kimi"          alias="kimi"         model="kimi/kimi-k2.5"                             auth="apikey" />
              <ProviderRow name="MiniMax"       alias="minimax"      model="minimax/MiniMax-M2.5"                       auth="apikey" />
              <ProviderRow name="SiliconFlow"   alias="siliconflow"  model="siliconflow/deepseek-ai/DeepSeek-V3.2"      auth="apikey" />
              <ProviderRow name="Together AI"   alias="together"     model="together/meta-llama/Llama-3.3-70B-Instruct-Turbo" auth="apikey" />
              <ProviderRow name="Perplexity"    alias="pplx"         model="pplx/sonar"                                 auth="apikey" />
              <ProviderRow name="Fireworks"     alias="fireworks"    model="fireworks/llama-v3p3-70b-instruct"          auth="apikey" />
              <ProviderRow name="Cerebras"      alias="cerebras"     model="cerebras/llama-3.3-70b"                     auth="apikey" />
              <ProviderRow name="Cohere"        alias="cohere"       model="cohere/command-r-plus"                      auth="apikey" />
              <ProviderRow name="NVIDIA NIM"    alias="nvidia"       model="nvidia/nemotron-nano-12b-v2"                auth="apikey" />
              <ProviderRow name="Nebius"        alias="nebius"       model="nebius/llama-3.3-70b"                       auth="apikey" />
              <ProviderRow name="Hyperbolic"    alias="hyp"          model="hyp/model"                                  auth="apikey" />
              <ProviderRow name="Chutes AI"     alias="ch"           model="ch/model"                                   auth="apikey" />
              <ProviderRow name="AliCode"       alias="alicode"      model="alicode/qwen-plus"                          auth="apikey" />
              <ProviderRow name="AliCode Intl"  alias="alicode-intl" model="alicode-intl/qwen-plus"                     auth="apikey" />
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <Callout type="info">
            Custom endpoints: use prefix <Code>openai-compatible-*</Code> or <Code>anthropic-compatible-*</Code> for any self-hosted or third-party compatible API.
          </Callout>
        </div>
      </Card>

      {/* CLI / Client Setup */}
      <Card>
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">terminal</span>
          Client &amp; CLI Setup
        </h2>
        <div className="space-y-3">

          {/* Claude Code */}
          <Section icon="terminal" title="Claude Code CLI" defaultOpen>
            <p className="text-text-muted text-xs mb-1">
              Set env vars before running <Code>claude</Code>, or add to your shell profile (<Code>~/.zshrc</Code> / <Code>~/.bashrc</Code>).
            </p>
            <Code block>{`# Minimal — uses cc/claude-sonnet-4-6 by default
export ANTHROPIC_BASE_URL="http://localhost:20128/v1"
export ANTHROPIC_API_KEY="your-9router-api-key"

# Optional: override each model tier independently
export ANTHROPIC_DEFAULT_OPUS_MODEL="cc/claude-opus-4-6"
export ANTHROPIC_DEFAULT_SONNET_MODEL="cc/claude-sonnet-4-6"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="cc/claude-haiku-4-5-20251001"

claude`}</Code>
            <p className="text-text-muted text-xs mt-1 mb-1">Or persist in <Code>~/.claude/settings.json</Code>:</p>
            <Code block>{`{
  "anthropic_api_base": "http://localhost:20128/v1",
  "anthropic_api_key": "your-9router-api-key"
}`}</Code>
            <Callout type="info">
              You can mix providers per tier, e.g. set <Code>ANTHROPIC_DEFAULT_SONNET_MODEL=ag/claude-sonnet-4-6</Code> to use Antigravity&apos;s free Claude quota.
            </Callout>
          </Section>

          {/* OpenCode */}
          <Section icon="code" title="OpenCode">
            <p className="text-text-muted text-xs mb-1">Install: <Code>npm install -g opencode-ai</Code></p>
            <p className="text-text-muted text-xs mb-1">Edit <Code>~/.config/opencode/opencode.json</Code>:</p>
            <Code block>{`{
  "provider": {
    "9router": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://localhost:20128/v1",
        "apiKey": "your-9router-api-key"
      },
      "models": {
        "cc/claude-sonnet-4-6": { "name": "Claude Sonnet (9Router)" },
        "cx/gpt-5.3-codex":     { "name": "Codex GPT-5.3 (9Router)" }
      }
    }
  },
  "model": "9router/cc/claude-sonnet-4-6"
}`}</Code>
            <Callout type="warning">Use <Code>127.0.0.1</Code> instead of <Code>localhost</Code> if you hit IPv6 connection errors.</Callout>
            <Callout type="info">9Router can auto-apply this — go to <strong>Dashboard → CLI Tools → OpenCode</strong> and click <em>Apply</em>.</Callout>
          </Section>

          {/* OpenAI Codex CLI */}
          <Section icon="smart_toy" title="OpenAI Codex CLI">
            <Code block>{`export OPENAI_BASE_URL="http://localhost:20128"
export OPENAI_API_KEY="your-9router-api-key"

codex "Refactor this function to use async/await"`}</Code>
            <Callout type="info">
              To route through 9Router&apos;s Codex OAuth account (no personal key needed), set model to <Code>cx/gpt-5.3-codex</Code>.
            </Callout>
          </Section>

          {/* Cursor */}
          <Section icon="edit" title="Cursor IDE">
            <ol className="space-y-1.5 list-decimal list-inside text-text-main text-xs">
              <li>Open <strong>Settings → Models</strong></li>
              <li>Enable <strong>OpenAI API key</strong> toggle</li>
              <li>Set <strong>Base URL</strong> to your tunnel URL + <Code>/v1</Code></li>
              <li>Set <strong>API Key</strong> to your 9Router API key</li>
              <li>Click <strong>View All Models → Add Custom Model</strong>, enter e.g. <Code>cc/claude-opus-4-6</Code></li>
            </ol>
            <Callout type="warning">
              Cursor sends requests through its own cloud servers — <strong>localhost will not work</strong>. Enable the Cloudflare Tunnel first and use the public URL.
            </Callout>
          </Section>

          {/* Cline / Kilo Code / RooCode */}
          <Section icon="extension" title="Cline / Kilo Code / RooCode (VS Code)">
            <p className="text-text-muted text-xs mb-2">Cline and Kilo Code use <strong>OpenAI Compatible</strong>:</p>
            <ol className="space-y-1 list-decimal list-inside text-text-main text-xs mb-3">
              <li>Open the extension settings panel</li>
              <li>API Provider → <strong>OpenAI Compatible</strong></li>
              <li>Base URL → <Code>http://localhost:20128/v1</Code></li>
              <li>API Key → your 9Router API key</li>
              <li>Model → e.g. <Code>cc/claude-opus-4-6</Code></li>
            </ol>
            <p className="text-text-muted text-xs mb-2">Roo uses <strong>Ollama</strong> provider (different path):</p>
            <ol className="space-y-1 list-decimal list-inside text-text-main text-xs">
              <li>API Provider → <strong>Ollama</strong></li>
              <li>Base URL → <Code>http://localhost:20128</Code> <em>(no /v1)</em></li>
              <li>API Key → your 9Router API key</li>
            </ol>
            <Callout type="info">
              Use <strong>Dashboard → CLI Tools</strong> to auto-apply settings for Cline and Kilo Code.
            </Callout>
          </Section>

          {/* Continue.dev */}
          <Section icon="auto_awesome" title="Continue.dev">
            <p className="text-text-muted text-xs mb-1">Add entries to <Code>models</Code> in <Code>~/.continue/config.json</Code>:</p>
            <Code block>{`{
  "models": [
    {
      "title": "Claude Sonnet via 9Router",
      "provider": "openai",
      "model": "cc/claude-sonnet-4-6",
      "apiBase": "http://localhost:20128/v1",
      "apiKey": "your-9router-api-key"
    },
    {
      "title": "Codex GPT-5 via 9Router",
      "provider": "openai",
      "model": "cx/gpt-5.3-codex",
      "apiBase": "http://localhost:20128/v1",
      "apiKey": "your-9router-api-key"
    }
  ]
}`}</Code>
          </Section>

          {/* Aider */}
          <Section icon="terminal" title="Aider">
            <Code block>{`aider \\
  --openai-api-base http://localhost:20128/v1 \\
  --openai-api-key your-9router-api-key \\
  --model cc/claude-sonnet-4-6`}</Code>
            <p className="text-text-muted text-xs mt-1 mb-1">Or persist in <Code>~/.aider.conf.yml</Code>:</p>
            <Code block>{`openai-api-base: http://localhost:20128/v1
openai-api-key: your-9router-api-key
model: cc/claude-sonnet-4-6`}</Code>
          </Section>

          {/* Open Claw */}
          <Section icon="terminal" title="Open Claw">
            <p className="text-text-muted text-xs mb-1">Edit <Code>~/.openclaw/openclaw.json</Code>:</p>
            <Code block>{`{
  "agents": {
    "defaults": {
      "model": { "primary": "9router/if/glm-4.7" }
    }
  },
  "models": {
    "providers": {
      "9router": {
        "baseUrl": "http://127.0.0.1:20128/v1",
        "apiKey": "your-9router-api-key",
        "api": "openai-completions",
        "models": [
          { "id": "if/glm-4.7",           "name": "iFlow GLM-4.7" },
          { "id": "cc/claude-sonnet-4-6",  "name": "Claude Sonnet" },
          { "id": "cx/gpt-5.3-codex",      "name": "Codex GPT-5.3" }
        ]
      }
    }
  }
}`}</Code>
            <Callout type="warning">Use <Code>127.0.0.1</Code> not <Code>localhost</Code> to avoid IPv6 resolution issues.</Callout>
          </Section>

          {/* Windsurf */}
          <Section icon="cloud" title="Windsurf / Any OpenAI-compatible client">
            <p className="text-text-muted text-xs mb-2">Any client that lets you set a custom OpenAI base URL works with 9Router:</p>
            <Code block>{`Base URL : http://localhost:20128/v1
API Key  : your-9router-api-key
Model    : cc/claude-sonnet-4-6   (or any provider/model-id)`}</Code>
            <p className="text-text-muted text-xs mt-2">For Windsurf: <strong>Settings → AI Providers → Add Provider → OpenAI Compatible</strong>.</p>
          </Section>

        </div>
      </Card>

      {/* MITM Mode */}
      <Card>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">security</span>
          MITM Mode
        </h2>
        <p className="text-sm text-text-muted mb-3">
          Some providers work via a transparent MITM proxy — 9Router intercepts the IDE&apos;s own network calls by impersonating the upstream domain. No manual request changes needed.
        </p>
        <div className="overflow-x-auto rounded border border-border mb-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-sidebar/50 border-b border-border">
                <th className="text-left py-2 px-3 font-semibold">Tool</th>
                <th className="text-left py-2 px-3 font-semibold">Intercepted domain</th>
                <th className="text-left py-2 px-3 font-semibold">Where to configure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-text-main">
              <tr>
                <td className="py-2 px-3 font-medium">Antigravity (Google Cloud Code)</td>
                <td className="py-2 px-3 font-mono">daily-cloudcode-pa.googleapis.com</td>
                <td className="py-2 px-3 text-text-muted">Dashboard → CLI Tools → Antigravity</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium">GitHub Copilot</td>
                <td className="py-2 px-3 font-mono">api.individual.githubcopilot.com</td>
                <td className="py-2 px-3 text-text-muted">Dashboard → CLI Tools → GitHub Copilot</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Callout type="warning">
          MITM mode requires installing a local CA certificate so your IDE trusts the intercepted TLS connection. Follow the on-screen instructions on the CLI Tools page.
        </Callout>
      </Card>

      {/* Token Refresh */}
      <Card>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">autorenew</span>
          Token Refresh (OAuth Providers)
        </h2>
        <p className="text-sm text-text-muted mb-3">
          9Router automatically refreshes OAuth access tokens <strong>before every request</strong> if they will expire within 5 minutes.
        </p>
        <div className="overflow-x-auto rounded border border-border mb-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-sidebar/50 border-b border-border">
                <th className="text-left py-2 px-3 font-semibold">Token type</th>
                <th className="text-left py-2 px-3 font-semibold">Typical lifetime</th>
                <th className="text-left py-2 px-3 font-semibold">Behaviour</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-text-main">
              <tr>
                <td className="py-2 px-3 font-medium">Access token</td>
                <td className="py-2 px-3 text-text-muted">1 – 8 hours</td>
                <td className="py-2 px-3 text-text-muted">Auto-refreshed silently before every request</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium">Refresh token</td>
                <td className="py-2 px-3 text-text-muted">30 – 90 days</td>
                <td className="py-2 px-3 text-text-muted">Must re-authenticate when this expires</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium">GitHub Copilot token</td>
                <td className="py-2 px-3 text-text-muted">Short (minutes–hours)</td>
                <td className="py-2 px-3 text-text-muted">Separately auto-refreshed via GitHub OAuth token</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Callout type="success">
          You won&apos;t be interrupted by token expiry during normal use. Re-login is only needed every few weeks or months.
        </Callout>
      </Card>

      {/* Cloudflare Tunnel */}
      <Card>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">cloud_upload</span>
          Cloudflare Tunnel
        </h2>
        <p className="text-sm text-text-muted mb-3">
          Enable the tunnel to expose your local 9Router to the internet — required for Cursor, useful for remote work and team sharing.
        </p>
        <ul className="text-sm text-text-muted space-y-1 list-disc list-inside mb-3">
          <li>No port forwarding or static IP needed — uses Cloudflare&apos;s edge.</li>
          <li>End-to-end TLS. Public URL format: <Code>https://&lt;id&gt;.trycloudflare.com/v1</Code></li>
          <li>Requires outbound port 7844 (TCP/UDP).</li>
          <li>Only <strong>admins</strong> can enable/disable the tunnel.</li>
        </ul>
        <Callout type="info">
          Once active, the endpoint URL on the main dashboard page updates automatically to the tunnel URL.
        </Callout>
      </Card>

      {/* Troubleshooting */}
      <Card>
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">help</span>
          Troubleshooting
        </h2>
        <div className="space-y-3">
          {[
            {
              title: "401 Unauthorized",
              body: <>Your <em>9Router</em> API key is missing or wrong. Check <Code>Authorization: Bearer &lt;key&gt;</Code> header — this is your 9Router key, not the provider key.</>,
            },
            {
              title: "No credentials for provider",
              body: <>Go to <strong>Dashboard → Providers</strong> and add credentials for the provider prefix in your model string.</>,
            },
            {
              title: "Token expired / OAuth error",
              body: <>The refresh token has expired. Delete the connection in <strong>Providers</strong> and re-authenticate via OAuth.</>,
            },
            {
              title: "All accounts rate limited",
              body: <>Add more accounts for the same provider. 9Router auto-rotates with exponential backoff cooldowns.</>,
            },
            {
              title: "Cursor can't connect (localhost refused)",
              body: <>Cursor routes through its cloud — enable the <strong>Cloudflare Tunnel</strong> and paste the public URL into Cursor's settings.</>,
            },
            {
              title: "OpenCode / Open Claw can't connect",
              body: <>Replace <Code>localhost</Code> with <Code>127.0.0.1</Code> — some systems default to IPv6 for localhost which can cause refusal.</>,
            },
            {
              title: "Model not found",
              body: <>Check the model string format is exactly <Code>provider/model-id</Code> or <Code>alias/model-id</Code>. Use <Code>GET /v1/models</Code> to list all currently available models.</>,
            },
          ].map(({ title, body }) => (
            <div key={title} className="rounded-lg border border-border p-3">
              <p className="font-semibold text-text-main text-xs mb-1">{title}</p>
              <p className="text-text-muted text-xs">{body}</p>
            </div>
          ))}
        </div>
      </Card>

    </div>
  );
}
