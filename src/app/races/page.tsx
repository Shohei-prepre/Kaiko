import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";

export default function RacesPage() {
  return (
    <>
      <Header />
      <main className="flex-1 bg-[var(--kaiko-surface-detail)] pb-20">
        <div className="p-4">
          <p className="text-[var(--kaiko-text-sub)] text-sm">レース一覧（実装予定）</p>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
