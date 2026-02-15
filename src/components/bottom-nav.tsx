"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const tabs = [
  {
    label: "Home",
    href: "/",
    activeIcon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="#3B82F6" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path d="M9 22V12h6v10" fill="white" stroke="#3B82F6" />
      </svg>
    ),
    inactiveIcon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    label: "Calendar",
    href: "/calendar",
    activeIcon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="#3B82F6" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" stroke="white" />
        <line x1="8" y1="2" x2="8" y2="6" stroke="white" />
        <line x1="3" y1="10" x2="21" y2="10" stroke="white" />
      </svg>
    ),
    inactiveIcon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    label: "Budget",
    href: "/budget",
    activeIcon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" fill="#3B82F6" stroke="#3B82F6" />
        <line x1="12" y1="6" x2="12" y2="18" stroke="white" strokeWidth="2" />
        <path d="M15 9.5H10.5a2 2 0 0 0 0 4h3a2 2 0 0 1 0 4H9" stroke="white" strokeWidth="1.5" />
      </svg>
    ),
    inactiveIcon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  if (pathname === "/login") return null;

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200/60 bg-white/70 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg items-center justify-around">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`tab-press flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-wide ${
                active ? "text-blue-600" : "text-slate-400"
              }`}
            >
              {active ? tab.activeIcon : tab.inactiveIcon}
              <span>{tab.label}</span>
            </Link>
          );
        })}
        <button
          onClick={handleSignOut}
          className="tab-press flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-wide text-slate-400"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Sign Out</span>
        </button>
      </div>
    </nav>
  );
}
