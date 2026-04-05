# KAIKO — デザインシステム

競馬回顧情報サービス「回顧AI」のデザイン原則。
UIを変更・追加する際はこのファイルを必ず参照すること。

---

## 1. デザイン原則

- **レース一覧画面のみシャープコーナー（border-radius: 0）**。他の画面は rounded-xl / rounded-2xl 等を使う
- 汎用的なUIキットのデフォルト見た目（Interフォント・紫グラデ・全部角丸カード）は使わない
- 数値・英字ラベルは Rajdhani または Bebas Neue で表示する
- 余分なアニメーションは入れない。`active:opacity-60` 程度のフィードバックで十分
- コンポーネントを増やすより、既存トークンとHTMLで直接書くことを優先する

---

## 2. カラートークン（globals.css に定義済み）

```css
--kaiko-primary: #0055e5          /* メインアクセント・リンク・アクティブ状態 */
--kaiko-primary-container: #eef4ff /* primary の薄背景（バッジ等） */
--kaiko-surface: #f8f9fb           /* ページ背景 */
--kaiko-surface-container-low: #f3f4f6
--kaiko-on-surface: #191c1e        /* メインテキスト */
--kaiko-on-surface-variant: #5e636e /* サブテキスト・ラベル */
--kaiko-outline-variant: #e8eaed   /* ボーダー */
--kaiko-border: #dee2e6
--kaiko-text-main: #0f1115
--kaiko-text-sub: #4a5568
--kaiko-text-muted: #8a94a6

/* 評価タグ */
--kaiko-eval-neutral-bg: #e8effe   --kaiko-eval-neutral-text: #003aaa   /* 実力通り */
--kaiko-eval-positive-bg: #ecfdf5  --kaiko-eval-positive-text: #065f46  /* 実力以下（次走買い） */
--kaiko-eval-warning-bg: #fffbeb   --kaiko-eval-warning-text: #92400e   /* 実力以上 */
--kaiko-eval-disregard-bg: #f3f4f6 --kaiko-eval-disregard-text: #4b5563 /* 度外視 */

/* 枠番（JRA準拠） */
--kaiko-waku-1: #ffffff  --kaiko-waku-2: #e2e8f0  --kaiko-waku-3: #fee2e2
--kaiko-waku-4: #dbeafe  --kaiko-waku-5: #fef9c3  --kaiko-waku-6: #dcfce7
--kaiko-waku-7: #ffedd5  --kaiko-waku-8: #fce7f3

/* グレードバッジ */
G1: bg-[#f59e0b] text-white
G2/G3: bg-[var(--kaiko-on-surface-variant)] text-white
OP: border border-[var(--kaiko-border)] text-[var(--kaiko-on-surface-variant)]
```

---

## 3. フォント

| 用途 | フォント | CSS変数 |
|---|---|---|
| 本文・馬名・コメント | Noto Sans JP 400/500/700/900 | `font-[family-name:var(--font-noto-sans-jp)]` |
| 英字ラベル・バッジ・ナビ | Rajdhani 600/700 | `font-[family-name:var(--font-rajdhani)]` |
| 大きい数値（馬身差等） | Bebas Neue | `font-[family-name:var(--font-bebas-neue)]` |
| ロゴ「回顧AI」 | Noto Sans JP 900 + italic + text-primary | — |
| アイコン | Material Symbols Outlined | `material-symbols-outlined` クラス |

英字ラベルは `uppercase tracking-widest text-[10px]` が基本スタイル。

---

## 4. 画面別 border-radius ルール

| 画面 | ルール | 実装 |
|---|---|---|
| `/races`（一覧） | **全要素シャープコーナー** | `[&_*]:!rounded-none` をルートに付与。ピルタブのみ `!rounded-full` で上書き |
| `/races/[id]`（詳細） | rounded-xl 基準 | カード: rounded-xl / 評価タグ: rounded-full / 枠番バッジ: rounded-md |
| `/horses/[id]` | 詳細画面に準拠 | — |
| `/compare` | rounded-2xl 基準 | サマリー・コンテンツ: rounded-2xl / VSバッジ・タブ: rounded-full |

---

## 5. 共通コンポーネント仕様

### ヘッダー（sticky）
```
h-14〜16 bg-white border-b border-[var(--kaiko-outline-variant)] sticky top-0 z-50
ロゴ: text-xl font-black italic text-[var(--kaiko-primary)] font-noto-sans-jp
```

### カード
```
bg-white border border-[var(--kaiko-outline-variant)] shadow-sm
レース詳細・比較: rounded-xl
レース一覧: rounded-none（シャープ）
```

### グレードバッジ（GradeBadge コンポーネント）
```
G1: bg-[#f59e0b] text-white text-[10px] font-bold px-1.5 py-0.5
G2/G3: bg-[var(--kaiko-on-surface-variant)] text-white 同上
OP: border border-[var(--kaiko-border)] text-[var(--kaiko-on-surface-variant)] 同上
```

### 評価タグ（eval_tag）
```
rounded-full text-[9px] font-black px-2 py-0.5 Rajdhani
fair（実力通り）: eval-neutral
below（実力以下）: eval-positive  ← 緑。次走買い候補なのでポジティブ色
above（実力以上）: eval-warning
disregard（度外視）: eval-disregard
```

### 能力記号（abilitySymbol）
```
◎: text-[var(--kaiko-sym-great)] #10b981
○: text-[var(--kaiko-sym-good)]  #0055e5
△: text-[var(--kaiko-sym-fair)]  #718096
×: text-[var(--kaiko-sym-bad)]   #f59e0b
```

### VSバッジ（比較画面）
```
bg-[#2c313a] text-white text-[11px] font-black w-9 h-9 rounded-full
border-[3px] border-[var(--kaiko-surface)] italic shadow-md
2カードの中央に absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
```

### BottomNav
```
fixed bottom-0 z-50 bg-white border-t h-20 pb-4
タブ2つのみ: レース（/races）・能力比較（/compare）
アクティブ: text-primary + FILL=1 + 下にw-1.5 h-1.5 bg-primary rounded-full
```

---

## 6. 画面構成

### /races（レース一覧）
- ヘッダー: ロゴ左 + 「ほかの週を見る」ボタン右
- 週セレクター: 来週/今週/指定週（アンダーライン型タブ）
- 曜日タブ: 土曜日/日曜日（ピル型・rounded-full）
- 会場カード: 縦リスト。グレード優先→レース番号降順で上位3件表示。3件超は「View All」で展開
- お知らせセクション

### /races/[id]（レース詳細）
- レース概要カード（上部 h-1 bg-primary バー付き）
- ラップタイム棒グラフ（bg-primary/20 通常、bg-amber-500/60 加速区間）
- 出走馬リスト: 着順/枠番/馬名/能力記号/評価タグ。タップで展開（展開パネルに補正値2項目+コメント）
- 「Add horse to comparison」CTAボタン

### /horses/[id]（馬ページ）
- 馬プロフィール
- 出走歴一覧（着順+評価タグ+能力記号）
- 「この馬を比較に追加」CTAボタン → /compare?horse={id}

### /compare（能力比較）
- 馬A vs 馬B（横並びカード + VSバッジ）
- 推定能力差サマリー（Bebas Neue text-6xl）
- タブ: 統合評価 / レース1 / レース2...
- 能力補正詳細カード（2列グリッド）

---

## 7. 馬選択モーダル（CompareClient）

2タブ構成:
1. **レースから選ぶ**: 日付/会場/レース名一覧 → タップで出走馬一覧（着順+eval_tagドット+馬名）
2. **馬名から選ぶ**: かな行フィルター（ア行〜ワ行）+ テキスト絞り込み + 全馬一覧

---

## 8. フロント計算値（DBに保存しない）

```ts
aptitude_value = track_condition_value + pace_effect_value
loss_value     = trouble_value + temperament_value + weight_effect_value
ability_value  = aptitude_value + loss_value

// eval_tag 判定基準（Claude APIで生成）
disregard: 落馬・競走中止・大きな不利
below: 合算補正値 >= +1.5馬身（実力より低い結果）
above: 合算補正値 <= -1.5馬身（条件に恵まれた）
fair: ±1.5馬身以内
```

---

## 9. DB主要カラム（クエリで使うもの）

```
races: race_id, race_name, race_date, track, distance, surface, grade,
       track_condition, lap_times, pace, track_bias_value, track_bias_summary,
       course_aptitude_value, pace_value, race_number

horse_performances: race_id, horse_id, finish_order, margin, weight_carried,
                    frame_number, horse_number, position_order, horse_weight,
                    trouble_value/summary, temperament_value/summary,
                    weight_effect_value/summary, track_condition_value/summary,
                    pace_effect_value/summary, eval_tag, review_flag

horses: horse_id, name, born_year, trainer

JOIN: horse_performances.horses(*) / horse_performances.races(*)
主キー: race_id（races）, horse_id（horses）※idではない
```

---

## 10. iOS Safari 注意事項

- `touch-action: manipulation` と `-webkit-tap-highlight-color: transparent` を `a, button, [role="button"]` に適用済み（globals.css）
- viewport: `width=device-width, initial-scale=1` を layout.tsx の `<head>` に明示
- `active:opacity-60` でタップフィードバックを実装

---

*最終更新: 2026-04-05*
