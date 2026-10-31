# Crypto Daily

Crypto-only news site. `api/news.js` reads CoinDesk, Cointelegraph, Decrypt and Yahoo Finance
RSS feeds plus BTC/ETH prices, and is cached for 24 hours, so the news refreshes once a day on its own.

## Put it online (about 10 minutes, free)
1. Create a free account at github.com and make a new repository called `crypto-daily`.
2. Upload every file in this folder to it (Add file > Upload files; keep the `api` and `public` folders).
3. Create a free account at vercel.com (sign in with GitHub).
4. Click Add New > Project, pick `crypto-daily`, click Deploy. No settings needed.
5. Open the link Vercel gives you.

## Add to iPhone home screen
Open the link in Safari > Share > Add to Home Screen.

## Change the refresh time
In `api/news.js`, change `s-maxage=86400` (seconds). 86400 = 24 hours; 21600 = every 6 hours.

## Add or remove sources
Edit the `FEEDS` list at the top of `api/news.js`.
