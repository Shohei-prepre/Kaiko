import json
import sys
import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("❌ .env に SUPABASE_URL と SUPABASE_SERVICE_KEY を設定してください")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def upsert_horses(performances):
    horse_names = list({p["horse_name"] for p in performances if p.get("horse_name")})
    name_to_id = {}
    for name in horse_names:
        res = supabase.table("horses").select("horse_id").eq("name", name).execute()
        if res.data:
            horse_id = res.data[0]["horse_id"]
        else:
            ins = supabase.table("horses").insert({"name": name}).execute()
            horse_id = ins.data[0]["horse_id"]
        name_to_id[name] = horse_id
        print(f"  🐴 horses: {name} → horse_id={horse_id}")
    return name_to_id

def upsert_race(race):
    supabase.table("races").upsert(race, on_conflict="race_id").execute()
    print(f"  🏁 races: {race.get('race_id')} upsert 完了")

def upsert_performances(performances, name_to_id):
    rows = []
    for p in performances:
        p = dict(p)
        horse_name = p.pop("horse_name", None)
        if horse_name and horse_name in name_to_id:
            p["horse_id"] = name_to_id[horse_name]
        else:
            print(f"  ⚠️  horse_name '{horse_name}' が見つかりません（スキップ）")
            continue
        rows.append(p)
    if rows:
        supabase.table("horse_performances").upsert(
            rows, on_conflict="race_id,horse_id"
        ).execute()
        print(f"  📋 horse_performances: {len(rows)} 件 upsert 完了")
    else:
        print("  ⚠️  投入するレコードがありません")

def main():
    if len(sys.argv) < 2:
        print("使い方: python3 insert.py <output_<race_id>.json のパス>")
        sys.exit(1)
    json_path = sys.argv[1]
    if not os.path.exists(json_path):
        print(f"❌ ファイルが見つかりません: {json_path}")
        sys.exit(1)
    print(f"\n📂 読み込み: {json_path}")
    data = load_json(json_path)
    race_data = data.get("races")
    performances_data = data.get("horse_performances", [])
    if not race_data:
        print("❌ JSON に 'races' キーが見つかりません")
        sys.exit(1)
    print(f"\n--- Step 1: horses upsert ---")
    name_to_id = upsert_horses(performances_data)
    print(f"\n--- Step 2: races upsert ---")
    upsert_race(race_data)
    print(f"\n--- Step 3: horse_performances upsert ---")
    upsert_performances(performances_data, name_to_id)
    print(f"\n✅ 完了: {race_data.get('race_id')} を Supabase に投入しました")

if __name__ == "__main__":
    main()
