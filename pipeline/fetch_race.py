import requests
from bs4 import BeautifulSoup
import json
import sys

headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}

race_id = sys.argv[1] if len(sys.argv) > 1 else "202607010201"
url = f"https://race.netkeiba.com/race/result.html?race_id={race_id}"

res = requests.get(url, headers=headers)
res.encoding = "EUC-JP"
soup = BeautifulSoup(res.text, "html.parser")

race_number = int(race_id[-2:])

race_info = soup.select_one(".RaceData01")
race_data = soup.select_one(".RaceData02")
print("=== レース情報 ===")
if race_info:
    print(race_info.text.strip()[:100])
if race_data:
    print(race_data.text.strip()[:100])
print()

kai_nichi = ""
if race_data:
    spans = race_data.select("span")
    parts = [s.text.strip() for s in spans if s.text.strip()]
    kai_nichi = " ".join(parts[:3]) if len(parts) >= 3 else " ".join(parts)

table = soup.select_one(".RaceTable01")
rows = table.select("tr")[1:]

results = []
for row in rows:
    cols = row.select("td")
    if len(cols) < 13:
        continue
    results.append({
        "finish_order":   cols[0].text.strip(),
        "frame_number":   cols[1].text.strip(),
        "umaban":         cols[2].text.strip(),
        "horse_name":     cols[3].text.strip(),
        "weight_carried": cols[5].text.strip(),
        "jockey":         cols[6].text.strip(),
        "time":           cols[7].text.strip(),
        "margin":         cols[8].text.strip(),
        "position_order": cols[12].text.strip(),
        "horse_weight":   cols[14].text.strip() if len(cols) > 14 else "",
    })

print(f"race_number: {race_number}")
print(f"kai_nichi: {kai_nichi}")
print(json.dumps(results, ensure_ascii=False, indent=2))
