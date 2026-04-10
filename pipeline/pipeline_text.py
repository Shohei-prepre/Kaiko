"""
pipeline_text.py  —  KAIKO データパイプライン（テキスト/URL ソース版）

YouTube 以外のソース（記事URL・直接テキスト・ローカルファイル）から
回顧データを取り込む。既存の pipeline.py は一切変更しない。

使い方:
  # 記事URLから取得（オンライン可）
  python3 pipeline_text.py <race_id> --url https://example.com/article

  # テキストを直接渡す
  python3 pipeline_text.py <race_id> --text "ここに回顧テキストをペースト..."

  # ローカルファイルを渡す（YouTube字幕ファイルの流用も可）
  python3 pipeline_text.py <race_id> --file transcript_xxxxx.txt

  # ソース名を明示したい場合（省略時は自動設定）
  python3 pipeline_text.py <race_id> --url https://... --source "競馬ラボ"
"""

import sys
import json
import os
import subprocess
import re
import argparse
import anthropic
from dotenv import load_dotenv
from supabase import create_client

# ── 記事URLクローリング用（pip install requests beautifulsoup4 が必要）
try:
    import requests
    from bs4 import BeautifulSoup
    CRAWLER_AVAILABLE = True
except ImportError:
    CRAWLER_AVAILABLE = False

load_dotenv()

# ── 引数パース ──────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="KAIKO パイプライン（テキスト/URLソース版）")
parser.add_argument("race_id", help="netkeibaのrace_id（例: 202407010211）")

source_group = parser.add_mutually_exclusive_group(required=True)
source_group.add_argument("--url",  help="回顧記事のURL（クローリングして本文取得）")
source_group.add_argument("--text", help="回顧テキストを直接入力")
source_group.add_argument("--file", help="テキストファイルのパス")

parser.add_argument("--source", help="sources フィールドに記録するソース名（省略時は自動）", default=None)

args = parser.parse_args()

race_id = args.race_id

SUPABASE_URL         = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# ── 1. レース結果取得（fetch_race.py を流用） ──────────────────────
print(f"[1/5] netkeibaからレース結果を取得中... (race_id={race_id})")
race_proc = subprocess.run(
    ["python3", "fetch_race.py", race_id],
    capture_output=True, text=True
)
if race_proc.returncode != 0:
    print("fetch_race.py でエラー:")
    print(race_proc.stderr)
    sys.exit(1)

raw_out    = race_proc.stdout
json_start = raw_out.rfind("\n[") + 1 if "\n[" in raw_out else raw_out.find("[")
if json_start == -1:
    print("レース結果JSONが見つかりません")
    print(raw_out)
    sys.exit(1)

race_results   = json.loads(raw_out[json_start:])
race_info_text = raw_out[:json_start].strip()

race_number = None
kai_nichi   = ""
for line in race_info_text.splitlines():
    if line.startswith("race_number:"):
        race_number = int(line.split(":")[1].strip())
    if line.startswith("kai_nichi:"):
        kai_nichi = line.split(":", 1)[1].strip()

print(f"  → {len(race_results)}頭分のデータを取得 / race_number={race_number} / kai_nichi={kai_nichi}")

# ── 2. 既存データ確認 ─────────────────────────────────────────────
print(f"[2/5] Supabaseから既存データを確認中...")
existing_race         = None
existing_performances = []

race_res = supabase.table("races").select("*").eq("race_id", race_id).execute()
if race_res.data:
    existing_race = race_res.data[0]
    hp_res = supabase.table("horse_performances").select("*").eq("race_id", race_id).execute()
    existing_performances = hp_res.data or []
    print(f"  → 既存データあり（horse_performances: {len(existing_performances)}件）。マージモードで実行します。")
else:
    print(f"  → 既存データなし。新規登録モードで実行します。")

# ── 3. ソーステキスト取得 ─────────────────────────────────────────
print(f"[3/5] ソーステキストを取得中...")

source_label = args.source  # 明示指定がある場合

if args.url:
    # URL クローリング
    if not CRAWLER_AVAILABLE:
        print("❌ requests / beautifulsoup4 が未インストールです。")
        print("   pip install requests beautifulsoup4 を実行してください。")
        sys.exit(1)

    url = args.url
    if source_label is None:
        # ドメイン名をソース名に使う
        domain = re.sub(r"https?://([^/]+).*", r"\1", url)
        source_label = domain

    print(f"  → クローリング中: {url}")
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
        resp = requests.get(url, headers=headers, timeout=15)
        resp.encoding = resp.apparent_encoding
        soup = BeautifulSoup(resp.text, "html.parser")

        # <script> <style> <nav> <footer> などノイズを除去
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "iframe"]):
            tag.decompose()

        # <article> があればその中、なければ <body> 全体
        article = soup.find("article") or soup.find("main") or soup.body
        raw_text = article.get_text(separator="\n") if article else soup.get_text(separator="\n")

        # 連続する空行を1行に圧縮
        source_text = re.sub(r"\n{3,}", "\n\n", raw_text).strip()
        print(f"  → {len(source_text)}文字を取得")

    except Exception as e:
        print(f"❌ URL取得に失敗しました: {e}")
        sys.exit(1)

elif args.text:
    # テキスト直接入力
    source_text  = args.text.strip()
    source_label = source_label or "直接入力テキスト"
    print(f"  → {len(source_text)}文字のテキストを受け取りました")

elif args.file:
    # ファイル読み込み
    file_path = args.file
    if not os.path.exists(file_path):
        print(f"❌ ファイルが見つかりません: {file_path}")
        sys.exit(1)
    with open(file_path, "r", encoding="utf-8") as f:
        source_text = f.read().strip()
    source_label = source_label or os.path.basename(file_path)
    print(f"  → {file_path} を読み込み（{len(source_text)}文字）")

if not source_text:
    print("⚠️  テキストが空です。処理を中止します。")
    sys.exit(1)

# テキストが長すぎる場合は先頭8000文字に切る（Claudeのトークン節約）
MAX_CHARS = 8000
if len(source_text) > MAX_CHARS:
    print(f"  ⚠️  テキストが長いため先頭{MAX_CHARS}文字に切り詰めます（元: {len(source_text)}文字）")
    source_text = source_text[:MAX_CHARS]

# ── 4. Claude API で整形 ──────────────────────────────────────────
print("[4/5] Claude APIでDB用JSONに整形中...")
client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """あなたは競馬回顧データの構造化AIです。
与えられたデータを分析し、指定のJSON形式で出力してください。
JSONのみを返し、前後の説明文・Markdownコードブロック（```）は一切含めないでください。"""

if existing_race:
    existing_sources = existing_race.get("sources", [])
    USER_PROMPT = f"""既存の回顧データに新しいソースの情報をマージしてください。

## レース結果（netkeiba・確定値）
{json.dumps(race_results, ensure_ascii=False, indent=2)}

## 既存の構造化データ（ソース: {existing_sources}）
### races
{json.dumps(existing_race, ensure_ascii=False, indent=2)}

### horse_performances（既存）
{json.dumps(existing_performances, ensure_ascii=False, indent=2)}

## 新ソースの回顧テキスト（ソース: {source_label}）
{source_text}

---

## マージルール
- 既存データと新ソースで一致する評価は confidence を上げる（low→medium→high）
- 既存データで null だった項目に新ソースが言及していれば値を補完する
- 既存データと新ソースで評価が矛盾する場合は review_flag = true にする
- sources に新ソース「{source_label}」を追加する（重複しない場合のみ）
- horse_performances は全出走馬分を出力する

## 整形ルール（マージ時も全馬に必ず値を入れること）

### STEP 1: レース全体の状況を先に確定する
テキストから以下を読み取り、races フィールドに反映する。

【ペース (pace / pace_level / pace_value / pace_summary)】
- 「ハイペース」「スロー」「前残り」「差し有利」「上がりがかかった」などの表現から判定
- pace: スロー / ミドル / ハイ
- pace_summary: 具体的な展開記述
- pace_value: ペースが有利/不利に働いた馬身換算の目安

【トラックバイアス (track_bias_level / track_bias_value / track_bias_summary)】
- 「内有利」「外有利」「差し有利」「前有利」などの表現から判定
- track_bias_summary: 具体的なバイアス内容
- track_bias_value: バイアスの大きさの馬身換算目安

### STEP 2: 全馬の展開ポジションを確定する
レース結果JSON の position_order（通過順）と枠番から各馬の展開を分類する。
- 逃げ: 先頭または2番手で終始レース
- 先行: 3〜5番手付近
- 中団: 6〜10番手付近
- 後方: それ以降
- 内/外の判断: 枠番1〜4は内、5〜8は中、9〜18は外を基本とする

### STEP 3: 全馬に pace_effect_value と track_condition_value（個別）を推定して入れる
テキストで個別言及がない馬も、STEP1・STEP2 の情報から必ず推定値を入れること。null は禁止。

【pace_effect_value の推定ルール】
- ハイペース時: 逃げ・先行馬は +1.0〜+2.0（消耗分のハンデ）、差し・追込馬は -0.5〜-1.0（恩恵）
- スローペース時: 逃げ・先行馬は -0.5〜-1.0（恩恵）、差し・追込馬は +0.5〜+1.0（不利）
- ミドルペース: 全馬 0.0 を基本とし、テキストで言及があれば調整

【track_condition_value（個別）の推定ルール】
- 内有利バイアス: 内枠（1〜4枠）は -0.5（恩恵）、外枠（7〜9枠）は +0.5〜+1.0（不利）
- 外有利バイアス: 逆の符号
- バイアスなし（track_bias_level=null）: 全馬 0.0

### STEP 4: 不利・出遅れは必ず trouble_value と trouble_summary に入れる
- 出遅れ: 「1歩遅れ」→ trouble_value=0.3、「2歩遅れ」→ 0.5、「大きく出遅れ」→ 1.0〜1.5
- 「何歩遅れ」という表現は trouble_summary にそのまま保持する（例: "2歩出遅れ"）
- 進路妨害・接触・外に振られた等: 内容に応じて 0.3〜1.5
- 大きな不利（落馬・競走中止）: trouble_value=3.0 以上、eval_tag=disregard
- 不利の言及がない馬: trouble_value=0.0、trouble_summary=null

### STEP 5: 気性・馬体重影響は言及があれば入れる
- 「かかった」「折り合いを欠いた」→ temperament_value: 0.5〜1.5
- 「馬体重増で太め残り」「絞れていた」→ weight_effect_value: 0.3〜1.0
- 言及なし: 両方 0.0

### 数値の基準
- level: small=0.5馬身未満 / medium=0.5〜2馬身 / large=2馬身超
- value の符号: プラス（+）＝その馬にとって不利・ハンデ、マイナス（-）＝有利・恩恵
- pace_effect と track_condition は必ず数値を入れること（null 禁止）

### その他
- horse_performances は全出走馬分を着順順で出力
- frame_number・horse_number はレース結果JSONのframe_number・umabanから取得
- 中止・除外は finish_order=99
- review_flag は confidence=low のみ true
- JSONのみ返すこと
"""

## 出力フォーマット

{{
  "races": {{
    "race_id": "{race_id}",
    "race_number": {race_number},
    "kai_nichi": "{kai_nichi}",
    "race_name": "レース名",
    "race_date": "YYYY-MM-DD",
    "track": "競馬場名",
    "distance": 距離(整数・m),
    "surface": "芝 or ダート",
    "grade": "G1/G2/G3/OP/1勝C など",
    "track_condition": "良/稍重/重/不良",
    "lap_times": "12.3,11.1,... or null",
    "pace": "スロー/ミドル/ハイ",
    "track_bias_level": "null/small/medium/large",
    "track_bias_value": 馬身数 or null,
    "track_bias_summary": "説明",
    "course_aptitude_level": "null/small/medium/large",
    "course_aptitude_value": 馬身数 or null,
    "course_aptitude_summary": "説明",
    "pace_level": "null/small/medium/large",
    "pace_value": 馬身数 or null,
    "pace_summary": "説明",
    "sources": ["ソース1", "ソース2"],
    "confidence": "high/medium/low"
  }},
  "horse_performances": [
    {{
      "race_id": "{race_id}",
      "horse_name": "馬名",
      "finish_order": 着順(整数),
      "margin": "着差",
      "weight_carried": 斤量(数値),
      "frame_number": 枠番(整数),
      "horse_number": 馬番(整数),
      "position_order": "通過順位",
      "horse_weight": "馬体重",
      "trouble_level": "null/small/medium/large",
      "trouble_value": 馬身数 or null,
      "trouble_summary": "説明 or null",
      "temperament_level": "null/small/medium/large",
      "temperament_value": 馬身数 or null,
      "temperament_summary": "説明 or null",
      "weight_effect_level": "null/small/medium/large",
      "weight_effect_value": 馬身数 or null,
      "weight_effect_summary": "説明 or null",
      "track_condition_level": "null/small/medium/large",
      "track_condition_value": 馬身数 or null,
      "track_condition_summary": "説明 or null",
      "pace_effect_level": "null/small/medium/large",
      "pace_effect_value": 馬身数 or null,
      "pace_effect_summary": "説明 or null",
      "sources": ["ソース1", "ソース2"],
      "confidence": "high/medium/low",
      "review_flag": false,
      "processed": true
    }}
  ]
}}
"""
else:
    USER_PROMPT = f"""以下のデータをDB用JSONに整形してください。

## レース情報テキスト（netkeibaから取得）
{race_info_text}

## レース結果（JSON）
{json.dumps(race_results, ensure_ascii=False, indent=2)}

## 回顧テキスト（ソース: {source_label}）
{source_text}

---

## 出力フォーマット

{{
  "races": {{
    "race_id": "{race_id}",
    "race_number": {race_number},
    "kai_nichi": "{kai_nichi}",
    "race_name": "レース名",
    "race_date": "YYYY-MM-DD",
    "track": "競馬場名",
    "distance": 距離(整数・m),
    "surface": "芝 or ダート",
    "grade": "G1/G2/G3/OP/1勝C など",
    "track_condition": "良/稍重/重/不良",
    "lap_times": "12.3,11.1,... or null",
    "pace": "スロー/ミドル/ハイ",
    "track_bias_level": "null/small/medium/large",
    "track_bias_value": 馬身数 or null,
    "track_bias_summary": "説明",
    "course_aptitude_level": "null/small/medium/large",
    "course_aptitude_value": 馬身数 or null,
    "course_aptitude_summary": "説明",
    "pace_level": "null/small/medium/large",
    "pace_value": 馬身数 or null,
    "pace_summary": "説明",
    "sources": ["{source_label}"],
    "confidence": "high/medium/low"
  }},
  "horse_performances": [
    {{
      "race_id": "{race_id}",
      "horse_name": "馬名",
      "finish_order": 着順(整数),
      "margin": "着差",
      "weight_carried": 斤量(数値),
      "frame_number": 枠番(整数),
      "horse_number": 馬番(整数),
      "position_order": "通過順位",
      "horse_weight": "馬体重",
      "trouble_level": "null/small/medium/large",
      "trouble_value": 馬身数 or null,
      "trouble_summary": "説明 or null",
      "temperament_level": "null/small/medium/large",
      "temperament_value": 馬身数 or null,
      "temperament_summary": "説明 or null",
      "weight_effect_level": "null/small/medium/large",
      "weight_effect_value": 馬身数 or null,
      "weight_effect_summary": "説明 or null",
      "track_condition_level": "null/small/medium/large",
      "track_condition_value": 馬身数 or null,
      "track_condition_summary": "説明 or null",
      "pace_effect_level": "null/small/medium/large",
      "pace_effect_value": 馬身数 or null,
      "pace_effect_summary": "説明 or null",
      "sources": ["{source_label}"],
      "confidence": "high/medium/low",
      "review_flag": false,
      "processed": true
    }}
  ]
}}

## 整形ルール（必ず全馬に値を入れること）

### STEP 1: レース全体の状況を先に確定する
テキストから以下を読み取り、races フィールドに反映する。

【ペース (pace / pace_level / pace_value / pace_summary)】
- 「ハイペース」「スロー」「前残り」「差し有利」「上がりがかかった」などの表現から判定
- pace: スロー / ミドル / ハイ
- pace_summary: 具体的な展開記述
- pace_value: ペースが有利/不利に働いた馬身換算の目安

【トラックバイアス (track_bias_level / track_bias_value / track_bias_summary)】
- 「内有利」「外有利」「差し有利」「前有利」などの表現から判定
- track_bias_summary: 具体的なバイアス内容
- track_bias_value: バイアスの大きさの馬身換算目安

### STEP 2: 全馬の展開ポジションを確定する
レース結果JSON の position_order（通過順）と枠番から各馬の展開を分類する。
- 逃げ: 先頭または2番手で終始レース
- 先行: 3〜5番手付近
- 中団: 6〜10番手付近
- 後方: それ以降
- 内/外の判断: 枠番1〜4は内、5〜8は中、9〜18は外を基本とする

### STEP 3: 全馬に pace_effect_value と track_condition_value（個別）を推定して入れる
テキストで個別言及がない馬も、STEP1・STEP2 の情報から必ず推定値を入れること。null は禁止。

【pace_effect_value の推定ルール】
- ハイペース時: 逃げ・先行馬は +1.0〜+2.0（消耗分のハンデ）、差し・追込馬は -0.5〜-1.0（恩恵）
- スローペース時: 逃げ・先行馬は -0.5〜-1.0（恩恵）、差し・追込馬は +0.5〜+1.0（不利）
- ミドルペース: 全馬 0.0 を基本とし、テキストで言及があれば調整

【track_condition_value（個別）の推定ルール】
- 内有利バイアス: 内枠（1〜4枠）は -0.5（恩恵）、外枠（7〜9枠）は +0.5〜+1.0（不利）
- 外有利バイアス: 逆の符号
- バイアスなし（track_bias_level=null）: 全馬 0.0

### STEP 4: 不利・出遅れは必ず trouble_value と trouble_summary に入れる
- 出遅れ: 「1歩遅れ」→ trouble_value=0.3、「2歩遅れ」→ 0.5、「大きく出遅れ」→ 1.0〜1.5
- 「何歩遅れ」という表現は trouble_summary にそのまま保持する（例: "2歩出遅れ"）
- 進路妨害・接触・外に振られた等: 内容に応じて 0.3〜1.5
- 大きな不利（落馬・競走中止）: trouble_value=3.0 以上、eval_tag=disregard
- 不利の言及がない馬: trouble_value=0.0、trouble_summary=null

### STEP 5: 気性・馬体重影響は言及があれば入れる
- 「かかった」「折り合いを欠いた」→ temperament_value: 0.5〜1.5
- 「馬体重増で太め残り」「絞れていた」→ weight_effect_value: 0.3〜1.0
- 言及なし: 両方 0.0

### 数値の基準
- level: small=0.5馬身未満 / medium=0.5〜2馬身 / large=2馬身超
- value の符号: プラス（+）＝その馬にとって不利・ハンデ、マイナス（-）＝有利・恩恵
- pace_effect と track_condition は必ず数値を入れること（null 禁止）

### その他
- horse_performances は全出走馬分を着順順で出力
- frame_number・horse_number はレース結果JSONのframe_number・umabanから取得
- 中止・除外は finish_order=99
- review_flag は confidence=low のみ true
- JSONのみ返すこと
"""

message = client.messages.create(
    model="claude-haiku-4-5",
    max_tokens=8096,
    system=SYSTEM_PROMPT,
    messages=[{"role": "user", "content": USER_PROMPT}],
)

raw_response = message.content[0].text.strip()
raw_response = re.sub(r"^```[a-z]*\n?", "", raw_response)
raw_response = re.sub(r"\n?```$", "", raw_response)

try:
    output_json = json.loads(raw_response)
    output_json["races"]["race_id"] = race_id
    for h in output_json.get("horse_performances", []):
        h["race_id"] = race_id
except json.JSONDecodeError as e:
    print(f"JSONパース失敗: {e}")
    with open(f"raw_response_{race_id}.txt", "w", encoding="utf-8") as f:
        f.write(raw_response)
    print(f"生レスポンスを raw_response_{race_id}.txt に保存しました")
    sys.exit(1)

# ── 5. eval_tag 生成 ──────────────────────────────────────────────
print("[5/5] eval_tagを生成中...")

hp_list = output_json.get("horse_performances", [])

eval_input = []
for h in hp_list:
    eval_input.append({
        "horse_name":              h.get("horse_name"),
        "finish_order":            h.get("finish_order"),
        "trouble_value":           h.get("trouble_value"),
        "trouble_summary":         h.get("trouble_summary"),
        "temperament_value":       h.get("temperament_value"),
        "temperament_summary":     h.get("temperament_summary"),
        "weight_effect_value":     h.get("weight_effect_value"),
        "weight_effect_summary":   h.get("weight_effect_summary"),
        "track_condition_value":   h.get("track_condition_value"),
        "track_condition_summary": h.get("track_condition_summary"),
        "pace_effect_value":       h.get("pace_effect_value"),
        "pace_effect_summary":     h.get("pace_effect_summary"),
    })

EVAL_SYSTEM = """あなたは競馬回顧データの評価AIです。
各馬のeval_tagをJSON配列で返してください。
JSONのみを返し、前後の説明文・Markdownコードブロック（```）は一切含めないでください。"""

EVAL_USER = f"""以下の各馬について eval_tag を判定してください。

## 判定基準
1. disregard（最優先）: 落馬・競走中止・大きな不利・輸送失敗など結果自体を参考にできないケース
2. below: 合算補正値（track_condition_value + pace_effect_value + trouble_value + temperament_value + weight_effect_value）が +1.5馬身以上。実力より低い結果
3. above: 合算補正値が -1.5馬身以下。条件に恵まれた結果
4. fair: 上記以外（±1.5馬身以内）

## 馬データ
{json.dumps(eval_input, ensure_ascii=False, indent=2)}

## 出力フォーマット
[
  {{"horse_name": "馬名", "eval_tag": "above/fair/below/disregard"}},
  ...
]
"""

eval_message = client.messages.create(
    model="claude-haiku-4-5",
    max_tokens=2048,
    system=EVAL_SYSTEM,
    messages=[{"role": "user", "content": EVAL_USER}],
)

eval_raw = eval_message.content[0].text.strip()
eval_raw = re.sub(r"^```[a-z]*\n?", "", eval_raw)
eval_raw = re.sub(r"\n?```$", "", eval_raw)

try:
    eval_results = json.loads(eval_raw)
    eval_map = {e["horse_name"]: e["eval_tag"] for e in eval_results}
    for h in hp_list:
        h["eval_tag"] = eval_map.get(h.get("horse_name"), "fair")
    print(f"  → {len(eval_map)}頭分のeval_tagを生成")
except json.JSONDecodeError as e:
    print(f"eval_tag JSONパース失敗: {e} / eval_tagはすべてfairで埋めます")
    for h in hp_list:
        h["eval_tag"] = "fair"

output_json["horse_performances"] = hp_list

# ── 出力 ─────────────────────────────────────────────────────────
output_filename = f"output_{race_id}.json"
with open(output_filename, "w", encoding="utf-8") as f:
    json.dump(output_json, f, ensure_ascii=False, indent=2)

races_data  = output_json.get("races", {})
flagged     = [h for h in hp_list if h.get("review_flag")]
eval_counts = {}
for h in hp_list:
    tag = h.get("eval_tag", "fair")
    eval_counts[tag] = eval_counts.get(tag, 0) + 1

mode = "マージ" if existing_race else "新規"
print()
print("=" * 40)
print(f"✅ 完了: {output_filename} （{mode}モード）")
print(f"   レース: {races_data.get('race_name')} ({races_data.get('race_date')})")
print(f"   ソース: {source_label}")
print(f"   race_number: {races_data.get('race_number')} / kai_nichi: {races_data.get('kai_nichi')}")
print(f"   出走頭数: {len(hp_list)}頭")
print(f"   eval_tag: {eval_counts}")
print(f"   review_flag=true: {len(flagged)}頭")
print(f"   使用トークン: input={message.usage.input_tokens} / output={message.usage.output_tokens}")
print("=" * 40)
print()
print(f"次のステップ: python3 insert.py {output_filename}")
