"use client";

import { useRouter } from "next/navigation";

export default function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        // 履歴がある場合は戻る、なければトップへ
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push("/races");
        }
      }}
      className="w-8 h-8 rounded-2xl border border-white/20 bg-white/10 flex items-center justify-center active:scale-95 duration-150"
    >
      <span className="material-symbols-outlined text-white text-[18px] font-bold">
        arrow_back_ios_new
      </span>
    </button>
  );
}
