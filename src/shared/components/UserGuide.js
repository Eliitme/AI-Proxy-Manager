"use client";

import { useState } from "react";
import Card from "./Card";

// ── Section toggle ────────────────────────────────────────────────────────────

function Section({ icon, title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-blue-50/60 dark:bg-blue-900/20 hover:bg-blue-100/60 dark:hover:bg-blue-900/30 transition-colors text-left"
      >
        <span className="flex items-center gap-2 font-semibold text-sm text-blue-900 dark:text-blue-100">
          <span className="material-symbols-outlined text-[18px] text-blue-600 dark:text-blue-400">{icon}</span>
          {title}
        </span>
        <span className="material-symbols-outlined text-[18px] text-blue-500 dark:text-blue-400">
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>
      {open && (
        <div className="px-4 py-4 bg-white/60 dark:bg-black/20 text-sm space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Code block ────────────────────────────────────────────────────────────────

function Code({ children, block = false }) {
  const cls = "font-mono bg-black/5 dark:bg-white/10 rounded px-1 text-xs";
  if (block) {
    return (
      <pre className={`${cls} px-3 py-2.5 overflow-x-auto whitespace-pre text-blue-900 dark:text-blue-100 leading-relaxed`}>
        {children}
      </pre>
    );
  }
  return <code className={cls}>{children}</code>;
}

// ── Small badge ───────────────────────────────────────────────────────────────

function Badge({ children, color = "blue" }) {
  const colors = {
    blue:   "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    green:  "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    gray:   "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${colors[color]}`}>
      {children}
    </span>
  );
}

// ── Warning / info callout ────────────────────────────────────────────────────

function Callout({ type = "info", children }) {
  const styles = {
    info:    "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 text-blue-800 dark:text-blue-200",
    warning: "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200",
    success: "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800 text-green-800 dark:text-green-200",
  };
  const icons = { info: "info", warning: "warning", success: "check_circle" };
  return (
    <div className={`flex gap-2 p-3 rounded-lg border text-xs ${styles[type]}`}>
      <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">{icons[type]}</span>
      <span>{children}</span>
    </div>
  );
}

// ── Provider row ──────────────────────────────────────────────────────────────

function ProviderRow({ name, alias, model, auth, note }) {
  return (
    <tr className="border-b border-blue-100 dark:border-blue-900/40 last:border-b-0">
      <td className="py-2 pr-3 font-medium text-blue-900 dark:text-blue-100 whitespace-nowrap">
        {name}
        {alias && <span className="ml-1 text-[10px] text-blue-500 dark:text-blue-400">({alias})</span>}
      </td>
      <td className="py-2 pr-3 font-mono text-[11px] text-blue-800 dark:text-blue-200 whitespace-nowrap">{model}</td>
      <td className="py-2 pr-3 whitespace-nowrap">
        {auth === "oauth"  && <Badge color="green">OAuth</Badge>}
        {auth === "apikey" && <Badge color="blue">API Key</Badge>}
        {auth === "free"   && <Badge color="orange">Free</Badge>}
      </td>
      {note && <td className="py-2 text-[11px] text-blue-700 dark:text-blue-300">{note}</td>}
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function UserGuide() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <span className="material-symbols-outlined text-3xl text-blue-600 dark:text-blue-400 shrink-0">menu_book</span>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-blue-900 dark:text-blue-100 mb-1">9Router User Guide</h2>
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
              Unified AI gateway — route any client or CLI to 50+ providers through a single OpenAI-compatible endpoint.
            </p>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              <span>{isExpanded ? "Collapse" : "Read"} Guide</span>
              <span className="material-symbols-outlined text-[18px]">
                {isExpanded ? "expand_less" : "expand_more"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible body */}
      {isExpanded && (
        <div className="mt-6 space-y-3 text-sm">

          {/* ── Quick Start ─────────────────────────────────────────────── */}
          <Section icon="rocket_launch" title="Quick Start" defaultOpen>
            <ol className="space-y-2 list-decimal list-inside text-blue-800 dark:text-blue-200">
              <li><strong>Create an API Key</strong> — scroll down to <em>API Keys</em> and click <em>Create Key</em>.</li>
              <li><strong>Add a Provider</strong> — go to <strong>Dashboard → Providers</strong> and configure at least one provider (OAuth or API key).</li>
              <li><strong>Point your client at the endpoint</strong> — use <Code>/v1</Code> as the base URL and your API key as the bearer token.</li>
            </ol>
            <Callout type="success">
              That's it. Use model format <strong>provider/model-id</strong> (e.g.{" "}
              <Code>cc/claude-sonnet-4-6</Code>) in every request.
            </Callout>
          </Section>

          {/* ── Endpoints ───────────────────────────────────────────────── */}
          <Section icon="api" title="API Endpoints">
            <div className="overflow-x-auto rounded border border-blue-200 dark:border-blue-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800">
                    <th className="text-left py-2 px-3 font-semibold">Method</th>
                    <th className="text-left py-2 px-3 font-semibold">Path</th>
                    <th className="text-left py-2 px-3 font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody className="text-blue-800 dark:text-blue-200 divide-y divide-blue-100 dark:divide-blue-900/40">
                  <tr><td className="py-2 px-3 font-mono">POST</td><td className="py-2 px-3 font-mono">/v1/chat/completions</td><td className="py-2 px-3">OpenAI-format chat (most providers)</td></tr>
                  <tr><td className="py-2 px-3 font-mono">POST</td><td className="py-2 px-3 font-mono">/v1/messages</td><td className="py-2 px-3">Anthropic-format messages</td></tr>
                  <tr><td className="py-2 px-3 font-mono">POST</td><td className="py-2 px-3 font-mono">/v1/responses</td><td className="py-2 px-3">OpenAI Responses API</td></tr>
                  <tr><td className="py-2 px-3 font-mono">POST</td><td className="py-2 px-3 font-mono">/v1/embeddings</td><td className="py-2 px-3">Embeddings (OpenAI-compatible)</td></tr>
                  <tr><td className="py-2 px-3 font-mono">GET</td><td className="py-2 px-3 font-mono">/v1/models</td><td className="py-2 px-3">List all available models</td></tr>
                  <tr><td className="py-2 px-3 font-mono">POST</td><td className="py-2 px-3 font-mono">/v1/messages/count_tokens</td><td className="py-2 px-3">Token counting (Anthropic-compatible)</td></tr>
                  <tr><td className="py-2 px-3 font-mono">POST</td><td className="py-2 px-3 font-mono">/v1beta/models/…</td><td className="py-2 px-3">Gemini generateContent format</td></tr>
                  <tr><td className="py-2 px-3 font-mono">POST</td><td className="py-2 px-3 font-mono">/v1/api/chat</td><td className="py-2 px-3">Ollama-style transform path</td></tr>
                </tbody>
              </table>
            </div>
            <Callout type="info">
              All paths accept both OpenAI and Anthropic request formats — 9Router auto-detects and translates.
            </Callout>
          </Section>

          {/* ── Provider Reference ──────────────────────────────────────── */}
          <Section icon="hub" title="Provider Reference">
            <p className="text-blue-800 dark:text-blue-200 mb-2">
              Use the <strong>provider alias</strong> (short form) or full ID as the prefix in the model field.
            </p>

            <p className="text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wide mb-1">OAuth Providers (sign in once, auto-refresh)</p>
            <div className="overflow-x-auto rounded border border-blue-200 dark:border-blue-800 mb-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800">
                    <th className="text-left py-2 px-3 font-semibold">Provider</th>
                    <th className="text-left py-2 px-3 font-semibold">Example model</th>
                    <th className="text-left py-2 px-3 font-semibold">Auth</th>
                    <th className="text-left py-2 px-3 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <ProviderRow name="Claude Code" alias="cc" model="cc/claude-sonnet-4-6" auth="oauth" note="Anthropic PKCE flow" />
                  <ProviderRow name="Gemini CLI" alias="gc" model="gc/gemini-3-flash-preview" auth="oauth" note="Google Cloud OAuth" />
                  <ProviderRow name="Antigravity" alias="ag" model="ag/gemini-3.1-pro-high" auth="oauth" note="Google Cloud Code" />
                  <ProviderRow name="GitHub Copilot" alias="gh" model="gh/gpt-5" auth="oauth" note="Device code flow" />
                  <ProviderRow name="OpenAI Codex" alias="cx" model="cx/gpt-5.3-codex" auth="oauth" note="OpenAI PKCE flow" />
                  <ProviderRow name="Qwen Code" alias="qw" model="qw/qwen3-coder-plus" auth="oauth" note="Device code + PKCE" />
                  <ProviderRow name="iFlow AI" alias="if" model="if/kimi-k2" auth="oauth" note="iflow.cn OAuth" />
                  <ProviderRow name="Kiro AI" alias="kr" model="kr/claude-sonnet-4.5" auth="oauth" note="AWS Builder ID / IDC / Social" />
                  <ProviderRow name="Cursor (import)" alias="cu" model="cu/claude-4.5-sonnet" auth="oauth" note="Import from Cursor SQLite" />
                  <ProviderRow name="KiloCode" alias="kc" model="kc/anthropic/claude-sonnet-4-20250514" auth="oauth" note="Device auth" />
                  <ProviderRow name="Cline" alias="cl" model="cl/anthropic/claude-sonnet-4.6" auth="oauth" note="Local callback" />
                </tbody>
              </table>
            </div>

            <p className="text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wide mb-1">API Key Providers (add key in Providers page)</p>
            <div className="overflow-x-auto rounded border border-blue-200 dark:border-blue-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800">
                    <th className="text-left py-2 px-3 font-semibold">Provider</th>
                    <th className="text-left py-2 px-3 font-semibold">Example model</th>
                    <th className="text-left py-2 px-3 font-semibold">Auth</th>
                  </tr>
                </thead>
                <tbody>
                  <ProviderRow name="OpenAI" alias="openai" model="openai/gpt-4o" auth="apikey" />
                  <ProviderRow name="Anthropic" alias="anthropic" model="anthropic/claude-3-5-sonnet" auth="apikey" />
                  <ProviderRow name="Gemini" alias="gemini" model="gemini/gemini-2.0-flash" auth="apikey" />
                  <ProviderRow name="DeepSeek" alias="ds" model="ds/deepseek-chat" auth="apikey" />
                  <ProviderRow name="Groq" alias="groq" model="groq/llama-3.3-70b-versatile" auth="apikey" />
                  <ProviderRow name="xAI (Grok)" alias="xai" model="xai/grok-4" auth="apikey" />
                  <ProviderRow name="Mistral" alias="mistral" model="mistral/codestral-latest" auth="apikey" />
                  <ProviderRow name="OpenRouter" alias="openrouter" model="openrouter/meta-llama/llama-3.1-8b" auth="apikey" />
                  <ProviderRow name="GLM" alias="glm" model="glm/glm-5" auth="apikey" />
                  <ProviderRow name="Kimi" alias="kimi" model="kimi/kimi-k2.5" auth="apikey" />
                  <ProviderRow name="MiniMax" alias="minimax" model="minimax/MiniMax-M2.5" auth="apikey" />
                  <ProviderRow name="SiliconFlow" alias="siliconflow" model="siliconflow/deepseek-ai/DeepSeek-V3.2" auth="apikey" />
                  <ProviderRow name="Together AI" alias="together" model="together/meta-llama/Llama-3.3-70B-Instruct-Turbo" auth="apikey" />
                  <ProviderRow name="Perplexity" alias="pplx" model="pplx/sonar" auth="apikey" />
                  <ProviderRow name="Fireworks" alias="fireworks" model="fireworks/llama-v3p3-70b-instruct" auth="apikey" />
                  <ProviderRow name="Cerebras" alias="cerebras" model="cerebras/llama-3.3-70b" auth="apikey" />
                  <ProviderRow name="Cohere" alias="cohere" model="cohere/command-r-plus" auth="apikey" />
                  <ProviderRow name="NVIDIA NIM" alias="nvidia" model="nvidia/nemotron-nano-12b-v2" auth="apikey" />
                  <ProviderRow name="Nebius" alias="nebius" model="nebius/llama-3.3-70b" auth="apikey" />
                  <ProviderRow name="Hyperbolic" alias="hyp" model="hyp/model" auth="apikey" />
                  <ProviderRow name="Chutes AI" alias="ch" model="ch/model" auth="apikey" />
                  <ProviderRow name="AliCode" alias="alicode" model="alicode/qwen-plus" auth="apikey" />
                  <ProviderRow name="AliCode Intl" alias="alicode-intl" model="alicode-intl/qwen-plus" auth="apikey" />
                </tbody>
              </table>
            </div>
            <Callout type="info">
              Custom endpoints: prefix <Code>openai-compatible-*</Code> or <Code>anthropic-compatible-*</Code> for any self-hosted or third-party OpenAI/Anthropic-compatible API.
            </Callout>
          </Section>

          {/* ── Claude Code CLI ─────────────────────────────────────────── */}
          <Section icon="terminal" title="Claude Code CLI">
            <p className="text-blue-800 dark:text-blue-200">
              Set environment variables before running <Code>claude</Code>, or add them to your shell profile.
            </p>
            <Code block>{`# Minimal setup (uses cc/claude-sonnet-4-6 by default)
export ANTHROPIC_BASE_URL="http://localhost:20128/v1"
export ANTHROPIC_API_KEY="your-9router-api-key"

# Optional: override individual model tiers
export ANTHROPIC_DEFAULT_OPUS_MODEL="cc/claude-opus-4-6"
export ANTHROPIC_DEFAULT_SONNET_MODEL="cc/claude-sonnet-4-6"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="cc/claude-haiku-4-5-20251001"

claude`}</Code>
            <p className="text-blue-800 dark:text-blue-200">Or edit <Code>~/.claude/settings.json</Code>:</p>
            <Code block>{`{
  "anthropic_api_base": "http://localhost:20128/v1",
  "anthropic_api_key": "your-9router-api-key"
}`}</Code>
            <Callout type="info">
              You can point <Code>ANTHROPIC_DEFAULT_SONNET_MODEL</Code> at any provider, e.g. <Code>ag/claude-sonnet-4-6</Code> to use Antigravity's free Claude quota.
            </Callout>
          </Section>

          {/* ── OpenCode ───────────────────────────────────────────────── */}
          <Section icon="code" title="OpenCode">
            <p className="text-blue-800 dark:text-blue-200">
              Install: <Code>npm install -g opencode-ai</Code>
            </p>
            <p className="text-blue-800 dark:text-blue-200 mt-1">
              Edit <Code>~/.config/opencode/opencode.json</Code>:
            </p>
            <Code block>{`{
  "provider": {
    "9router": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://localhost:20128/v1",
        "apiKey": "your-9router-api-key"
      },
      "models": {
        "cc/claude-sonnet-4-6": { "name": "Claude Sonnet (9Router)" }
      }
    }
  },
  "model": "9router/cc/claude-sonnet-4-6"
}`}</Code>
            <Callout type="info">
              Use <Code>127.0.0.1</Code> instead of <Code>localhost</Code> if you hit IPv6 connection issues.
            </Callout>
            <p className="text-blue-800 dark:text-blue-200 mt-1">
              9Router can auto-apply this config — go to <strong>Dashboard → CLI Tools → OpenCode</strong> and click <em>Apply</em>.
            </p>
          </Section>

          {/* ── OpenAI Codex CLI ───────────────────────────────────────── */}
          <Section icon="smart_toy" title="OpenAI Codex CLI">
            <Code block>{`export OPENAI_BASE_URL="http://localhost:20128"
export OPENAI_API_KEY="your-9router-api-key"

# Then run codex normally:
codex "Refactor this function to use async/await"`}</Code>
            <Callout type="info">
              To use 9Router's Codex OAuth provider instead of your own OpenAI key, set the model to <Code>cx/gpt-5.3-codex</Code>.
            </Callout>
          </Section>

          {/* ── Cursor ─────────────────────────────────────────────────── */}
          <Section icon="edit" title="Cursor IDE">
            <ol className="space-y-1.5 list-decimal list-inside text-blue-800 dark:text-blue-200">
              <li>Open <strong>Settings → Models</strong></li>
              <li>Enable <strong>OpenAI API key</strong> option</li>
              <li>Set <strong>Base URL</strong> to your tunnel URL + <Code>/v1</Code> (e.g. <Code>https://xyz.trycloudflare.com/v1</Code>)</li>
              <li>Set <strong>API Key</strong> to your 9Router API key</li>
              <li>Click <strong>View All Models → Add Custom Model</strong> and type the model (e.g. <Code>cc/claude-opus-4-6</Code>)</li>
            </ol>
            <Callout type="warning">
              Cursor routes requests through its own servers, so <strong>localhost does not work</strong>. You must enable the Cloudflare Tunnel first (or use Cloud Endpoint) to get a public URL.
            </Callout>
          </Section>

          {/* ── Cline / Kilo Code / RooCode ────────────────────────────── */}
          <Section icon="extension" title="Cline / Kilo Code / RooCode (VS Code)">
            <p className="text-blue-800 dark:text-blue-200 mb-2">All three use the same "OpenAI Compatible" provider option:</p>
            <ol className="space-y-1.5 list-decimal list-inside text-blue-800 dark:text-blue-200 mb-2">
              <li>Open the extension settings panel</li>
              <li>Select <strong>API Provider → OpenAI Compatible</strong></li>
              <li>Set <strong>Base URL</strong> → <Code>http://localhost:20128/v1</Code></li>
              <li>Set <strong>API Key</strong> → your 9Router API key</li>
              <li>Type or select model, e.g. <Code>cc/claude-opus-4-6</Code></li>
            </ol>
            <p className="text-blue-800 dark:text-blue-200 mb-1 font-semibold">Roo specifically:</p>
            <ol className="space-y-1.5 list-decimal list-inside text-blue-800 dark:text-blue-200">
              <li>Select <strong>API Provider → Ollama</strong> (not OpenAI Compatible)</li>
              <li>Set <strong>Base URL</strong> → <Code>http://localhost:20128</Code> (no <Code>/v1</Code>)</li>
              <li>Set <strong>API Key</strong> → your 9Router API key</li>
            </ol>
            <Callout type="info">
              Go to <strong>Dashboard → CLI Tools</strong> to auto-apply settings for Cline and Kilo Code with one click.
            </Callout>
          </Section>

          {/* ── Continue.dev ───────────────────────────────────────────── */}
          <Section icon="smart_toy" title="Continue.dev">
            <p className="text-blue-800 dark:text-blue-200 mb-2">
              Add to the <Code>models</Code> array in <Code>~/.continue/config.json</Code>:
            </p>
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
      "title": "GPT-5 via 9Router",
      "provider": "openai",
      "model": "cx/gpt-5.3-codex",
      "apiBase": "http://localhost:20128/v1",
      "apiKey": "your-9router-api-key"
    }
  ]
}`}</Code>
          </Section>

          {/* ── Aider ──────────────────────────────────────────────────── */}
          <Section icon="terminal" title="Aider">
            <Code block>{`aider \\
  --openai-api-base http://localhost:20128/v1 \\
  --openai-api-key your-9router-api-key \\
  --model cc/claude-sonnet-4-6`}</Code>
            <p className="text-blue-800 dark:text-blue-200 mt-1">Or persist in <Code>~/.aider.conf.yml</Code>:</p>
            <Code block>{`openai-api-base: http://localhost:20128/v1
openai-api-key: your-9router-api-key
model: cc/claude-sonnet-4-6`}</Code>
          </Section>

          {/* ── Open Claw ──────────────────────────────────────────────── */}
          <Section icon="terminal" title="Open Claw">
            <p className="text-blue-800 dark:text-blue-200 mb-2">
              Edit <Code>~/.openclaw/openclaw.json</Code>:
            </p>
            <Code block>{`{
  "agents": {
    "defaults": {
      "model": {
        "primary": "9router/if/glm-4.7"
      }
    }
  },
  "models": {
    "providers": {
      "9router": {
        "baseUrl": "http://127.0.0.1:20128/v1",
        "apiKey": "your-9router-api-key",
        "api": "openai-completions",
        "models": [
          { "id": "if/glm-4.7",        "name": "iFlow GLM-4.7" },
          { "id": "cc/claude-sonnet-4-6", "name": "Claude Sonnet" }
        ]
      }
    }
  }
}`}</Code>
            <Callout type="warning">Use <Code>127.0.0.1</Code> (not <Code>localhost</Code>) to avoid IPv6 resolution issues.</Callout>
          </Section>

          {/* ── Windsurf / Generic OpenAI-compat ───────────────────────── */}
          <Section icon="cloud" title="Windsurf / Any OpenAI-compatible client">
            <p className="text-blue-800 dark:text-blue-200 mb-2">
              Any client that supports a custom OpenAI base URL works:
            </p>
            <Code block>{`Base URL : http://localhost:20128/v1
API Key  : your-9router-api-key
Model    : cc/claude-sonnet-4-6   (or any provider/model-id)`}</Code>
            <p className="text-blue-800 dark:text-blue-200 mt-1">For Windsurf specifically, go to <strong>Settings → AI Providers → Add Provider → OpenAI Compatible</strong>.</p>
          </Section>

          {/* ── MITM Tools ──────────────────────────────────────────────── */}
          <Section icon="security" title="MITM Mode (Antigravity &amp; GitHub Copilot)">
            <p className="text-blue-800 dark:text-blue-200">
              Some providers are accessed via a transparent MITM proxy that intercepts the IDE's own network calls. No client config change needed — 9Router impersonates the upstream domain.
            </p>
            <div className="overflow-x-auto rounded border border-blue-200 dark:border-blue-800 mt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800">
                    <th className="text-left py-2 px-3 font-semibold">Tool</th>
                    <th className="text-left py-2 px-3 font-semibold">Intercepted domain</th>
                    <th className="text-left py-2 px-3 font-semibold">How to enable</th>
                  </tr>
                </thead>
                <tbody className="text-blue-800 dark:text-blue-200 divide-y divide-blue-100 dark:divide-blue-900/40">
                  <tr>
                    <td className="py-2 px-3 font-medium">Antigravity (Google Cloud Code)</td>
                    <td className="py-2 px-3 font-mono">daily-cloudcode-pa.googleapis.com</td>
                    <td className="py-2 px-3">Dashboard → CLI Tools → Antigravity</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-medium">GitHub Copilot</td>
                    <td className="py-2 px-3 font-mono">api.individual.githubcopilot.com</td>
                    <td className="py-2 px-3">Dashboard → CLI Tools → GitHub Copilot</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Callout type="warning">
              MITM mode requires installing a local CA certificate so your IDE trusts the intercepted TLS connection. Follow the on-screen instructions in the CLI Tools page.
            </Callout>
          </Section>

          {/* ── Token Refresh ──────────────────────────────────────────── */}
          <Section icon="autorenew" title="Token Refresh (OAuth providers)">
            <div className="space-y-2 text-blue-800 dark:text-blue-200">
              <p>9Router automatically refreshes OAuth access tokens <strong>before every request</strong> if they expire within 5 minutes.</p>
              <ul className="list-disc list-inside ml-2 space-y-1 text-xs">
                <li><strong>Access tokens</strong> — typically 1–8 hours; auto-refreshed silently.</li>
                <li><strong>Refresh tokens</strong> — 30–90 days depending on provider; must re-authenticate when expired.</li>
                <li><strong>GitHub Copilot token</strong> — separate short-lived token, also auto-refreshed.</li>
                <li><strong>Concurrent requests</strong> — only one upstream refresh fires per connection; others wait and share the result.</li>
              </ul>
              <Callout type="success">
                You won't be interrupted by token expiry during normal use. Re-login is only needed every few weeks/months.
              </Callout>
            </div>
          </Section>

          {/* ── Tunnel ──────────────────────────────────────────────────── */}
          <Section icon="cloud_upload" title="Cloudflare Tunnel (Remote Access)">
            <p className="text-blue-800 dark:text-blue-200 mb-2">
              Enable the tunnel to get a public HTTPS URL — required for Cursor and useful for sharing with teammates.
            </p>
            <ul className="list-disc list-inside ml-2 text-blue-800 dark:text-blue-200 text-xs space-y-1 mb-2">
              <li>No port forwarding, no static IP — uses Cloudflare's edge network.</li>
              <li>End-to-end TLS; URL format: <Code>https://&lt;id&gt;.trycloudflare.com/v1</Code></li>
              <li>Requires outbound port 7844 (TCP/UDP).</li>
              <li>Only <strong>admins</strong> can enable/disable the tunnel.</li>
            </ul>
            <Callout type="info">
              Once the tunnel is active, the endpoint URL at the top of this page updates automatically.
            </Callout>
          </Section>

          {/* ── Troubleshooting ─────────────────────────────────────────── */}
          <Section icon="help" title="Troubleshooting">
            <div className="space-y-2">
              <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3 border border-blue-100 dark:border-blue-900">
                <p className="font-semibold text-blue-900 dark:text-blue-100 text-xs mb-1">401 Unauthorized</p>
                <p className="text-blue-800 dark:text-blue-200 text-xs">Your <em>9Router</em> API key is missing or wrong. Check the <Code>Authorization: Bearer &lt;key&gt;</Code> header.</p>
              </div>
              <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3 border border-blue-100 dark:border-blue-900">
                <p className="font-semibold text-blue-900 dark:text-blue-100 text-xs mb-1">No credentials for provider</p>
                <p className="text-blue-800 dark:text-blue-200 text-xs">Go to <strong>Dashboard → Providers</strong> and add credentials for the provider in the model string.</p>
              </div>
              <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3 border border-blue-100 dark:border-blue-900">
                <p className="font-semibold text-blue-900 dark:text-blue-100 text-xs mb-1">Token expired / OAuth error</p>
                <p className="text-blue-800 dark:text-blue-200 text-xs">The refresh token has expired. Delete the connection in <strong>Providers</strong> and re-authenticate via OAuth.</p>
              </div>
              <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3 border border-blue-100 dark:border-blue-900">
                <p className="font-semibold text-blue-900 dark:text-blue-100 text-xs mb-1">All accounts rate limited</p>
                <p className="text-blue-800 dark:text-blue-200 text-xs">Add more accounts for the same provider. 9Router auto-rotates with exponential backoff.</p>
              </div>
              <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3 border border-blue-100 dark:border-blue-900">
                <p className="font-semibold text-blue-900 dark:text-blue-100 text-xs mb-1">Cursor can't connect (localhost refused)</p>
                <p className="text-blue-800 dark:text-blue-200 text-xs">Cursor routes through its cloud — enable the <strong>Cloudflare Tunnel</strong> first and paste the public URL into Cursor's settings.</p>
              </div>
              <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3 border border-blue-100 dark:border-blue-900">
                <p className="font-semibold text-blue-900 dark:text-blue-100 text-xs mb-1">OpenCode / Open Claw can't connect</p>
                <p className="text-blue-800 dark:text-blue-200 text-xs">Try replacing <Code>localhost</Code> with <Code>127.0.0.1</Code> — some systems default to IPv6 for localhost.</p>
              </div>
            </div>
          </Section>

        </div>
      )}
    </Card>
  );
}
