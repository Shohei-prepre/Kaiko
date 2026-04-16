"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

interface HeaderProps {
  showBack?: boolean;
  title?: string;
  rightContent?: React.ReactNode;
}

export default function Header({ showBack = false, title, rightContent }: HeaderProps) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-[var(--kaiko-outline-variant)] h-14 flex items-center px-4 gap-3">
      {showBack && (
        <button
          onClick={() => router.back()}
          className="text-[var(--kaiko-on-surface)] -ml-1"
          aria-label="戻る"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
      )}
      {title && (
        <span className="text-[var(--kaiko-on-surface)] font-bold text-base">
          {title}
        </span>
      )}
      <Link
        href="/"
        className={`font-[family-name:var(--font-noto-sans-jp)] font-black italic text-[var(--kaiko-primary)] text-lg leading-none ${title ? "ml-auto" : ""}`}
      >
        回顧AI
      </Link>
      {rightContent && <div className="ml-auto">{rightContent}</div>}
    </header>
  );
}
