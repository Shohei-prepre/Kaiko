import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";

export default function ComparePage() {
  return (
    <>
      <Header
        title="能力比較"
        rightContent={
          <span className="font-[family-name:var(--font-noto-sans-jp)] font-black italic text-[var(--kaiko-primary)] text-lg">
            回顧AI
          </span>
        }
      />
      <main className="flex-1 bg-[var(--kaiko-surface)] pb-20">
        <div className="p-4">
          <p className="text-[var(--kaiko-text-sub)] text-sm">比較画面（実装予定）</p>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
