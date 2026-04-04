from youtube_transcript_api import YouTubeTranscriptApi

api = YouTubeTranscriptApi()
video_id = "6MWgP0eae90"  # エキスポ競馬

try:
    # 利用可能な字幕の一覧を確認
    transcript_list = api.list(video_id)
    print("=== 利用可能な字幕 ===")
    for t in transcript_list:
        print(f"  言語: {t.language_code} | 自動生成: {t.is_generated}")
    print()

    # 日本語字幕を取得
    fetched = api.fetch(video_id, languages=["ja"])
    snippets = list(fetched)
    print(f"=== 取得成功: {len(snippets)}件 ===")
    print()
    print("--- 冒頭20件 ---")
    for s in snippets[:20]:
        print(f"[{int(s.start)}秒] {s.text}")

except Exception as e:
    print(f"エラー: {e}")
