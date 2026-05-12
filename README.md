# AI Overview診断ツール

OpenAI APIを使わず、ローカルLLMのOllamaとルールベース診断で記事構造をチェックする自分用MVPです。

診断対象ページのURLまたは記事本文を入力すると、AI OverviewやAI検索に引用されやすい構造になっているかを100点満点で診断し、改善提案、FAQ案、メタディスクリプション案を表示します。

## 必要なもの

- Node.js 18.17以上
- npm
- Ollama
- Ollamaで使うローカルLLMモデル
- SQLite
- Prisma

## Ollamaのインストール

Ollama公式サイトから、利用中のOSに合わせてインストールしてください。

https://ollama.com/

## モデルの取得例

このREADMEでは `qwen3:latest` を例にします。

```bash
ollama pull qwen3:latest
```

別のモデルを使う場合は、`.env.local` の `OLLAMA_MODEL` も同じモデル名に変更してください。

## Ollamaの起動確認

インストール済みモデルを確認します。

```bash
ollama list
```

Ollama APIが応答するか確認します。

```bash
curl http://localhost:11434/api/tags
```

JSONが返ればOllamaのAPIは起動しています。

## セットアップ

依存関係をインストールします。

```bash
npm install
```

`.env.local.example` をコピーして `.env.local` を作成します。

```bash
cp .env.local.example .env.local
```

Windows PowerShellの場合:

```powershell
Copy-Item .env.local.example .env.local
```

## .env.local の設定例

```env
OLLAMA_MODEL=qwen3:latest
OLLAMA_ENDPOINT=http://localhost:11434/api/generate
DATABASE_URL="file:./dev.db"
```

`OLLAMA_ENDPOINT` は省略しても、標準値として `http://localhost:11434/api/generate` を使います。

Prisma CLIでマイグレーションを実行する場合は、`.env` にも同じ `DATABASE_URL` を設定してください。

```env
DATABASE_URL="file:./dev.db"
```

## DB保存の準備

診断履歴はブラウザのlocalStorageではなく、SQLite + Prismaに保存します。

Prisma関連パッケージをインストールします。

```bash
npm install prisma @prisma/client
```

Prismaを初期化していない場合は、以下を実行します。

```bash
npx prisma init
```

このプロジェクトでは `prisma/schema.prisma` を用意済みです。`DATABASE_URL` は `.env` または `.env.local` に設定してください。

```env
DATABASE_URL="file:./dev.db"
```

マイグレーションを実行します。

```bash
npx prisma migrate dev --name init
```

既にDB作成済みで、診断履歴に診断URL列を追加する場合は、追加マイグレーションを実行します。

```bash
npx prisma migrate dev --name add_source_url_to_diagnosis_history
```

Prisma Clientを生成します。通常はマイグレーション時に生成されますが、必要に応じて実行してください。

```bash
npx prisma generate
```

DB内容を確認する場合は Prisma Studio を起動します。

```bash
npx prisma studio
```

ブラウザでPrisma Studioが開き、`DiagnosisHistory` テーブルの保存内容を確認できます。

## 起動手順

開発サーバーを起動します。

```bash
npm run dev
```

ブラウザで以下を開きます。

http://localhost:3000

## 動作確認方法

1. 「URLで診断」を選び、診断したい記事ページのURLを入力する
2. または「本文で診断」を選び、「サンプル本文を入れる」を押す
3. 「診断開始」を押す
4. 総合スコア、項目別スコア表、改善提案、FAQ案、メタディスクリプション案が表示されることを確認する
5. 画面下部の診断履歴に、最新5件の履歴と診断URLが表示されることを確認する
6. Ollamaが停止している状態でも、ルールベース診断結果が表示されることを確認する

## よくあるエラーと対処法

### 本文が短すぎます

本文が100文字未満です。診断したい記事本文を100文字以上入力してください。

### URLの形式が正しくありません

`https://example.com/article` のように、`http://` または `https://` から始まるURLを入力してください。

### URLから本文を十分に抽出できませんでした

ページ本文がJavaScriptで後から描画されている、ログインが必要、本文量が少ない、またはHTML構造が特殊な可能性があります。

この場合は「本文で診断」に切り替えて、記事本文を直接貼り付けてください。

### HTMLまたはテキストページではないため診断できません

PDF、画像、動画、ダウンロードファイルなどは直接診断できません。HTMLの記事ページURLを指定してください。

### .env.localにOLLAMA_MODELが設定されていません

`.env.local` を作成し、以下のようにモデル名を設定してください。

```env
OLLAMA_MODEL=qwen3:latest
```

### Ollamaに接続できません

Ollamaが起動していない可能性があります。以下を確認してください。

```bash
curl http://localhost:11434/api/tags
```

応答がない場合は、Ollamaアプリを起動してください。

### 指定されたOllamaモデルが見つかりません

`.env.local` の `OLLAMA_MODEL` と、実際に取得済みのモデル名が一致していない可能性があります。

```bash
ollama list
```

必要なモデルがなければ取得します。

```bash
ollama pull qwen3:latest
```

### LLMのJSON出力が崩れました

LLMが指示どおりのJSONだけを返せなかった状態です。この場合でも、アプリは落ちずにルールベース診断結果を表示します。

同じ本文でもう一度診断するか、別のモデルを試してください。

### 通信エラーが発生しました

Next.jsの開発サーバーが起動しているか確認してください。

```bash
npm run dev
```

### 診断履歴の取得に失敗しました

SQLite DBまたはPrisma Clientの準備ができていない可能性があります。

```bash
npx prisma migrate dev --name init
npx prisma generate
```

`DATABASE_URL="file:./dev.db"` が `.env` または `.env.local` に設定されているか確認してください。

### 診断履歴の保存に失敗しました

診断結果自体は表示されていますが、DB保存に失敗しています。DBファイルの作成権限、Prismaのマイグレーション状態、`DATABASE_URL` を確認してください。

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
  prisma.ts
  ruleAnalyzer.ts
  ollama.ts
  urlContent.ts
prisma/
  schema.prisma
types/
  analysis.ts
.env.local.example
README.md
```

## 実装メモ

- OpenAI APIは使っていません。
- APIキー入力欄もありません。
- URL診断ではHTMLを取得し、タイトル、メタディスクリプション、見出し、本文、箇条書き、表をテキスト化して診断します。
- Google Search CentralのAI Overviews / AI Mode向け公式方針を、ローカルの診断ルールとして反映しています。
- 診断実行ごとの外部検索は行わず、安定性を優先して公式情報ベースの固定ルールを使います。
- 2026年5月7日以降、Google検索でFAQリッチリザルトは表示されない方針になったため、FAQはリッチリザルト目的ではなく、AI検索が質問と回答の対応関係を理解しやすくする本文構造として評価します。
- AIO対策の実務観点として、How-to・手順構造、独自性・一次性、SEO/AIO両立もルールベース診断に含めています。
- AI Overviewsで参照されやすい構成として、冒頭の要点・根拠ブロック、代替案・例外対応も診断に含めています。
- 診断履歴はSQLite + Prismaに保存します。
- 履歴はDBにはすべて保存し、画面には最新5件だけ表示します。
- URL診断の場合は診断URLも履歴に保存します。本文入力の場合は「本文入力」と表示します。
- 診断データ表示は「診断履歴」と「高スコアサイト5選」をタブで切り替えできます。高スコアサイト5選はURL診断履歴だけを対象にし、同じURLは最高スコアの1件だけ表示します。
- 自分用MVPのためログイン機能とユーザーIDはありません。SaaS化する場合は `DiagnosisHistory` に `userId` を追加してください。
- スコアはルールベースで固定的に計算します。
- LLMには総合スコアを変更させません。
- LLM呼び出しに失敗しても、ルールベース診断結果は表示されます。
