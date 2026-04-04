# KAIKO　08. フロントエンド設計

ver 1.3　|　2026年3月

> **変更点（v1.2 → v1.3）**: 比較画面の補正項目をDBカラムと対応させ確定。物差し馬ロジックに直近5走・disregard除外を追記。馬カードの年齢バッジを削除。競馬場カードの英語名を削除。

---

## 1. 設計の前提

| ファイル名 | 概要 |
| --- | --- |
| kaiko_race_detail_stitch_v1.html | レース詳細画面（確定済み） |
| kaiko_compare_stitch_v1.html | 比較画面（ワイヤー段階。補正項目はDBに合わせて今後調整） |
| kaiko_racelist_stitch_v1.html | レース一覧画面（確定済み） |

> ※ 比較画面はワイヤー段階。表示する補正項目名・数値はDBのhorse_performancesカラムに合わせて実装時に更新する。

| 項目 | 内容 |
| --- | --- |
| フレームワーク | Next.js 15 + TypeScript（App Router） |
| スタイリング | Tailwind CSS + tailwind.config カスタムトークン |
| UIライブラリ | shadcn/ui（必要最小限） |
| アイコン | Material Symbols Outlined（Google Fonts経由） |
| 状態管理 | Zustand + TanStack Query |
| デザイン生成 | Google Stitch（Gemini 3.1 Pro）+ Figma（補助） |

---

## 2. デザインシステム（Tailwind Config）

レース詳細・比較の両画面から抽出したトークンをマージした確定版。実装時はこのconfigをそのまま使用する。

### 2-1. カラートークン

> ※ レース詳細画面（v1）と比較画面（v1）でトークン体系が一部異なる。比較画面はMaterial Designライクな命名（on-surface等）を採用。両画面のconfigをマージして統一する。

| トークン名 | 値 | 初出画面 | 用途 |
| --- | --- | --- | --- |
| primary | #0055e5 | 両画面共通 | メインアクセント・リンク・アクティブ状態 |
| primary-container | #eef4ff | 比較画面 | primaryの薄背景（優勢バッジ等） |
| surface | #f8f9fb（比較）/#f2f4f7（詳細） | 両画面 | ページ背景。比較画面は若干明るい |
| surface-container-low | #f3f4f6 | 比較画面 | テーブルヘッダー・馬ラベル背景 |
| surface-container-lowest | #ffffff | 比較画面 | 最前面の白（カード内セル） |
| on-surface | #191c1e | 比較画面 | メインテキスト（詳細のtext-main相当） |
| on-surface-variant | #5e636e | 比較画面 | サブテキスト・ラベル（詳細のtext-sub相当） |
| outline-variant | #e8eaed | 比較画面 | ボーダー（詳細のborderと同値） |
| text-main | #0f1115 | 詳細画面 | on-surfaceに統合予定 |
| text-sub | #4a5568 | 詳細画面 | on-surface-variantに統合予定 |
| text-muted | #8a94a6 | 詳細画面 | 補足・Rajdhaniラベル |
| sym-great / sym-good / sym-fair / sym-bad | 各色 | 詳細画面 | ◎○△× 評価記号の色（比較画面は未適用） |

### 2-2. 補正値カラー（比較画面固有）

統合評価・レース別タブ内の補正値数値に使用。

| 状態 | クラス | 意味 |
| --- | --- | --- |
| プラス（馬A有利） | text-emerald-600 | A>B方向の補正値 |
| マイナス（馬B有利） | text-red-500 | B>A方向の補正値 |
| ゼロ・中立 | text-gray-400 | 補正なし（0.0） |

### 2-3. 評価タグカラー（詳細画面）

> ※ 比較画面には評価タグは未実装。詳細画面のみ。

| タグ | クラス | 意味 |
| --- | --- | --- |
| 実力通り | eval-neutral-bg / eval-neutral-text | 条件・ロスが相殺。純粋な能力が出た |
| 実力以下 | eval-positive-bg / eval-positive-text | 条件・ロスで損。次走買い候補 |
| 実力以上 | eval-warning-bg / eval-warning-text | 条件・ロスに恵まれた。額面通りに取れない |
| 度外視 | eval-disregard-bg / eval-disregard-text | 参考外。次走評価に含めない |

### 2-4. 枠番カラー（JRA準拠・詳細画面）

| 枠 | 色 | 枠 | 色 | 枠 | 色 |
| --- | --- | --- | --- | --- | --- |
| waku-1（1枠） | #ffffff | waku-2（2枠） | #e2e8f0 | waku-3（3枠） | #fee2e2 |
| waku-4（4枠） | #dbeafe | waku-5（5枠） | #fef9c3 | waku-6（6枠） | #dcfce7 |
| waku-7（7枠） | #ffedd5 | waku-8（8枠） | #fce7f3 | | |

### 2-5. フォント

| 用途 | フォント | 主な使用箇所 |
| --- | --- | --- |
| 本文・馬名 | Noto Sans JP（400/500/700） | body全般・馬名・コメント文 |
| ラベル・バッジ・ナビ（詳細） | Rajdhani（600/700） | セクションラベル・評価タグ・BottomNav文字 |
| 大きい数値（比較） | Bebas Neue | 推定能力差・補正値・着差数値 |
| ロゴ | Noto Sans JP 900 / text-primary italic | ヘッダー「回顧AI」 |
| アイコン | Material Symbols Outlined | ナビアイコン・インラインアイコン全般 |

### 2-6. border-radius（比較画面で拡張）

| Tailwindクラス | 値 | 主な使用箇所 |
| --- | --- | --- |
| rounded（DEFAULT） | 4px | 枠番バッジ・細かいチップ |
| rounded-lg | 8px | 物差し馬セレクター内ボタン |
| rounded-xl | 12px | カード（詳細画面・比較画面共通） |
| rounded-2xl | 16px | 比較画面のサマリー・タブコンテンツ・CTAボタン |
| rounded-full | 9999px | VSバッジ・タブ・変更ボタン・優勢バッジ |

### 2-7. 共通コンポーネント仕様

| コンポーネント | 初出画面 | スタイル仕様 |
| --- | --- | --- |
| ヘッダー（sticky） | 両画面 | h-14〜16 bg-white border-b。詳細：ロゴ左寄せ。比較：タイトル左＋ロゴ右 |
| カード | 両画面 | bg-white / card-border（1px #e8eaed）/ rounded-xl / shadow-sm |
| カード（上部アクセント） | 詳細 | カード上辺に h-1 bg-primary のバー |
| サマリーカード（上部バー薄） | 比較 | absolute top-0 w-full h-1 bg-primary/10 |
| セクションヘッダー | 詳細 | Rajdhani text-[12px] font-black uppercase + material-symbols-outlined text-primary |
| テーブルヘッダー行 | 比較 | bg-surface-container-low / font-bold text-[12px] uppercase tracking-wider text-on-surface-variant |
| タブ（ピル型） | 比較 | flex bg-gray-200/40 p-1 rounded-full。アクティブ：bg-primary text-white rounded-full shadow-md |
| VSバッジ | 比較 | bg-[#2c313a] text-white w-9 h-9 rounded-full italic border-[3px] border-surface shadow-md。2カードの中央にabsolute配置 |
| 優勢バッジ | 比較 | inline-flex bg-primary-container px-6 py-2.5 rounded-full。auto_awesomeアイコン付き |
| 物差し馬セレクター | 比較 | bg-[#f8f9fa] card-border rounded-xl。馬名は bg-white border rounded-lg + expand_moreアイコン |
| 変更ボタン | 比較 | border border-outline-variant rounded-full text-[10px] font-bold + swap_horizアイコン |
| 補正値グリッド | 比較 | grid grid-cols-2 gap-px。各セルbg-white p-4。値はfont-bebas text-xl |
| 補正合計行 | 比較 | flex justify-between p-5 bg-primary/5。値はfont-bebas text-3xl text-primary |
| CTAボタン（詳細） | 詳細 | bg-primary text-white py-4 rounded-xl shadow-lg + arrow_forwardアイコン |
| CTAボタン（比較） | 比較 | bg-on-surface text-white py-4 rounded-2xl shadow-lg + arrow_forwardアイコン |
| BottomNav | 両画面 | fixed bottom-0 bg-white border-t h-20 pb-4。アクティブ：text-primary FILL=1 + w-2 h-2 bg-primary rounded-full（右上ドット） |

---

## 3. 画面一覧とルーティング（App Router）

| 画面名 | パス | 概要 |
| --- | --- | --- |
| レース一覧 | /races | 週末レース一覧・週の切り替え・競馬場別表示（BottomNavの起点） |
| レース詳細 | /races/[id] | 出走馬・展開・回顧・評価タグ表示（Stitch v1確定） |
| 馬ページ | /horses/[id] | 出走歴・個別回顧（タブなし・スタック遷移のみ） |
| 比較ページ | /compare | 馬A vs 馬B・物差し馬経由能力差（Stitch v1ワイヤー） |

BottomNavは2タブ構成（ホームタブは廃止）。馬ページはBottomNavに現れず、レース詳細・比較画面からのスタック遷移のみ。

---

## 4. BottomNavigation仕様

| タブ | アイコン | パス | アクティブ判定 |
| --- | --- | --- | --- |
| レース | format_list_bulleted | /races | pathname.startsWith('/races') |
| 能力比較 | analytics | /compare | pathname.startsWith('/compare') |

アクティブ状態：text-primary + border-b-2 border-primary（アンダーライン）。非アクティブ：text-on-surface-variant opacity-60。

---

## 5. レース一覧画面（/races）

参照ファイル：kaiko_racelist_stitch_v1.html（確定版）

BottomNavの「レース」タブをタップした際に表示されるトップ画面。今週末・来週末の出走予定レースを確認し予想に使うことがメインのユースケース。

### 5-1. セクション構成

| No. | セクション | 内容・仕様 |
| --- | --- | --- |
| 1 | ヘッダー（sticky） | 「回顧AI」ロゴ（左）+ 「ほかの週を見る」ボタン + calendar_monthアイコン（右） |
| 2 | 週セレクター | 来週 / 今週（デフォルト）の2タブ。アンダーライン型（border-b-2 border-primary）。各タブに日付範囲を小さく表示 |
| 3 | 曜日ピルタブ | 「土曜日」「日曜日」のピル型タブ（rounded-full）。アクティブ：bg-primary text-white |
| 4 | 競馬場カード（横スクロール） | overflow-x-auto snap-x。各カードmin-w-[290px]。競馬場名（大）+ 開催回次 + 主要レース3〜4件 + 全件表示ボタン |
| 5 | お知らせセクション | サービスのアップデート・メンテナンス情報。日付＋タイプバッジ＋テキスト |

### 5-2. 週セレクターの仕様

| 状態 | スタイル |
| --- | --- |
| アクティブ（今週） | border-b-2 border-primary / text-primary。英語ラベル（This Week）+ 日本語 + 日付範囲 |
| 非アクティブ（来週） | text-on-surface-variant opacity-60。同構成のラベル |
| 「ほかの週を見る」 | 右上ボタン。calendar_monthアイコン付き。タップで週選択モーダル表示 |

### 5-3. 競馬場カードの仕様

横スクロール（overflow-x-auto snap-x snap-center）で競馬場を並べる。1カードあたり min-w-[290px]。

| 要素 | 仕様 |
| --- | --- |
| カードヘッダー | 競馬場名（text-xl font-black）+ 開催回次バッジ（bg-surface-container-high） |
| メインレース行 | レース番号バッジ（bg-on-surface text-white w-9 h-9）+ グレードバッジ + レース名 + 距離/芝ダート |
| 通常レース行 | レース番号バッジ（bg-surface-container-highest）+ レース名 + 距離/芝ダート。opacity-90 |
| グレードバッジ | G1：bg-[#f59e0b] text-white。G3：bg-on-surface-variant text-white。OP：border border-outline text-on-surface-variant |
| 全件ボタン | 「View all 12 Races」bg-surface-container-low text-primary technical-label uppercase tracking-widest。border-t border-outline-variant |

### 5-4. border-radius固有設定

> ※ レース一覧画面のみ DEFAULT: 0px（シャープコーナー）。他画面のrounded-xl等は適用されないため、実装時に画面ごとの設定を分けること。

### 5-5. 週選択モーダルの仕様

「ほかの週を見る」タップでボトムシート表示。月ごとにグループ化した週一覧を表示。選択中の週はチェックマーク付きでハイライト。タップで選択・モーダルを閉じてリストを更新。

---

## 6. レース詳細画面（/races/[id]）

参照ファイル：kaiko_race_detail_stitch_v1.html（確定版）

### 6-1. セクション構成

| No. | セクション | 内容・仕様 |
| --- | --- | --- |
| 1 | ヘッダー（sticky） | 戻るボタン + 「回顧AI」ロゴ（italic blue）+ レース名・開催情報（右寄せ） |
| 2 | レース概要カード | 上部 h-1 bg-primary バー / レース名（text-3xl font-black）/ バッジ / 競馬場・日付 |
| 3 | 情報グリッド（2列） | Pace / Track Bias + 展開サマリー（col-span-2）。Rajdhaniラベル |
| 4 | ラップタイム | 棒グラフ（通常=bg-primary/20、加速=bg-amber-500/60）+ 前後半タイム |
| 5 | 出走馬リスト | 全頭。4列グリッド。タップで詳細展開（補正値2セル + コメント） |
| 6 | CTAボタン | 「Add horse to comparison」bg-primary text-white Rajdhani uppercase shadow-lg |

### 6-2. 出走馬行の評価ブロック

| 段 | 要素 | スタイル |
| --- | --- | --- |
| 1段目 | 能力記号（大）+ 適性/ロスチップ | 記号：text-[16px] font-black。チップ：bg-white border rounded-md px-1 py-0.5 |
| 2段目 | 評価タグ | rounded-full text-[9px] font-black Rajdhani。4種の色セット |

---

## 7. 比較画面（/compare）

参照ファイル：kaiko_compare_stitch_v1.html（ワイヤー段階）

> ※ 表示する補正項目名・数値はDBのhorse_performancesカラムに合わせて実装時に更新する。

### 7-1. セクション構成

| No. | セクション | 内容・仕様 |
| --- | --- | --- |
| 1 | ヘッダー（sticky） | 戻るボタン + 「能力比較」タイトル（左）+ 「回顧AI」ロゴ+analyticsアイコン（右） |
| 2 | 馬A/Bカード（横並び） | flex gap-3。各カード：比較馬ラベル / 馬名（text-base font-bold）/ 変更ボタン（rounded-full）※年齢バッジなし |
| | VSバッジ | 2カードの中央にabsolute配置。#2c313a 背景のダークサークル |
| 3 | 物差し馬セレクター | straightenアイコン + 「物差し馬」ラベル + 馬名ボタン（bg-white border rounded-lg + expand_more） |
| 4 | 推定能力差サマリー | 「もし直接対決したら」/ 馬身数値（Bebas Neue text-6xl text-primary）/ 優勢馬バッジ（rounded-full bg-primary-container） |
| 5 | タブ（3本） | 統合評価 / レース1 / レース2。bg-gray-200/40 p-1 rounded-full コンテナ内でアクティブのみ bg-primary rounded-full |
| 6 | 能力補正詳細カード | テーブルヘッダー / 着差ベース行 / 補正値グリッド（2列）/ 合計行（bg-primary/5） |
| 7 | CTAボタン | 「レース詳細へ戻る」bg-on-surface text-white rounded-2xl |

### 7-2. 補正項目（確定版）

| DBカラム | テーブル | 表示ラベル |
| --- | --- | --- |
| track_bias_value | races（JOINして取得） | トラックバイアス |
| track_condition_value | horse_performances | 馬場適性 |
| pace_effect_value | horse_performances | 展開・ペース |
| trouble_value | horse_performances | 不利・出遅れ |
| temperament_value | horse_performances | 折り合い |
| weight_effect_value | horse_performances | 斤量補正 |

補正後能力差 = 実際の着差（馬身）± 各項目の補正値合計。正=馬A有利（emerald）、負=馬B有利（red）、0=gray。

### 7-3. 物差し馬ロジック

馬Aと馬Bが直接対戦していない場合、共通の物差し馬を経由して能力差を推定する。

| ステップ | 処理 |
| --- | --- |
| **対象レースの選定** | 各馬の直近5走を取得。eval_tag = disregard のレースは除外する |
| **ステップ1** | レース1：馬A vs 物差し馬の補正後能力差を算出（+α馬身） |
| **ステップ2** | レース2：物差し馬 vs 馬Bの補正後能力差を算出（+β馬身） |
| **ステップ3** | 推定能力差：α + β = 馬A vs 馬Bの推定差 |
| **複数レースの統合** | 対象レースが複数ある場合は補正後能力差の平均値を使用 |

---

## 8. 馬ページ（/horses/[id]）

タブなし・スタック遷移のみ。レース詳細・比較画面の馬名タップから遷移。Stitch画面は未生成。デザインはレース詳細画面のシステムに準拠して実装する。

| No. | セクション | 内容 |
| --- | --- | --- |
| 1 | ヘッダー | 戻るボタン + ロゴ + 馬名 |
| 2 | 馬プロフィール | 馬名・生年・調教師・脚質・得意距離 |
| 3 | 出走歴一覧 | レースごとに着順・評価タグ・総合記号・適性/ロス表示。タップでレース詳細へ |
| 4 | CTAボタン | 「この馬を比較に追加 →」。比較ページの馬A/Bにセット |

---

## 9. データフロー

| 画面 | 主要クエリ | 対象テーブル |
| --- | --- | --- |
| レース詳細 | race + horse_performances JOIN horses | races, horse_performances, horses |
| 馬ページ | horse + horse_performances JOIN races | horses, horse_performances, races |
| 比較画面 | 2頭の直近5走（disregard除外）+ 物差し馬のhorse_performances。racesをJOINしtrack_bias_valueを取得 | horse_performances, races, horses |

Supabase（PostgreSQL）。RLSによりraces/horses/horse_performancesは全ユーザー参照可。書き込みはservice_roleのみ。

---

## 10. Phase 2 実装ステップ

| ステップ | 内容 |
| --- | --- |
| ① | Next.jsセットアップ：create-next-app / Tailwind設定 / tailwind.configに両画面トークンをマージして追加 / フォント設定 |
| ② | 共通コンポーネント：BottomNav / Header / カード / バッジ / 評価ブロック / 評価タグ / Bebas Neue数値表示 |
| ③ | レース詳細画面：/races/[id]。stitch_v1.htmlを正として実装。Supabaseデータ接続 |
| ④ | 馬ページ：/horses/[id]。出走歴一覧＋比較追加ボタン |
| ⑤ | 比較画面：/compare。物差し馬ロジック実装（直近5走・disregard除外・平均値計算）。補正項目をDBカラムに合わせて確定 |
| ⑥ | 検索・ホーム：/ ページ。レース一覧＋検索バー |

---

以上　— 08. フロントエンド設計　v1.3
