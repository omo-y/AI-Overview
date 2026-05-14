# AI Overview診断ツール

OpenAI APIを使わず、ローカルLLM（Ollama）とルールベース診断で記事構造を評価するNext.js製のMVPです。

URLまたは本文を入力すると、AI OverviewやAI検索で引用されやすい構造になっているかを診断し、改善提案、FAQ案、メタディスクリプション案を表示します。

## 主な機能

- URL診断、本文診断
- ルールベースの安定スコア算出
- Ollamaによる改善提案生成
- Supabase Authによるログイン必須化
- Supabase Postgresへの診断履歴保存
- 自分の診断履歴の最新5件表示
- 高スコアサイト5選の「自分だけ / 全体」切り替え
- 全体ランキングは、ユーザーが公開許可したURL診断のみ表示

## 必要なもの

- Node.js
- npm
- Ollama
- ローカルLLMモデル（例: `qwen3:latest`）
- Supabaseプロジェクト

## セットアップ

```bash
npm install
```

`.env.local` を作成します。

```env
OLLAMA_MODEL=qwen3:latest
OLLAMA_ENDPOINT=http://localhost:11434/api/generate
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` はブラウザ側のログイン処理で使います。`SUPABASE_SERVICE_ROLE_KEY` はサーバー側だけで使い、ブラウザに出してはいけません。

## Ollamaの準備

```bash
ollama pull qwen3:latest
ollama list
curl http://localhost:11434/api/tags
```

## Supabaseの準備

1. Supabaseプロジェクトを作成する
2. Authentication > Providers で Email を有効化する
3. すぐ試す場合は Email Confirmations を無効にする
4. SQL Editorで `supabase/schema.sql` の内容を実行する
5. Table Editorで `diagnosis_histories` が作成されたことを確認する

既存テーブルがある場合も、`supabase/schema.sql` には不足カラムを追加するSQLを含めています。

## RLSについて

`diagnosis_histories` はRLSを有効化します。

- ログインユーザーは自分の履歴だけ読める
- ログインユーザーは自分の `user_id` の履歴だけ追加できる
- 全体ランキングはNext.js API Route経由で取得する
- ブラウザには全体ランキング用としてURL、スコア、診断日時だけを返す

全体ランキングに本文プレビューやサマリーを出すと、ユーザーが入力した情報が意図せず公開される可能性があります。そのため、このMVPでは全体表示の情報量を絞っています。

## 起動

```bash
npm run dev
```

ブラウザで開きます。

```text
http://localhost:3000
```

## 動作確認

1. アカウントを作成またはログインする
2. URLまたは本文を入力する
3. 診断を実行する
4. 診断結果が表示されることを確認する
5. 診断履歴に保存されることを確認する
6. URL診断時に「全体の高スコアサイト5選に含める」をオンにして診断する
7. 高スコアサイト5選で「自分だけ」と「全体」を切り替える

## よくあるエラー

### ログインできない

`.env.local` の `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を確認してください。Supabase側でEmailログインが有効かも確認してください。

### 診断履歴の保存に失敗する

`SUPABASE_SERVICE_ROLE_KEY`、`diagnosis_histories` テーブル、`is_public` カラム、`user_id` カラムを確認してください。SQL Editorで `supabase/schema.sql` を実行してください。

### Ollamaに接続できない

Ollamaが起動しているか確認してください。

```bash
curl http://localhost:11434/api/tags
```

### モデルが存在しない

`.env.local` の `OLLAMA_MODEL` と `ollama list` のモデル名が一致しているか確認してください。

```bash
ollama pull qwen3:latest
```

### LLMのJSON出力が崩れる

アプリはJSON抽出に失敗しても、ルールベース診断結果を表示します。もう一度診断するか、別のOllamaモデルを試してください。

## ファイル構成

```text
app/
  globals.css
  layout.tsx
  page.tsx
  api/
    analyze/
      route.ts
    history/
      route.ts
      top-sites/
        route.ts
lib/
  aiOverviewKnowledge.ts
  ollama.ts
  ruleAnalyzer.ts
  supabaseAdmin.ts
  supabaseAuth.ts
  urlContent.ts
supabase/
  schema.sql
types/
  analysis.ts
.env.local.example
README.md
```
