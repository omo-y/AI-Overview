import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { isIP } from "node:net";

type FetchUrlResult = {
  text: string;
  finalUrl: string;
};

const MAX_EXTRACTED_LENGTH = 20_000;
const MAX_REDIRECTS = 3;
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
    throw new Error("URLは http または https のページを指定してください。");
  }

  if (parsed.username || parsed.password) {
    throw new Error("ユーザー名やパスワードを含むURLは診断できません。");
  }

  if (!ALLOWED_PORTS.has(parsed.port)) {
    throw new Error("80番または443番以外のポートを指定したURLは診断できません。");
  }

  return parsed;
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
    throw new Error("ローカルホストや内部ネットワークのURLは診断できません。");
  }

  if (isIP(hostname) && isBlockedIpAddress(hostname)) {
    throw new Error("ローカルホストや内部ネットワークのURLは診断できません。");
  }

  let addresses: LookupAddress[];

  try {
    addresses = await lookup(hostname, {
      all: true,
      verbatim: true
    });
  } catch {
    throw new Error("URLのホスト名を解決できませんでした。");
  }

  if (addresses.length === 0) {
    throw new Error("URLのホスト名を解決できませんでした。");
  }

  if (addresses.some((address) => isBlockedIpAddress(address.address))) {
    throw new Error("ローカルホストや内部ネットワークに接続するURLは診断できません。");
  }
}

async function fetchWithSafeRedirects(
  initialUrl: URL,
  signal: AbortSignal
): Promise<Response> {
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
      return response;
    }

    const location = response.headers.get("location");

    if (!location) {
      return response;
    }

    currentUrl = parseHttpUrl(new URL(location, currentUrl).toString());
  }

  throw new Error("リダイレクトが多すぎるため、URL診断を中止しました。");
}

export async function fetchTextFromUrl(url: string): Promise<FetchUrlResult> {
  const parsedUrl = parseHttpUrl(url.trim());
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetchWithSafeRedirects(parsedUrl, controller.signal);

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
