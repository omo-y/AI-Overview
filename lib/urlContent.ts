type FetchUrlResult = {
  text: string;
  finalUrl: string;
};

const MAX_EXTRACTED_LENGTH = 20_000;

function decodeHtmlEntities(text: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " "
  };

  return text
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith("#x")) {
        return String.fromCharCode(Number.parseInt(entity.slice(2), 16));
      }

      if (entity.startsWith("#")) {
        return String.fromCharCode(Number.parseInt(entity.slice(1), 10));
      }

      return namedEntities[entity.toLowerCase()] ?? match;
    })
    .replace(/\u00a0/g, " ");
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/[ \t]+/g, " ")
    .trim();
}

function extractTitle(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? stripTags(title) : "";
}

function extractMetaDescription(html: string): string {
  const meta = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i
  )?.[1];

  if (meta) {
    return decodeHtmlEntities(meta).trim();
  }

  const reversedMeta = html.match(
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i
  )?.[1];

  return reversedMeta ? decodeHtmlEntities(reversedMeta).trim() : "";
}

function htmlToDiagnosticText(html: string): string {
  const title = extractTitle(html);
  const metaDescription = extractMetaDescription(html);
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;

  const structured = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, content: string) => {
      return `\n# ${stripTags(content)}\n`;
    })
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, content: string) => {
      return `\n## ${stripTags(content)}\n`;
    })
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, content: string) => {
      return `\n### ${stripTags(content)}\n`;
    })
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, content: string) => {
      return `\n- ${stripTags(content)}\n`;
    })
    .replace(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi, (_, content: string) => {
      return `| ${stripTags(content)} `;
    })
    .replace(/<\/tr>/gi, "|\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/section>/gi, "\n")
    .replace(/<\/article>/gi, "\n");

  const mainText = stripTags(structured)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return [title ? `# ${title}` : "", metaDescription, mainText]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_EXTRACTED_LENGTH);
}

function parseHttpUrl(url: string): URL {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URLの形式が正しくありません。https:// から始まるURLを入力してください。");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("URLは http または https のページを指定してください。");
  }

  return parsed;
}

export async function fetchTextFromUrl(url: string): Promise<FetchUrlResult> {
  const parsedUrl = parseHttpUrl(url.trim());
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        Accept: "text/html, text/plain;q=0.9, */*;q=0.8",
        "User-Agent": "AI-Overview-Diagnostic-MVP/0.1"
      },
      redirect: "follow",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(
        `ページ取得に失敗しました。HTTPステータス: ${response.status}`
      );
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain")
    ) {
      throw new Error("HTMLまたはテキストページではないため診断できません。");
    }

    const rawText = await response.text();
    const text = contentType.includes("text/plain")
      ? rawText.trim().slice(0, MAX_EXTRACTED_LENGTH)
      : htmlToDiagnosticText(rawText);

    if (text.length < 100) {
      throw new Error(
        "URLから本文を十分に抽出できませんでした。本文入力欄に直接貼り付けて診断してください。"
      );
    }

    return {
      text,
      finalUrl: response.url || parsedUrl.toString()
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("ページ取得がタイムアウトしました。URLを確認してください。");
    }

    throw error instanceof Error
      ? error
      : new Error("URLのページ取得中に不明なエラーが発生しました。");
  } finally {
    clearTimeout(timeoutId);
  }
}
