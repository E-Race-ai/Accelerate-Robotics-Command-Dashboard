const express = require('express');
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const router = express.Router();

// WHY: Public tickers for companies featured on the site, plus parent companies of private subsidiaries
const TICKERS = [
  { symbol: 'TSLA',  name: 'Tesla',             role: 'Optimus Humanoid' },
  { symbol: 'NVDA',  name: 'NVIDIA',             role: 'Robotics AI' },
  { symbol: 'GOOGL', name: 'Alphabet',           role: 'Intrinsic Robotics' },
  { symbol: 'TM',    name: 'Toyota',             role: 'Transport Robots' },
  { symbol: 'SERV',  name: 'Serve Robotics',     role: 'Delivery Robots' },
  { symbol: 'ISRG',  name: 'Intuitive Surgical', role: 'Surgical Robotics' },
];

// WHY: Private companies with known funding rounds — shows capital flowing into the space beyond public markets
const PRIVATE_ROUNDS = [
  { name: 'Figure AI',         round: 'Series B',  amount: 675e6,  valuation: 2.6e9 },
  { name: '1X Technologies',   round: 'Series C',  amount: 100e6,  valuation: null },
  { name: 'Bedrock Robotics',  round: 'Series B',  amount: 270e6,  valuation: null },
  { name: 'Keenon Robotics',   round: 'Series D+', amount: 200e6,  valuation: null },
  { name: 'Pudu Robotics',     round: 'Series C',  amount: 150e6,  valuation: null },
];

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes — balances freshness against API rate limits
let cache = { data: null, timestamp: 0 };

async function fetchQuotes() {
  const now = Date.now();
  if (cache.data && (now - cache.timestamp) < CACHE_TTL_MS) {
    return cache.data;
  }

  const symbols = TICKERS.map(t => t.symbol);
  let quotes = [];

  try {
    const results = await yf.quote(symbols);
    // WHY: yahoo-finance2 returns a single object when given one symbol, an array for multiple
    const arr = Array.isArray(results) ? results : [results];

    quotes = arr.map(q => {
      const ticker = TICKERS.find(t => t.symbol === q.symbol);
      return {
        type: 'stock',
        symbol: q.symbol,
        name: ticker?.name || q.shortName || q.symbol,
        role: ticker?.role || '',
        price: q.regularMarketPrice || 0,
        change: q.regularMarketChange || 0,
        changePercent: q.regularMarketChangePercent || 0,
        marketCap: q.marketCap || 0,
        currency: q.currency || 'USD',
      };
    });
  } catch (err) {
    console.error('[stocks] Yahoo Finance fetch error:', err.message);
    // Return stale cache if available, empty array otherwise
    if (cache.data) return cache.data;
  }

  const privateData = PRIVATE_ROUNDS.map(p => ({
    type: 'private',
    name: p.name,
    round: p.round,
    amount: p.amount,
    valuation: p.valuation,
  }));

  // WHY: Sum up total market cap of public companies to show aggregate capital in the ecosystem
  const totalPublicMarketCap = quotes.reduce((sum, q) => sum + (q.marketCap || 0), 0);
  const totalPrivateFunding = PRIVATE_ROUNDS.reduce((sum, p) => sum + p.amount, 0);

  const payload = {
    public: quotes,
    private: privateData,
    totals: {
      publicMarketCap: totalPublicMarketCap,
      privateFunding: totalPrivateFunding,
      combined: totalPublicMarketCap + totalPrivateFunding,
    },
    updatedAt: new Date().toISOString(),
  };

  cache = { data: payload, timestamp: now };
  return payload;
}

router.get('/', async (req, res) => {
  try {
    const data = await fetchQuotes();
    res.json(data);
  } catch (err) {
    console.error('[stocks] Route error:', err.message);
    res.status(500).json({ error: 'Failed to fetch stock data' });
  }
});

module.exports = router;
