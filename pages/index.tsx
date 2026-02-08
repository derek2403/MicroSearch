import { Geist, Geist_Mono } from "next/font/google";
import { useState, useEffect, FormEvent } from "react";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface AgentIdentity {
  standard: string;
  chain: string;
  contract: string;
  tokenId: string;
  profileUrl: string;
}

interface AgentInfo {
  name: string;
  description: string;
  pricing: { currency: string; amount: string; unit: string; network: string };
  agent_identity: AgentIdentity;
}

type Step = "idle" | "unpaid" | "paying" | "results" | "error";

export default function Home() {
  const [query, setQuery] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [challenge, setChallenge] = useState<Record<string, unknown> | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);

  // Fetch agent info on mount
  useEffect(() => {
    fetch("/api/agent")
      .then((r) => r.json())
      .then(setAgentInfo)
      .catch(() => {});
  }, []);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setStep("unpaid");
    setChallenge(null);
    setResults([]);
    setMeta(null);
    setError("");

    // Step 1: Unpaid request — show the 402 challenge
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (res.status === 402) {
        setChallenge(data);

        // Step 2: Auto-pay via demo endpoint
        setStep("paying");
        const paidRes = await fetch(
          `/api/demo-search?q=${encodeURIComponent(query)}`
        );
        const paidData = await paidRes.json();

        if (paidData.results) {
          setResults(paidData.results);
          setMeta({
            search_mode: paidData.search_mode,
            buyer: paidData._demo?.buyer,
            paymentSettled: paidData._demo?.paymentSettled,
            transaction: paidData._demo?.receipt?.transaction,
            payer: paidData.payment?.payer,
          });
          setStep("results");
        } else if (paidRes.status === 402) {
          setError(
            "Payment verification failed — your buyer wallet likely needs USDC on Base Sepolia. " +
            "Get testnet USDC from https://faucet.circle.com/"
          );
          setStep("error");
        } else {
          setError(paidData.error || paidData.message || "Payment failed");
          setStep("error");
        }
      } else if (res.ok) {
        setResults(data.results);
        setStep("results");
      } else {
        setError(data.error || `HTTP ${res.status}`);
        setStep("error");
      }
    } catch (err) {
      setError((err as Error).message);
      setStep("error");
    }
  }

  return (
    <div
      className={`${geistSans.className} ${geistMono.className} min-h-screen bg-zinc-50 dark:bg-zinc-950`}
    >
      <div className="mx-auto max-w-3xl px-6 py-12">
        {/* Header */}
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Microsearch
          </h1>
          <p className="mt-2 text-lg text-zinc-500 dark:text-zinc-400">
            Pay-per-query web search via{" "}
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              x402
            </span>{" "}
            micropayments
          </p>
        </header>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="mb-8 flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the web..."
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          <button
            type="submit"
            disabled={step === "paying"}
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {step === "paying" ? "Paying..." : "Search"}
          </button>
        </form>

        {/* Flow Steps */}
        {step !== "idle" && (
          <div className="mb-8 flex items-center gap-2 text-sm font-medium">
            <StepBadge
              label="1. Request"
              active={step === "unpaid"}
              done={step !== "unpaid"}
            />
            <Arrow />
            <StepBadge
              label="2. 402 Challenge"
              active={step === "unpaid"}
              done={["paying", "results", "error"].includes(step)}
            />
            <Arrow />
            <StepBadge
              label="3. Pay (x402)"
              active={step === "paying"}
              done={step === "results"}
            />
            <Arrow />
            <StepBadge
              label="4. Results"
              active={step === "results"}
              done={false}
            />
          </div>
        )}

        {/* 402 Challenge */}
        {challenge && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
            <h3 className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
              HTTP 402 — Payment Required
            </h3>
            <pre className="overflow-x-auto text-xs text-amber-900 dark:text-amber-200">
              {JSON.stringify(challenge, null, 2)}
            </pre>
          </div>
        )}

        {/* Payment in progress */}
        {step === "paying" && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-blue-300 bg-blue-50 p-4 dark:border-blue-700 dark:bg-blue-950/30">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <span className="text-sm text-blue-800 dark:text-blue-300">
              Signing EIP-3009 USDC authorization &amp; settling via x402
              facilitator...
            </span>
          </div>
        )}

        {/* Error */}
        {step === "error" && (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-950/30">
            <h3 className="mb-1 text-sm font-semibold text-red-800 dark:text-red-300">
              Error
            </h3>
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Payment Metadata */}
        {meta && step === "results" && (
          <div className="mb-4 rounded-lg border border-green-300 bg-green-50 p-4 dark:border-green-700 dark:bg-green-950/30">
            <h3 className="mb-2 text-sm font-semibold text-green-800 dark:text-green-300">
              Payment Settled
            </h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-green-800 dark:text-green-300">
              <span>Buyer:</span>
              <span className="font-mono truncate">
                {(meta.buyer as string) || "—"}
              </span>
              <span>Tx Hash:</span>
              <span className="font-mono truncate">
                {(meta.transaction as string) || "—"}
              </span>
              <span>Search Mode:</span>
              <span>{(meta.search_mode as string) || "—"}</span>
            </div>
          </div>
        )}

        {/* Search Results */}
        {results.length > 0 && (
          <div className="space-y-4">
            {results.map((r, i) => (
              <div
                key={i}
                className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base font-medium text-blue-700 hover:underline dark:text-blue-400"
                >
                  {r.title}
                </a>
                <p className="mt-0.5 truncate text-xs text-green-700 dark:text-green-500">
                  {r.url}
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {r.snippet}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Agent Identity Card */}
        {agentInfo && (
          <div className="mt-12 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Agent Identity (ERC-8004)
            </h2>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">Name</span>
              <span className="text-zinc-900 dark:text-zinc-100">
                {agentInfo.name}
              </span>

              <span className="text-zinc-500 dark:text-zinc-400">Chain</span>
              <span className="font-mono text-zinc-900 dark:text-zinc-100">
                {agentInfo.agent_identity.chain}
              </span>

              <span className="text-zinc-500 dark:text-zinc-400">Contract</span>
              <span className="font-mono text-xs text-zinc-900 dark:text-zinc-100 truncate">
                {agentInfo.agent_identity.contract}
              </span>

              <span className="text-zinc-500 dark:text-zinc-400">Token ID</span>
              <span className="font-mono text-zinc-900 dark:text-zinc-100">
                {agentInfo.agent_identity.tokenId}
              </span>

              <span className="text-zinc-500 dark:text-zinc-400">Price</span>
              <span className="text-zinc-900 dark:text-zinc-100">
                ${agentInfo.pricing.amount} {agentInfo.pricing.currency} /{" "}
                {agentInfo.pricing.unit}
              </span>

              <span className="text-zinc-500 dark:text-zinc-400">Network</span>
              <span className="font-mono text-zinc-900 dark:text-zinc-100">
                {agentInfo.pricing.network}
              </span>

              <span className="text-zinc-500 dark:text-zinc-400">Profile</span>
              <a
                href={agentInfo.agent_identity.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-blue-600 hover:underline dark:text-blue-400"
              >
                View on 8004scan.io
              </a>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 border-t border-zinc-200 pt-6 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
          x402 micropayments by Coinbase &middot; ERC-8004 agent identity &middot;
          Base Sepolia testnet
        </footer>
      </div>
    </div>
  );
}

function StepBadge({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  const base = "rounded-full px-3 py-1 text-xs transition-colors";
  if (active)
    return (
      <span className={`${base} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`}>
        {label}
      </span>
    );
  if (done)
    return (
      <span className={`${base} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`}>
        {label}
      </span>
    );
  return (
    <span className={`${base} bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500`}>
      {label}
    </span>
  );
}

function Arrow() {
  return <span className="text-zinc-300 dark:text-zinc-700">&rarr;</span>;
}
