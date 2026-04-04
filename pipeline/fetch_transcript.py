from youtube_transcript_api import YouTubeTranscriptApi
import sys

api = YouTubeTranscriptApi()

# URLから動画IDを取得
url = sys.argv[1] if len(sys.argv) > 1 else "6MWgP0eae90"
video_id = url.split("v=")[-1].split("&")[0].split("/")[-1].split("?")[0]

print(f"取得中: {video_id}")

fetched = api.fetch(video_id, languages=["ja"])
snippets = list(fetched)

# ファイル名は動画IDで保存
filename = f"transcript_{video_id}.txt"
with open(filename, "w", encoding="utf-8") as f:
    for s in snippets:
        f.write(f"[{int(s.start)}秒] {s.text}\n")

print(f"保存完了: {filename}（{len(snippets)}件）")
