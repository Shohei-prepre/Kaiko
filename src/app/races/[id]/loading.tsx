/** レース詳細ページのローディング画面 */
export default function Loading() {
  return (
    <div className="min-h-screen bg-[#E7E7E7] flex flex-col items-center justify-center gap-3">
      <img src="/horse-run.gif" alt="読み込み中" width={120} height={120} />
      <p className="text-sm font-bold text-[var(--kaiko-text-muted)]">読み込み中...</p>
    </div>
  );
}
