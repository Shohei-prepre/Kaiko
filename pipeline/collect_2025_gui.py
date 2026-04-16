"""
collect_2025_gui.py — 2025年レース結果 一括収集 GUI

tkinter 製の小窓。pipeline_results.py の関数を利用して
2025-01-01〜2025-11-20 のレース結果を Supabase に投入する。

起動方法:
  cd pipeline
  python collect_2025_gui.py

チェックポイントファイル collect_progress.json に完了済み race_id を記録し、
途中で停止しても再起動すれば続きから再開できる。
"""

from __future__ import annotations

import json
import os
import queue
import threading
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import ttk, messagebox

from dotenv import load_dotenv
from supabase import create_client, Client

# pipeline_results.py の関数を再利用
from pipeline_results import (
    fetch_race_ids_for_date,
    dates_in_range,
    process_race,
)

# ── 定数 ──────────────────────────────────────────────────────────────────

DEFAULT_FROM = "2025-01-01"
DEFAULT_TO   = "2025-11-20"

# チェックポイントファイルのパス（スクリプトと同じディレクトリ）
PROGRESS_FILE = Path(__file__).parent / "collect_progress.json"

# ── チェックポイント入出力 ─────────────────────────────────────────────────

def load_progress() -> dict:
    """collect_progress.json を読み込む。なければ空の状態を返す"""
    if PROGRESS_FILE.exists():
        try:
            with open(PROGRESS_FILE, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"completed_race_ids": [], "skipped_dates": []}


def save_progress(progress: dict) -> None:
    """collect_progress.json に書き込む"""
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)


# ── メッセージ種別（キュー通信用） ────────────────────────────────────────

MSG_LOG      = "log"       # ログテキスト追記
MSG_PROGRESS = "progress"  # 進捗更新 (day_idx, total_days, ok, ng, skip)
MSG_DATE     = "date"      # 現在処理中の日付テキスト
MSG_DONE     = "done"      # 全処理完了


# ── ワーカースレッド ──────────────────────────────────────────────────────

def worker(
    date_from: str,
    date_to: str,
    supabase: Client,
    stop_event: threading.Event,
    msg_queue: "queue.Queue[tuple]",
) -> None:
    """
    バックグラウンドで日付範囲のレース結果を収集して DB に投入する。
    進捗・ログは msg_queue 経由でメインスレッドに通知する。
    """
    progress = load_progress()
    completed_ids: set[str] = set(progress.get("completed_race_ids", []))
    skipped_dates: set[str] = set(progress.get("skipped_dates", []))

    all_dates = dates_in_range(date_from, date_to)
    total_days = len(all_dates)

    ok = 0
    ng = 0
    skip = len(completed_ids)  # 起動時点での完了数をスキップとして表示

    def log(text: str) -> None:
        msg_queue.put((MSG_LOG, text))

    log(f"収集開始: {date_from} 〜 {date_to}（全 {total_days} 日）")
    log(f"チェックポイント: 完了済み {len(completed_ids)} レース / スキップ済み日付 {len(skipped_dates)} 日")

    for day_idx, target_date in enumerate(all_dates, start=1):
        if stop_event.is_set():
            log("⏹ 停止しました")
            break

        msg_queue.put((MSG_DATE, f"日付: {target_date}  ({day_idx}/{total_days} 日目)"))
        msg_queue.put((MSG_PROGRESS, day_idx, total_days, ok, ng, skip))

        # 開催なし日はスキップ
        if target_date in skipped_dates:
            log(f"[{target_date}] スキップ（前回記録済み）")
            continue

        # その日の race_id 一覧取得
        try:
            race_ids = fetch_race_ids_for_date(target_date)
        except Exception as e:
            log(f"[{target_date}] ❌ レースID取得失敗: {e}")
            continue

        if not race_ids:
            # 開催なし → 次回以降スキップするよう記録
            skipped_dates.add(target_date)
            progress["skipped_dates"] = list(skipped_dates)
            save_progress(progress)
            continue

        log(f"[{target_date}] {len(race_ids)} レース検出")

        for race_id in race_ids:
            if stop_event.is_set():
                break

            # 完了済みならスキップ
            if race_id in completed_ids:
                skip += 1
                log(f"  [{race_id}] スキップ（完了済み）")
                msg_queue.put((MSG_PROGRESS, day_idx, total_days, ok, ng, skip))
                continue

            try:
                success = process_race(race_id, supabase)
                if success:
                    ok += 1
                    completed_ids.add(race_id)
                    progress["completed_race_ids"] = list(completed_ids)
                    save_progress(progress)
                    log(f"  [{race_id}] ✅ 完了")
                else:
                    ng += 1
                    log(f"  [{race_id}] ❌ 失敗（スクレイピングエラー）")
            except Exception as e:
                ng += 1
                log(f"  [{race_id}] ❌ 例外: {e}")

            msg_queue.put((MSG_PROGRESS, day_idx, total_days, ok, ng, skip))

    msg_queue.put((MSG_PROGRESS, total_days, total_days, ok, ng, skip))
    msg_queue.put((MSG_DONE, ok, ng, skip))


# ── GUI クラス ─────────────────────────────────────────────────────────────

class CollectApp:
    """2025年レース結果 一括収集 GUI アプリ"""

    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("2025 レース結果 一括収集")
        self.root.resizable(False, False)

        self._stop_event = threading.Event()
        self._worker_thread: threading.Thread | None = None
        self._queue: queue.Queue = queue.Queue()
        self._supabase: Client | None = None

        self._build_ui()
        self._load_env()
        self._restore_progress_display()

    # ── UI 構築 ────────────────────────────────────────────────────────────

    def _build_ui(self) -> None:
        """ウィジェットを配置する"""
        PAD = 10

        # ── ヘッダー ──
        header = tk.Frame(self.root, bg="#1a1a2e", padx=PAD, pady=6)
        header.pack(fill=tk.X)
        tk.Label(
            header,
            text="2025 レース結果 一括収集",
            font=("Helvetica", 14, "bold"),
            bg="#1a1a2e",
            fg="white",
        ).pack(anchor=tk.W)

        # ── 日付範囲 ──
        date_frame = tk.Frame(self.root, padx=PAD, pady=6)
        date_frame.pack(fill=tk.X)

        tk.Label(date_frame, text="開始日:").grid(row=0, column=0, sticky=tk.W)
        self._var_from = tk.StringVar(value=DEFAULT_FROM)
        tk.Entry(date_frame, textvariable=self._var_from, width=12).grid(row=0, column=1, padx=4)

        tk.Label(date_frame, text="終了日:").grid(row=0, column=2, sticky=tk.W, padx=(10, 0))
        self._var_to = tk.StringVar(value=DEFAULT_TO)
        tk.Entry(date_frame, textvariable=self._var_to, width=12).grid(row=0, column=3, padx=4)

        # ── ボタン ──
        btn_frame = tk.Frame(self.root, padx=PAD, pady=4)
        btn_frame.pack(fill=tk.X)

        self._btn_start = tk.Button(
            btn_frame,
            text="▶ 開始",
            bg="#4CAF50",
            fg="white",
            font=("Helvetica", 11, "bold"),
            width=10,
            command=self._on_start,
        )
        self._btn_start.pack(side=tk.LEFT, padx=(0, 6))

        self._btn_stop = tk.Button(
            btn_frame,
            text="■ 停止",
            bg="#f44336",
            fg="white",
            font=("Helvetica", 11, "bold"),
            width=10,
            state=tk.DISABLED,
            command=self._on_stop,
        )
        self._btn_stop.pack(side=tk.LEFT)

        self._btn_reset = tk.Button(
            btn_frame,
            text="🔄 進捗リセット",
            bg="#9e9e9e",
            fg="white",
            font=("Helvetica", 10),
            width=14,
            command=self._on_reset,
        )
        self._btn_reset.pack(side=tk.RIGHT)

        ttk.Separator(self.root, orient=tk.HORIZONTAL).pack(fill=tk.X, padx=PAD)

        # ── 進捗ラベル ──
        info_frame = tk.Frame(self.root, padx=PAD, pady=4)
        info_frame.pack(fill=tk.X)

        self._lbl_date = tk.Label(info_frame, text="待機中", font=("Helvetica", 10), anchor=tk.W)
        self._lbl_date.pack(fill=tk.X)

        self._progressbar = ttk.Progressbar(self.root, orient=tk.HORIZONTAL, length=560, mode="determinate")
        self._progressbar.pack(padx=PAD, pady=2)

        stat_frame = tk.Frame(self.root, padx=PAD)
        stat_frame.pack(fill=tk.X)

        self._lbl_ok   = tk.Label(stat_frame, text="成功: 0",   fg="#2e7d32", font=("Helvetica", 10, "bold"))
        self._lbl_ok.pack(side=tk.LEFT, padx=(0, 12))
        self._lbl_ng   = tk.Label(stat_frame, text="失敗: 0",   fg="#c62828", font=("Helvetica", 10, "bold"))
        self._lbl_ng.pack(side=tk.LEFT, padx=(0, 12))
        self._lbl_skip = tk.Label(stat_frame, text="スキップ: 0", fg="#555", font=("Helvetica", 10))
        self._lbl_skip.pack(side=tk.LEFT)

        ttk.Separator(self.root, orient=tk.HORIZONTAL).pack(fill=tk.X, padx=PAD, pady=4)

        # ── ログエリア ──
        log_frame = tk.Frame(self.root, padx=PAD, pady=4)
        log_frame.pack(fill=tk.BOTH, expand=True)

        scrollbar = tk.Scrollbar(log_frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        self._log_text = tk.Text(
            log_frame,
            height=16,
            width=70,
            font=("Courier", 9),
            state=tk.DISABLED,
            yscrollcommand=scrollbar.set,
            bg="white",
            fg="#131313",
            selectbackground="#264f78",
        )
        self._log_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.config(command=self._log_text.yview)

        self.root.geometry("600x560")

    # ── 初期化 ─────────────────────────────────────────────────────────────

    def _load_env(self) -> None:
        """環境変数を読み込み Supabase クライアントを作成する"""
        load_dotenv()
        url  = os.environ.get("SUPABASE_URL")
        key  = os.environ.get("SUPABASE_SERVICE_KEY")
        if not url or not key:
            self._append_log("❌ .env に SUPABASE_URL と SUPABASE_SERVICE_KEY を設定してください")
            self._btn_start.config(state=tk.DISABLED)
            return
        try:
            self._supabase = create_client(url, key)
            self._append_log("✅ Supabase 接続準備完了")
        except Exception as e:
            self._append_log(f"❌ Supabase 接続失敗: {e}")
            self._btn_start.config(state=tk.DISABLED)

    def _restore_progress_display(self) -> None:
        """前回の進捗ファイルがあれば件数をラベルに反映する"""
        progress = load_progress()
        completed = len(progress.get("completed_race_ids", []))
        if completed > 0:
            self._lbl_skip.config(text=f"スキップ: {completed}")
            self._append_log(f"📂 チェックポイント読み込み済み: {completed} レース完了済み")

    # ── イベントハンドラ ───────────────────────────────────────────────────

    def _on_start(self) -> None:
        """開始ボタン押下"""
        if self._worker_thread and self._worker_thread.is_alive():
            return

        date_from = self._var_from.get().strip()
        date_to   = self._var_to.get().strip()

        # 簡易バリデーション
        try:
            datetime.fromisoformat(date_from)
            datetime.fromisoformat(date_to)
        except ValueError:
            messagebox.showerror("入力エラー", "日付は YYYY-MM-DD 形式で入力してください")
            return

        if date_from > date_to:
            messagebox.showerror("入力エラー", "開始日が終了日より後になっています")
            return

        if self._supabase is None:
            messagebox.showerror("接続エラー", ".env を確認してください")
            return

        self._stop_event.clear()
        self._btn_start.config(state=tk.DISABLED)
        self._btn_stop.config(state=tk.NORMAL)

        self._worker_thread = threading.Thread(
            target=worker,
            args=(date_from, date_to, self._supabase, self._stop_event, self._queue),
            daemon=True,
        )
        self._worker_thread.start()
        self._poll_queue()

    def _on_stop(self) -> None:
        """停止ボタン押下"""
        self._stop_event.set()
        self._btn_stop.config(state=tk.DISABLED)
        self._append_log("⏹ 停止リクエスト送信（現在のレース処理後に停止します）")

    def _on_reset(self) -> None:
        """進捗リセット（チェックポイントファイルを削除）"""
        if self._worker_thread and self._worker_thread.is_alive():
            messagebox.showwarning("警告", "処理中はリセットできません。先に停止してください。")
            return
        if not messagebox.askyesno("確認", "進捗をリセットしますか？\n（collect_progress.json が削除されます）"):
            return
        if PROGRESS_FILE.exists():
            PROGRESS_FILE.unlink()
        self._lbl_ok.config(text="成功: 0")
        self._lbl_ng.config(text="失敗: 0")
        self._lbl_skip.config(text="スキップ: 0")
        self._lbl_date.config(text="待機中")
        self._progressbar["value"] = 0
        self._append_log("🔄 進捗リセット完了")

    # ── キューポーリング（メインスレッドで UI を更新） ─────────────────────

    def _poll_queue(self) -> None:
        """200ms ごとにキューを確認して UI を更新する"""
        try:
            while True:
                msg = self._queue.get_nowait()
                self._handle_message(msg)
        except queue.Empty:
            pass

        # ワーカーが生きていればポーリング継続
        if self._worker_thread and self._worker_thread.is_alive():
            self.root.after(200, self._poll_queue)
        elif self._stop_event.is_set():
            # ユーザーが停止 → ボタン状態を戻す
            self._btn_start.config(state=tk.NORMAL)
            self._btn_stop.config(state=tk.DISABLED)
        else:
            # 予期しないスレッド終了（例外クラッシュ等）→ 5秒後に自動再起動
            self._append_log("⚠️ スレッドが予期せず終了しました。5秒後に自動再起動します...")
            self.root.after(5000, self._auto_restart)

    def _auto_restart(self) -> None:
        """クラッシュ後の自動再起動"""
        if self._stop_event.is_set():
            self._btn_start.config(state=tk.NORMAL)
            self._btn_stop.config(state=tk.DISABLED)
            return
        self._append_log("🔄 自動再起動中...")
        self._on_start()

    def _handle_message(self, msg: tuple) -> None:
        """キューから受け取ったメッセージを処理する"""
        kind = msg[0]

        if kind == MSG_LOG:
            self._append_log(msg[1])

        elif kind == MSG_PROGRESS:
            _, day_idx, total_days, ok, ng, skip = msg
            pct = int(day_idx / total_days * 100) if total_days > 0 else 0
            self._progressbar["value"] = pct
            self._lbl_ok.config(text=f"成功: {ok}")
            self._lbl_ng.config(text=f"失敗: {ng}")
            self._lbl_skip.config(text=f"スキップ: {skip}")

        elif kind == MSG_DATE:
            self._lbl_date.config(text=msg[1])

        elif kind == MSG_DONE:
            _, ok, ng, skip = msg
            self._lbl_date.config(text="完了")
            self._progressbar["value"] = 100
            self._lbl_ok.config(text=f"成功: {ok}")
            self._lbl_ng.config(text=f"失敗: {ng}")
            self._lbl_skip.config(text=f"スキップ: {skip}")
            self._append_log(f"\n{'='*50}")
            self._append_log(f"🏁 全処理完了: 成功 {ok} / 失敗 {ng} / スキップ {skip}")

    def _append_log(self, text: str) -> None:
        """ログエリアにテキストを追記してスクロールを末尾に移動する"""
        self._log_text.config(state=tk.NORMAL)
        ts = datetime.now().strftime("%H:%M:%S")
        self._log_text.insert(tk.END, f"[{ts}] {text}\n")
        self._log_text.see(tk.END)
        self._log_text.config(state=tk.DISABLED)


# ── エントリポイント ──────────────────────────────────────────────────────

def main() -> None:
    root = tk.Tk()
    app = CollectApp(root)  # noqa: F841
    root.mainloop()


if __name__ == "__main__":
    main()
