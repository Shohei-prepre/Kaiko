"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "レース", icon: "format_list_bulleted", href: "/races" },
  { label: "サポート", icon: "local_activity", href: "/picks" },
  { label: "能力比較", icon: "analytics", href: "/compare" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#131313] border-t-0 h-20 pb-4 flex items-end">
      <div className="flex w-full">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-0.5 pt-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                isActive
                  ? "text-white"
                  : "text-[var(--kaiko-text-muted)]"
              }`}
            >
              <span
                className={`material-symbols-outlined text-[24px] ${isActive ? "[font-variation-settings:'FILL'_1]" : ""}`}
              >
                {tab.icon}
              </span>
              {tab.label}
              {isActive && (
                <span className="w-4 h-0.5 rounded-full bg-[var(--kaiko-primary)] mt-0.5" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
