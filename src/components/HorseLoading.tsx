"use client";

import { useState, useEffect } from "react";
import Lottie from "lottie-react";
import horseRunAnimation from "@/lib/horse-run.json";

interface Props {
  /** アニメーションの幅・高さ（px） */
  size?: number;
  /** テキストを非表示にする場合 true */
  hideText?: boolean;
}

/** 馬走りLottieローディングコンポーネント
 *  - マウント前（SSR・ハイドレーション前）はCSSスピナーを表示
 *  - マウント後にLottieアニメーションへ切り替え
 */
export default function HorseLoading({ size = 120, hideText = false }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const spinnerSize = Math.max(32, Math.round(size * 0.27));

  return (
    <div className="flex flex-col items-center justify-center gap-1 py-8">
      {mounted ? (
        <Lottie
          animationData={horseRunAnimation}
          loop
          autoplay
          style={{ width: size, height: size }}
        />
      ) : (
        /* JS未ロード時・初期レンダリング時のフォールバック */
        <div
          className="rounded-full border-2 border-black/10 border-t-[var(--kaiko-primary)] animate-spin"
          style={{ width: spinnerSize, height: spinnerSize }}
        />
      )}
      {!hideText && (
        <p className="text-sm text-[var(--kaiko-text-muted)]">読み込み中...</p>
      )}
    </div>
  );
}
