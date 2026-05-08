あなたは優秀なフルスタックエンジニアです。
Next.js App Router、TypeScript、Tailwind CSSを使って、OpenAI APIを使わずにローカルLLM + ルールベースで動く「AI Overview診断ツール」の自分用MVPを作成してください。

# アプリの目的

ユーザーが記事本文を入力すると、AI OverviewやAI検索に引用されやすい構造になっているかを診断し、改善提案、FAQ案、メタディスクリプション案を表示するWebアプリを作成してください。

# 前提

- 自分用MVPとしてローカル環境で動けばよい
- SaaS化やログイン機能はまだ不要
- DBは不要
- OpenAI APIは使わない
- ローカルLLMはOllamaを使う
- Ollama APIのエンドポイントは http://localhost:11434/api/generate
- 使用モデル名は .env.local の OLLAMA_MODEL から読み込む
- 例：OLLAMA_MODEL=qwen3:latest

# 技術構成

- Next.js App Router
- TypeScript
- Tailwind CSS
- React
- Ollama API
- DBなし
- 認証なし

# 画面要件

app/page.tsx にメイン画面を作成してください。

画面には以下を配置してください。

1. アプリタイトル
   - AI Overview診断ツール

2. 説明文
   - OpenAI APIを使わず、ローカルLLMとルールベースで記事構造を診断するツールであることを説明する

3. 記事本文入力欄
   - textarea
   - 文字数が分かるようにする

4. 診断開始ボタン

5. 診断結果表示エリア
   - 総合スコア
   - 評価サマリー
   - 項目別スコア表
   - 改善すべき点
   - 具体的な改善提案
   - FAQ案
   - メタディスクリプション案

6. エラー表示
   - Ollamaが起動していない場合
   - モデルが存在しない場合
   - 本文が短すぎる場合
   - LLMのJSON出力が崩れた場合

# 診断の全体方針

診断は2段階で行ってください。

## 第1段階：ルールベース診断

プログラムで機械的に判定できる項目をスコア化してください。

チェック項目は以下です。

1. 本文文字数
   - 1,000文字未満：低評価
   - 1,000〜3,000文字：中評価
   - 3,000文字以上：高評価

2. 見出し数
   - Markdown見出し「#」「##」「###」またはHTML見出し「h2」「h3」を検出する
   - 見出しが少なすぎる場合は低評価

3. 質問型見出しの有無
   - 「とは」「なぜ」「方法」「どう」「いつ」「どこ」「いくら」「できますか」「必要か」などを含む見出しを検出する

4. 冒頭に結論があるか
   - 冒頭300文字以内に「結論」「つまり」「要するに」「〜です」「〜できます」などがあるかを簡易判定する

5. 箇条書きの有無
   - Markdownの「-」「・」やHTMLの「li」を検出する

6. 表の有無
   - Markdown表「|」またはHTMLの「table」を検出する

7. FAQの有無
   - 「FAQ」「よくある質問」「Q.」「Q：」「質問」などを検出する

8. 根拠・一次情報の有無
   - 「公式」「出典」「参考」「引用」「データ」「調査」「統計」「資料」「リンク」などを検出する

9. E-E-A-T要素の有無
   - 「実績」「事例」「経験」「監修」「運営者」「専門」「対応実績」「導入事例」などを検出する

10. 構造化データにしやすい要素の有無
    - FAQ、表、Q&A、箇条書き、比較表があるかを見る

# スコア計算

- 各項目を0〜10点で評価する
- 合計を100点満点に換算する
- 項目別にコメントを付ける
- スコアはルールベースで安定して算出する
- LLMには総合スコアを勝手に変更させない

# 第2段階：ローカルLLMによる改善提案

ルールベース診断結果と記事本文をOllamaに渡し、以下を生成してください。

- 評価サマリー
- 改善すべき点
- 具体的な改善提案
- FAQ案5個
- メタディスクリプション案3個

# Ollamaへの指示

Ollamaには、必ずJSON形式だけで返すように指示してください。

返却JSON形式は以下です。

{
"summary": "string",
"problems": ["string"],
"improvements": ["string"],
"faqIdeas": [
{
"question": "string",
"answer": "string"
}
],
"metaDescriptions": ["string"]
}

# APIルート

app/api/analyze/route.ts を作成してください。

このAPIでは以下を行ってください。

1. POSTで本文を受け取る
2. 本文が100文字未満ならエラーを返す
3. ルールベース診断を実行する
4. 診断結果と本文をOllamaへ送信する
5. Ollamaの回答JSONをパースする
6. JSONパースに失敗した場合でも、ルールベース診断結果だけは返す
7. 最終的に以下の形式で返す

{
"totalScore": number,
"ruleScores": [
{
"item": "string",
"score": number,
"comment": "string"
}
],
"summary": "string",
"problems": ["string"],
"improvements": ["string"],
"faqIdeas": [
{
"question": "string",
"answer": "string"
}
],
"metaDescriptions": ["string"],
"llmStatus": "success" | "fallback"
}

# Ollama接続

Ollamaへのリクエストは fetch で行ってください。

エンドポイント：
http://localhost:11434/api/generate

リクエスト例：
{
"model": process.env.OLLAMA_MODEL,
"prompt": "...",
"stream": false
}

# エラー処理

以下のケースに対応してください。

- Ollamaが起動していない
- OLLAMA_MODEL が .env.local に設定されていない
- モデル名が間違っている
- OllamaのレスポンスがJSONではない
- 本文が短すぎる
- 通信エラー

エラー文は日本語で分かりやすくしてください。

# UIデザイン

Tailwind CSSで、シンプルで見やすいデザインにしてください。

- 白背景
- カード形式
- 総合スコアを大きく表示
- 項目別スコアは表で表示
- 改善提案は箇条書き
- FAQ案はQ&A形式
- メタディスクリプション案はカード表示
- スマホでも見やすいレスポンシブ対応

# ファイル構成

以下のような構成にしてください。

app/
page.tsx
api/
analyze/
route.ts
lib/
ruleAnalyzer.ts
ollama.ts
types/
analysis.ts
.env.local.example
README.md

# 各ファイルの役割

## app/page.tsx

- 入力画面
- 診断ボタン
- 結果表示
- ローディング表示
- エラー表示

## app/api/analyze/route.ts

- APIエンドポイント
- 入力検証
- ルールベース診断
- Ollama呼び出し
- レスポンス整形

## lib/ruleAnalyzer.ts

- 文字数、見出し、FAQ、表、E-E-A-Tなどのルールベース診断
- 0〜10点の項目別スコアを返す
- totalScoreを100点満点で返す

## lib/ollama.ts

- Ollama API呼び出し
- プロンプト作成
- JSONパース
- 失敗時のfallback処理

## types/analysis.ts

- 型定義

## .env.local.example

以下を含める
OLLAMA_MODEL=qwen3:latest
OLLAMA_ENDPOINT=http://localhost:11434/api/generate

## README.md

初心者向けに以下を記載してください。

1. このアプリの概要
2. 必要なもの
   - Node.js
   - Ollama
   - ローカルLLMモデル
3. Ollamaのインストール
4. モデルの取得例
   - ollama pull qwen3:latest
5. Ollamaの起動確認
   - ollama list
   - curl http://localhost:11434/api/tags
6. npm install
7. .env.local の作成
8. npm run dev
9. ブラウザで http://localhost:3000 を開く
10. よくあるエラーと対処法

# 実装上の注意

- OpenAI APIは一切使わない
- APIキー入力欄も不要
- まずは自分用MVPとして動くことを優先する
- コードは初心者にも分かりやすくコメントを入れる
- JSONパースに失敗してもアプリ全体が落ちないようにする
- LLMの回答が不安定でも、ルールベース診断結果は必ず表示する
- TypeScriptの型エラーが出ないようにする
- ESLintで大きなエラーが出ないようにする

# 最終出力

以下を出力してください。

1. ファイル構成
2. 各ファイルのコード
3. インストール手順
4. .env.local の設定例
5. Ollamaの準備手順
6. 起動手順
7. 動作確認方法
8. よくあるエラーと対処法
