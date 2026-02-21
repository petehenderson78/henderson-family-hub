"use client";

import { useEffect, useState, useCallback } from "react";
import { usePlaidLink } from "react-plaid-link";
import { createClient } from "@/lib/supabase/client";

interface PlaidItem {
  id: string;
  institution_name: string | null;
  created_at: string;
}

export default function LinkBankAccount() {
  const supabase = createClient();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState<PlaidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLinkedAccounts = useCallback(async () => {
    const { data } = await supabase
      .from("plaid_items")
      .select("id, institution_name, created_at")
      .order("created_at", { ascending: false });
    setLinkedAccounts(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchLinkedAccounts();
  }, [fetchLinkedAccounts]);

  async function createLinkToken() {
    setError(null);
    try {
      const res = await fetch("/api/plaid/create-link-token", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create link token");
        return;
      }
      setLinkToken(data.link_token);
    } catch {
      setError("Failed to connect to Plaid");
    }
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Linked Accounts
        </h3>
        <button
          onClick={createLinkToken}
          className="min-h-[44px] rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 text-sm font-semibold text-white shadow-md shadow-blue-500/20 active:scale-[0.97]"
        >
          + Link Bank Account
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-sm text-amber-800">{error}</p>
        </div>
      )}

      {loading ? (
        <p className="py-4 text-center text-sm text-slate-400">Loading...</p>
      ) : linkedAccounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white/50 py-6 text-center">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto mb-2 text-slate-300"
          >
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
          <p className="text-sm text-slate-400">No bank accounts linked</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {linkedAccounts.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="flex-shrink-0 text-emerald-500"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span className="text-sm font-medium text-slate-700">
                {item.institution_name ?? "Bank Account"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {linkToken && (
        <PlaidLinkModal
          linkToken={linkToken}
          onSuccess={() => {
            setLinkToken(null);
            fetchLinkedAccounts();
          }}
          onExit={() => setLinkToken(null)}
        />
      )}
    </div>
  );
}

function PlaidLinkModal({
  linkToken,
  onSuccess,
  onExit,
}: {
  linkToken: string;
  onSuccess: () => void;
  onExit: () => void;
}) {
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken, metadata) => {
      await fetch("/api/plaid/exchange-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_token: publicToken,
          institution_name: metadata.institution?.name ?? null,
        }),
      });
      onSuccess();
    },
    onExit: () => onExit(),
  });

  useEffect(() => {
    if (ready) open();
  }, [ready, open]);

  return null;
}
