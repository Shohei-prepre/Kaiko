import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function HorsePage({ params }: Props) {
  const { id } = await params;

  return (
    <>
      <Header showBack />
      <main className="flex-1 bg-[var(--kaiko-surface-detail)] pb-20">
        <div className="p-4">
          <p className="text-[var(--kaiko-text-sub)] text-sm">馬ページ ID: {id}（実装予定）</p>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
