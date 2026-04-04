"""
pipeline.py  —  KAIKO データパイプライン（Phase 1 ローカル版）
"""

import sys
import json
import os
import subprocess
import re
import anthropic
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

if len(sys.argv) < 3:
    print("使い方: python3 pipeline.py <race_id> <youtube_url_or_video_id>")
    sys.exit(1)

race_id = sys.argv[1]
yt_arg  = sys.argv[2]

SUPABASE_URL        = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# ── 1. レース結果取得 ──
print(f"[1/5] netkeibaからレース結果を取得中... (race_id={race_id})")
race_proc = subprocess.run(["python3", "fetch_race.py", race_id], capture_output=True, text=True)
if race_proc.returncode != 0:
    print("fetch_race.py でエラー:"); print(race_proc.stderr); sys.exit(1)

raw_out    = race_proc.stdout
json_start = raw_out.rfind("\n[") + 1 if "\n[" in raw_out else raw_out.find("[")
if json_start == -1:
    print("レース結果JSONが見つかりません"); print(raw_out); sys.exit(1)

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

# ── 2. 既存データ取得 ──
print(f"[2/5] Supabaseから既存データを確認中...")
existing_race = None
existing_performances = []

race_res = supabase.table("races").select("*").eq("race_id", race_id).execute()
if race_res.data:
    existing_race = race_res.data[0]
    hp_res = supabase.table("horse_performances").select("*").eq("race_id", race_id).execute()
    existing_performances = hp_res.data or []
    print(f"  → 既存データあり（horse_performances: {len(existing_performances)}件）。マージモードで実行します。")
else:
    print(f"  → 既存データなし。新規登録モードで実行します。")

# ── 3. 字幕取得 ──
print(f"[3/5] YouTube字幕を取得中... ({yt_arg})")
tr_proc = subprocess.run(["python3", "fetch_transcript.py", yt_arg], capture_output=True, text=True)
if tr_proc.returncode != 0:
    print("fetch_transcript.py でエラー:"); print(tr_proc.stderr); sys.exit(1)

saved_match = re.search(r"保存完了: (transcript_\S+\.txt)", tr_proc.stdout)
if not saved_match:
    print("字幕ファイルの保存先が取得できません"); print(tr_proc.stdout); sys.exit(1)

transcript_filename = saved_match.group(1)
with open(transcript_filename, "r", encoding="utf-8") as f:
    transcript_lines = f.readlines()
print(f"  → {transcript_filename} を読み込み ({len(transcript_lines)}行)")

# ── 3b. 該当レースの字幕区間を切り出し ──
def extract_race_segment(lines, target_race_number):
    time_pattern = re.compile(r'\[(\d+)秒\]')
    race_pattern = re.compile(r'(?<!\d)(\d+)レース')

    race_start_times = {}
    for line in lines:
        time_match = time_pattern.search(line)
        race_match = race_pattern.search(line)
        if time_match and race_match:
            sec  = int(time_match.group(1))
            rnum = int(race_match.group(1))
            if rnum not in race_start_times:
                race_start_times[rnum] = sec

    print(f"  → 検出されたレース開始秒: { {k: v for k, v in sorted(race_start_times.items())} }")

    if target_race_number not in race_start_times:
        print(f"  ⚠️  {target_race_number}レースの開始位置が検出できませんでした。全字幕を使用します。")
        return "".join(lines)

    start_sec = race_start_times[target_race_number]
    sorted_races = sorted(race_start_times.keys())
    current_idx  = sorted_races.index(target_race_number)
    end_sec = race_start_times[sorted_races[current_idx + 1]] if current_idx + 1 < len(sorted_races) else float('inf')

    segment_lines = []
    for line in lines:
        time_match = time_pattern.search(line)
        if time_match:
            sec = int(time_match.group(1))
            if start_sec <= sec < end_sec:
                segment_lines.append(line)

    result = "".join(segment_lines)
    print(f"  → {target_race_number}Rの字幕区間: {start_sec}秒〜{int(end_sec) if end_sec != float('inf') else '終端'}秒 ({len(segment_lines)}行 / {len(result)}文字)")
    return result

transcript_text = extract_race_segment(transcript_lines, race_number)

if not transcript_text.strip():
    print("⚠️  該当レースの字幕が空です。処理を中止します。")
    sys.exit(1)

# ── 4. Claude API で整形（新規 or マージ） ──
print("[4/5] Claude APIでDB用JSONに整形中...")
client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """あなたは競馬回顧データの構造化AIです。
与えられたデータを分析し、指定のJSON形式で出力してください。
JSONのみを返し、前後の説明文・Markdownコードブロック（```）は一切含めないでください。"""

# 既存データがある場合はマージ用プロンプト、ない場合は新規用プロンプト
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

## 新ソースの回顧字幕テキスト
{transcript_text[:6000]}

---

## マージルール
- 既存データと新ソースで一致する評価は confidence を上げる（low→medium→high）
- 既存データで null だった項目に新ソースが言及していれば値を補完する
- 既存データと新ソースで評価が矛盾する場合は review_flag = true にする
- sources に新ソース「YouTube字幕」を追加する（重複しない場合のみ）
- horse_performances は全出走馬分を出力する

## 出力フォーマット（既存と同じ構造で返すこと）

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

## 回顧字幕テキスト（YouTube・該当レース区間のみ）
{transcript_text[:8000]}

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
    "sources": ["YouTube字幕"],
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
      "sources": ["YouTube字幕"],
      "confidence": "high/medium/low",
      "review_flag": false,
      "processed": true
    }}
  ]
}}

## 整形ルール
- 字幕から読み取れる馬身換算値は数値で。不明はnull
- level: small=0.5馬身未満 / medium=0.5〜2馬身 / large=2馬身超 / 不明=null
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
    # Claude APIがrace_idを書き換えることがあるため強制上書き
    output_json["races"]["race_id"] = race_id
    for h in output_json.get("horse_performances", []):
        h["race_id"] = race_id
except json.JSONDecodeError as e:
    print(f"JSONパース失敗: {e}")
    with open(f"raw_response_{race_id}.txt", "w", encoding="utf-8") as f:
        f.write(raw_response)
    print(f"生レスポンスを raw_response_{race_id}.txt に保存しました")
    sys.exit(1)

# ── 5. eval_tag 生成 ──
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

output_filename = f"output_{race_id}.json"
with open(output_filename, "w", encoding="utf-8") as f:
    json.dump(output_json, f, ensure_ascii=False, indent=2)

races_data = output_json.get("races", {})
flagged    = [h for h in hp_list if h.get("review_flag")]
eval_counts = {}
for h in hp_list:
    tag = h.get("eval_tag", "fair")
    eval_counts[tag] = eval_counts.get(tag, 0) + 1

mode = "マージ" if existing_race else "新規"
print()
print("=" * 40)
print(f"✅ 完了: {output_filename} （{mode}モード）")
print(f"   レース: {races_data.get('race_name')} ({races_data.get('race_date')})")
print(f"   race_number: {races_data.get('race_number')} / kai_nichi: {races_data.get('kai_nichi')}")
print(f"   出走頭数: {len(hp_list)}頭")
print(f"   eval_tag: {eval_counts}")
print(f"   review_flag=true: {len(flagged)}頭")
print(f"   使用トークン: input={message.usage.input_tokens} / output={message.usage.output_tokens}")
print("=" * 40)
