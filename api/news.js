// Vercel serverless function: fetches crypto RSS feeds and returns clean JSON.
// Cached at Vercel's edge for 24h, so news refreshes once a day automatically.

const FEEDS = [
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  // Decrypt also publishes AI/tech news, and Yahoo's BTC feed mixes in stock-market stories,
  // so only crypto-related items are kept from these two (filter: true).
  { name: "Decrypt", url: "https://decrypt.co/feed", filter: true },
  { name: "Yahoo Finance", url: "https://finance.yahoo.com/rss/headline?s=BTC-USD", filter: true },
];

// A story counts as crypto news if its title or summary mentions one of these.
const CRYPTO = /crypto|bitcoin|\bbtc\b|ethereum|\beth\b|\bether\b|\bxrp\b|ripple|solana|\bsol\b|blockchain|stablecoin|token|defi|\bnft|web3|on-?chain|altcoin|memecoin|halving|satoshi|coinbase|binance|kraken|tether|usdt|usdc|saylor|microstrategy|\bmstr\b|\bstrc\b|\bdao\b/i;
// General stock-market roundups that only mention bitcoin in passing.
const STOCK_ROUNDUP = /dow jones|s&p 500|nasdaq composite|stock market today|stocks to watch/i;
const isCrypto = (x) => !STOCK_ROUNDUP.test(x.title) && CRYPTO.test(x.title + " " + x.summary);

const CATEGORIES = [
  ["Security", /hack|exploit|breach|stolen|theft|scam|drain|phishing|vulnerab/i],
  ["Policy", /sec\b|regulat|law|\bbills?\b|congress|senate|court|\bban(s|ned)?\b|\btax|etf approv|etf filing|approval|\brules?\b|lawsuit|government|trump|fed\b/i],
  ["Companies", /coinbase|binance|strategy|robinhood|earnings|ipo|stock|shares|acquire|funding|raises|bank/i],
  ["Tech", /ethereum|solana|layer|upgrade|protocol|blockchain|defi|stablecoin|tokeniz|onchain|wallet/i],
  ["Markets", /price|bitcoin|btc|ether|eth\b|rally|drops|surge|liquidat|market|traders|volume/i],
];

const decode = (s = "") =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ").trim();

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
};

function parseFeed(xml, source) {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  return items.map((it) => {
    const title = decode(tag(it, "title"));
    const link = decode(tag(it, "link"));
    let summary = decode(tag(it, "description")) || decode(tag(it, "content:encoded"));
    if (summary.length > 240) summary = summary.slice(0, 237).replace(/\s+\S*$/, "") + "…";
    const date = new Date(decode(tag(it, "pubDate")));
    // Categorise on the headline first; fall back to the summary only if the headline matches nothing.
    const pick = (s) => (CATEGORIES.find(([, re]) => re.test(s)) || [])[0];
    const cat = pick(title) || pick(summary) || "Markets";
    return { title, link, summary, source, category: cat, time: isNaN(date) ? 0 : date.getTime() };
  }).filter((x) => x.title && x.link);
}

async function getFeed({ name, url, filter }) {
  const r = await fetch(url, { headers: { "User-Agent": "CryptoDaily/1.0" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${name} ${r.status}`);
  const items = parseFeed(await r.text(), name);
  return filter ? items.filter(isCrypto) : items;
}

async function getPrice() {
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,ripple,solana&vs_currencies=usd&include_24hr_change=true",
      { signal: AbortSignal.timeout(6000) }
    );
    const d = await r.json();
    return {
      btc: d.bitcoin.usd, btcChange: d.bitcoin.usd_24h_change,
      eth: d.ethereum.usd, ethChange: d.ethereum.usd_24h_change,
      xrp: d.ripple.usd, xrpChange: d.ripple.usd_24h_change,
      sol: d.solana.usd, solChange: d.solana.usd_24h_change,
    };
  } catch { return null; }
}

module.exports = async (req, res) => {
  const [results, price] = await Promise.all([Promise.allSettled(FEEDS.map(getFeed)), getPrice()]);
  const cutoff = Date.now() - 36 * 3600 * 1000; // roughly "today's" news
  let items = results.filter((r) => r.status === "fulfilled").flatMap((r) => r.value);
  const fresh = items.filter((i) => i.time >= cutoff);
  items = (fresh.length >= 8 ? fresh : items).sort((a, b) => b.time - a.time);

  const seen = new Set();
  items = items.filter((i) => { const k = i.title.toLowerCase().slice(0, 50); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 30);

  // Cache for 24h at the edge; serve stale for another day while refreshing in the background.
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=86400");
  res.status(200).json({
    updated: new Date().toISOString(),
    price, items,
    failed: results.map((r, i) => (r.status === "rejected" ? FEEDS[i].name : null)).filter(Boolean),
  });
};
module.exports.parseFeed = parseFeed;
module.exports.isCrypto = isCrypto;
