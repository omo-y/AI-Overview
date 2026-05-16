# AI Overview診断ツール

OpenAI APIを使わず、ローカルLLM（Ollama）とルールベース診断で記事構造を評価するNext.js製のMVPです。

URLまたは本文を入力すると、AI OverviewやAI検索に引用されやすい構造になっているかを診断し、改善提案、FAQ案、メタディスクリプション案を表示します。ログイン、Supabaseへの履歴保存、利用回数制限、AI Overview実測チェックにも対応しています。

## 主な機能

- URL診断、本文診断
- ルールベースの安定スコア計算
- Ollamaによる改善提案生成
- Supabase Authによるログイン必須化
- Supabase Postgresへの診断履歴保存
- 自分の診断履歴の最新5件表示
- 高スコアサイト5選の「自分だけ / 全体」切り替え
- 全体ランキングは公開許可されたURL診断だけを表示
- 月間診断回数制限
- 管理者パネルでユーザー別の診断回数確認とリセット
- URL診断のSSRF対策
- 記事から想定クエリを抽出するAI Overview実測チェック
- SerpApi設定時のみ、編集後の確定クエリでAI Overview実測
- AI Overview実測チェック結果をSupabaseに保存

## 必要なもの

- Node.js
- npm
- Ollama
- ローカルLLMモデル（例: `qwen3:latest`）
- Supabaseプロジェクト
- SerpApi APIキー（AI Overview実測チェックを使う場合のみ）

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
MONTHLY_DIAGNOSIS_LIMIT=10
SERPAPI_API_KEY=
AIO_QUERY_CHECK_LIMIT=5
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` はブラウザ側のログイン処理で使います。`SUPABASE_SERVICE_ROLE_KEY` はサーバー側だけで使い、ブラウザには出さないでください。

`SERPAPI_API_KEY` は任意です。未設定でも想定クエリ候補の抽出と編集はできます。設定すると「実測チェックを実行」ボタンから、編集後の確定クエリだけをSerpApi経由で確認できます。

## Ollamaの準備

```bash
ollama pull qwen3:latest
ollama list
curl http://localhost:11434/api/tags
```

## Supabaseの準備

1. Supabaseプロジェクトを作成する
2. Authentication > Providers で Email を有効化する
3. 開発中は必要に応じて Email Confirmations を無効化する
4. SQL Editorで `supabase/schema.sql` の内容を実行する
5. Table Editorで以下のテーブルが作成されたことを確認する
   - `profiles`
   - `diagnosis_histories`
   - `usage_events`
   - `aio_query_researches`

パスワードリセットをローカルで確認する場合は、Authentication > URL Configuration で以下を許可してください。

```text
Site URL: http://localhost:3000
Redirect URLs: http://localhost:3000
```

既存テーブルがある場合でも、`supabase/schema.sql` には不足カラムを追加するSQLを含めています。

## RLSについて

以下のテーブルはRLSを有効化しています。

- `profiles`
- `diagnosis_histories`
- `usage_events`
- `aio_query_researches`

ログインユーザーは自分のデータだけを読めます。診断履歴やAI Overview実測結果の保存はNext.js API Route経由で実行します。

全体ランキングは、`diagnosis_histories.is_public = true` のURL診断だけをNext.js API Route経由で取得します。ブラウザにはURL、スコア、日時だけを返し、本文プレビューやサマリーは公開しません。

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
8. AI Overview実測チェックの想定クエリを編集する
9. `SERPAPI_API_KEY` を設定している場合は「実測チェックを実行」を押す
10. Supabase Table Editorで `aio_query_researches` に実測結果が保存されることを確認する

## 利用回数制限

診断が成功すると `usage_events` に `action = diagnosis` のレコードを保存します。

月間上限は `.env.local` の `MONTHLY_DIAGNOSIS_LIMIT` で変更できます。未設定の場合は月10回です。

```env
MONTHLY_DIAGNOSIS_LIMIT=10
```

管理者ユーザーでログインすると、管理者パネルからユーザーごとの今月の診断回数を確認し、対象ユーザーの今月分だけをリセットできます。診断履歴は削除されません。

## AI Overview実測チェック

診断後に記事タイトル、見出し、FAQ、検索意図タイプから想定クエリ候補を最大10件抽出します。

抽出されたクエリは画面で編集できます。API料金の無駄を防ぐため、診断直後に自動実測はしません。「実測チェックを実行」を押したときだけ、編集後の確定クエリをSerpApiで確認します。

表示する主な指標は以下です。

- 自サイト引用率: 実測クエリのうち、AI Overview内で診断対象URLが引用・参照された割合
- AI Overview出現: 実測クエリのうち、AI Overviewが表示された件数
- 実測クエリ数: 実際にGoogle検索で確認したクエリ数
- AI Overview引用元URL: AI Overviewが表示されたときの参照元。競合記事の構造比較に使う

実測結果は `aio_query_researches` に保存されます。検索結果は地域、言語、日時で変わるため、診断履歴とは別テーブルに日時付きで残します。

## 管理者設定

管理者にしたいユーザーのIDとメールアドレスを Supabase の `auth.users` で確認し、SQL Editorで以下を実行します。

```sql
insert into profiles (user_id, email, role)
values ('ここにユーザーID', 'user@example.com', 'admin')
on conflict (user_id) do update set email = excluded.email, role = 'admin';
```

一般ユーザーは Supabase Authentication に登録されていれば管理者パネルに表示されます。`profiles` は権限管理用なので、管理者にしたいユーザーだけ `role = admin` を設定します。

## URL診断のSSRF対策

URL診断では以下をブロックします。

- `localhost`
- `.localhost`
- プライベートIP
- ループバックIP
- リンクローカルIP
- 80番、443番以外のポート
- 内部URLへリダイレクトするページ

これにより、SaaS化時にユーザー入力URLから内部ネットワークへアクセスされるリスクを下げます。

## よくあるエラー

### ログインできない

`.env.local` の `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を確認してください。Supabase側でEmailログインが有効かも確認してください。

### 診断履歴の保存に失敗する

`SUPABASE_SERVICE_ROLE_KEY`、`diagnosis_histories` テーブル、`is_public` カラム、`user_id` カラムを確認してください。SQL Editorで `supabase/schema.sql` を実行してください。

### AI Overview実測結果の保存に失敗する

`aio_query_researches` テーブルが作成されていない可能性があります。SQL Editorで `supabase/schema.sql` を再実行してください。実測結果は画面に表示されますが、DBには残りません。

### 利用回数の取得に失敗する

`usage_events` テーブルが作成されているか確認してください。SQL Editorで `supabase/schema.sql` を実行してください。

### 管理者パネルが表示されない

`profiles` テーブルにログイン中ユーザーの `role = admin` が設定されているか確認してください。

### 管理者パネルにユーザーが表示されない

`SUPABASE_SERVICE_ROLE_KEY` が正しく設定されているか確認してください。管理者パネルのユーザー一覧は Supabase Auth Admin API から取得します。

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
    aio-research/
      route.ts
    history/
      route.ts
      top-sites/
        route.ts
    usage/
      route.ts
    admin/
      me/
        route.ts
      users/
        route.ts
      usage/
        reset/
          route.ts
lib/
  aioQueryResearch.ts
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
