import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type FetchUrlResult = {
  text: string;
  finalUrl: string;
  warnings: string[];
};

const MAX_EXTRACTED_LENGTH = 20_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 12_000;
const ALLOWED_PORTS = new Set(["", "80", "443"]);
const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

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
    throw new Error(
      "URLの形式が正しくありません。https:// から始まるURLを入力してください。"
    );
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("URLは http または https のページのみ診断できます。");
  }

  if (parsed.username || parsed.password) {
    throw new Error(
      "ユーザー名やパスワードを含むURLは診断できません。"
    );
  }

  if (!ALLOWED_PORTS.has(parsed.port)) {
    throw new Error("80番または443番以外のポートを指定したURLは診断できません。");
  }

  return parsed;
}

function isProbablyDomainOnlyUrl(url: URL) {
  return (
    (url.pathname === "" || url.pathname === "/") &&
    url.search.length === 0 &&
    url.hash.length === 0
  );
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }

  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();

  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:192.168.") ||
    /^::ffff:172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
  );
}

function isBlockedIpAddress(address: string): boolean {
  const version = isIP(address);

  if (version === 4) {
    return isPrivateIpv4(address);
  }

  if (version === 6) {
    return isPrivateIpv6(address);
  }

  return true;
}

async function validatePublicHttpUrl(url: URL) {
  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) {
    throw new Error(
      "localhostや内部ネットワークのURLは診断できません。公開されている記事URLを指定してください。"
    );
  }

  if (isIP(hostname) && isBlockedIpAddress(hostname)) {
    throw new Error(
      "localhostや内部ネットワークのURLは診断できません。公開されている記事URLを指定してください。"
    );
  }

  let addresses: LookupAddress[];

  try {
    addresses = await lookup(hostname, {
      all: true,
      verbatim: true
    });
  } catch {
    throw new Error("URLのホスト名を解決できませんでした。URLを確認してください。");
  }

  if (addresses.length === 0) {
    throw new Error("URLのホスト名を解決できませんでした。URLを確認してください。");
  }

  if (addresses.some((address) => isBlockedIpAddress(address.address))) {
    throw new Error(
      "内部ネットワークに接続するURLは診断できません。公開されている記事URLを指定してください。"
    );
  }
}

async function readResponseTextWithLimit(response: Response) {
  const contentLength = response.headers.get("content-length");

  if (contentLength && Number.parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
    throw new Error(
      "対象ページのサイズが大きすぎるため診断できません。記事ページのURLを指定してください。"
    );
  }

  if (!response.body) {
    return response.text();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    receivedBytes += value.length;

    if (receivedBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error(
        "対象ページのサイズが大きすぎるため診断できません。記事ページのURLを指定してください。"
      );
    }

    chunks.push(value);
  }

  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

async function fetchWithSafeRedirects(
  initialUrl: URL,
  signal: AbortSignal
): Promise<{ response: Response; finalUrl: URL; redirectCount: number }> {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await validatePublicHttpUrl(currentUrl);

    const response = await fetch(currentUrl.toString(), {
      headers: {
        Accept: "text/html, text/plain;q=0.9, */*;q=0.8",
        "User-Agent": "AI-Overview-Diagnostic-MVP/0.1"
      },
      redirect: "manual",
      signal
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return {
        response,
        finalUrl: currentUrl,
        redirectCount
      };
    }

    const location = response.headers.get("location");

    if (!location) {
      return {
        response,
        finalUrl: currentUrl,
        redirectCount
      };
    }

    currentUrl = parseHttpUrl(new URL(location, currentUrl).toString());
  }

  throw new Error(
    "リダイレクトが多すぎるためURL診断を中止しました。記事の最終URLを直接指定してください。"
  );
}

export async function fetchTextFromUrl(url: string): Promise<FetchUrlResult> {
  const parsedUrl = parseHttpUrl(url.trim());
  const warnings: string[] = [];

  if (isProbablyDomainOnlyUrl(parsedUrl)) {
    warnings.push(
      "ドメイン直下のURLです。トップページの可能性があるため、記事ページURLを指定すると診断精度が上がります。"
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const { response, finalUrl, redirectCount } = await fetchWithSafeRedirects(
      parsedUrl,
      controller.signal
    );

    if (redirectCount > 0) {
      warnings.push(
        `入力URLから${redirectCount}回リダイレクトされました。診断には最終URLを使用しています。`
      );
    }

    if (isProbablyDomainOnlyUrl(finalUrl) && !isProbablyDomainOnlyUrl(parsedUrl)) {
      warnings.push(
        "リダイレクト後のURLがドメイン直下です。記事本文ではなくトップページを診断している可能性があります。"
      );
    }

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
      throw new Error(
        "HTMLまたはテキストのページではないため診断できません。記事ページのURLを指定してください。"
      );
    }

    const rawText = await readResponseTextWithLimit(response);
    const text = contentType.includes("text/plain")
      ? rawText.trim().slice(0, MAX_EXTRACTED_LENGTH)
      : htmlToDiagnosticText(rawText);

    if (text.length < 100) {
      throw new Error(
        "URLから本文を十分に抽出できませんでした。記事本文を直接貼り付けて診断してください。"
      );
    }

    return {
      text,
      finalUrl: finalUrl.toString(),
      warnings
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "対象URLの応答に時間がかかりすぎたため診断できませんでした。URLやサイトの状態を確認してください。"
      );
    }

    throw error instanceof Error
      ? error
      : new Error("URLのページ取得中に不明なエラーが発生しました。");
  } finally {
    clearTimeout(timeoutId);
  }
}
