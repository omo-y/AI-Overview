# 変更履歴

## 2026-05-14

- Supabase Authによるログイン必須化を追加
- 診断実行APIと診断履歴APIでBearerトークン検証を追加
- 診断履歴をログインユーザーの `user_id` に紐づけて保存するように変更
- 高スコアサイト5選に「自分だけ / 全体」の切り替えを追加
- 全体ランキングは `is_public = true` のURL診断のみ対象に変更
- 全体ランキングでは本文プレビューとサマリーを返さず、URL・スコア・日時だけを表示する方針に変更
- Supabase用SQLに `is_public`、RLS、本人用ポリシー、インデックスを追加
- `.env.local.example` に `NEXT_PUBLIC_SUPABASE_ANON_KEY` を追加
- READMEをSupabase Auth + Postgres構成に合わせて更新

## 2026-05-15

- 月間診断回数制限を追加
- `usage_events` テーブルで診断実行を記録するように変更
- `/api/usage` を追加し、今月の使用回数を画面に表示
- URL診断にSSRF対策を追加
- `localhost`、プライベートIP、リンクローカルIP、特殊ポート、内部URLへのリダイレクトをブロック
- Supabase Authのパスワードリセット導線を追加
- READMEとSupabase SQLを更新

## これまでの主な変更

- Next.js App Router、TypeScript、Tailwind CSSでMVPを作成
- OpenAI APIを使わず、Ollama APIでローカルLLM連携を実装
- 文字数、見出し、FAQ、表、根拠、E-E-A-Tなどのルールベース診断を実装
- URLを指定してHTMLから診断対象テキストを抽出できるように変更
- OllamaのJSON出力が崩れた場合でもルールベース診断を表示するfallbackを実装
- AI Overviews関連の公開情報を踏まえた追加診断ルールを実装
- localStorage保存からSQLite + Prisma保存へ変更
- SQLite + Prisma保存からSupabase Postgres保存へ変更
- 診断履歴と高スコアサイト5選をタブで切り替えられるUIを追加
