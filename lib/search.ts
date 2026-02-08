/**
 * Search implementation with DuckDuckGo HTML scraping + stub fallback.
 *
 * SEARCH_PROVIDER env var controls behaviour:
 *   "duckduckgo" — scrape DDG HTML; fall back to stub on failure
 *   "stub"       — always return deterministic fake results
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResponse {
  results: SearchResult[];
  search_mode: "duckduckgo" | "stub" | "fallback_stub";
}

// ---------------------------------------------------------------------------
// Stub results (deterministic, for demo / fallback)
// ---------------------------------------------------------------------------
function stubResults(query: string): SearchResult[] {
  return [
    {
      title: `${query} — Wikipedia`,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
      snippet: `Comprehensive overview of ${query} from the free encyclopedia.`,
    },
    {
      title: `${query} — Latest News`,
      url: `https://news.ycombinator.com/item?id=00000`,
      snippet: `Discussion and latest developments about ${query} on Hacker News.`,
    },
    {
      title: `Understanding ${query} — A Beginner's Guide`,
      url: `https://example.com/guide/${encodeURIComponent(query)}`,
      snippet: `Learn everything you need to know about ${query} in this guide.`,
    },
    {
      title: `${query} | Research Papers`,
      url: `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`,
      snippet: `Academic papers and citations related to ${query}.`,
    },
    {
      title: `${query} — Reddit Discussion`,
      url: `https://www.reddit.com/search/?q=${encodeURIComponent(query)}`,
      snippet: `Community discussion and opinions about ${query}.`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Strip HTML tags and decode common entities
// ---------------------------------------------------------------------------
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Extract the real URL from a DuckDuckGo redirect link
// ---------------------------------------------------------------------------
function extractDdgUrl(raw: string): string {
  const uddg = raw.match(/[?&]uddg=([^&]+)/);
  if (uddg) return decodeURIComponent(uddg[1]);
  if (raw.startsWith("//")) return "https:" + raw;
  return raw;
}

// ---------------------------------------------------------------------------
// Scrape DuckDuckGo HTML search
// ---------------------------------------------------------------------------
async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo returned HTTP ${response.status}`);
  }

  const html = await response.text();
  const results: SearchResult[] = [];

  // Split into result blocks — each web result has class="result results_links"
  const blocks = html.split(/class="result\s+results_links/);

  for (const block of blocks.slice(1)) {
    if (results.length >= 5) break;

    // href from <a class="result__a" href="...">
    const hrefMatch = block.match(/class="result__a"[^>]*href="([^"]+)"/);
    // Title text inside <a class="result__a">...</a>
    const titleMatch = block.match(
      /class="result__a"[^>]*>([\s\S]*?)<\/a>/
    );
    // Snippet from <a class="result__snippet"> or <span class="result__snippet">
    const snippetMatch = block.match(
      /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|span|div)>/
    );

    if (hrefMatch && titleMatch) {
      const resultUrl = extractDdgUrl(hrefMatch[1]);
      const title = stripHtml(titleMatch[1]);
      const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : "";

      if (title && resultUrl && !resultUrl.includes("duckduckgo.com")) {
        results.push({ title, url: resultUrl, snippet });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public API: execute a search
// ---------------------------------------------------------------------------
export async function executeSearch(query: string): Promise<SearchResponse> {
  const provider = (process.env.SEARCH_PROVIDER || "duckduckgo").toLowerCase();

  // Stub mode — always return fake results
  if (provider === "stub") {
    return { results: stubResults(query), search_mode: "stub" };
  }

  // DuckDuckGo mode — attempt real search, fall back to stub on failure
  try {
    const results = await searchDuckDuckGo(query);
    if (results.length === 0) throw new Error("No results parsed");
    return { results, search_mode: "duckduckgo" };
  } catch (err) {
    console.error(
      "[search] DuckDuckGo scraping failed, falling back to stub:",
      (err as Error).message
    );
    return { results: stubResults(query), search_mode: "fallback_stub" };
  }
}
