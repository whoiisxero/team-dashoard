# Trading view

Trading view is available to signed-in team members. It shows public market data and does not change project permissions, connect a brokerage account or place orders.

## Data and chart controls

- CoinGecko's public `coins/markets` endpoint supplies the five largest cryptocurrencies by market capitalisation, including stablecoins, their USD prices, 24-hour change and source update time. The ranking is fetched on entry and refreshed while the page is active, at most once every five minutes unless the member explicitly refreshes it.
- TradingView's official Advanced Chart widget supplies the price chart, crosshair, panning, zooming, historical dates and price/volume display. The page provides 1m, 5m, 15m, 30m, 1h, 4h, daily and weekly intervals, with candle, line and area styles. The chart uses Africa/Johannesburg time.
- TradingView's official Market Quotes widget supplies the metals and oil table. The selector offers gold, silver, platinum and palladium spot feeds, continuous copper futures and WTI/Brent CFD feeds. Units and feed symbols are shown beside the selected chart. These instruments are not interchangeable with each other or with a specific broker's execution price.
- Crypto cards quote aggregate USD prices from CoinGecko; the chart uses the exchange/index pair shown in its header, which can use USD or USDT. The two values need not match exactly.

Data availability, minute history, exchange delays and market hours depend on the provider and selected feed. The widgets retain TradingView attribution and provide a full-chart link. Unknown top-five crypto tickers use TradingView's `CRYPTO:<ticker>USD` index convention; some newly ranked assets might not have a supported chart, in which case the provider shows its availability message and the full-chart link allows further exploration.

## Failures and privacy

The ranking is validated before display. A failed initial request shows a labelled starter watchlist without invented prices or a claim that it is the current top five. A failed refresh keeps the last successful prices with their source timestamp and a refresh-unavailable message. Both widgets have a loading timeout, a retry control and an external full-chart link.

External market requests start only when an authorised member opens Trading view. Leaving the page or signing out aborts a ranking request and removes streaming widget frames. Offline state removes the frames; reconnecting reloads them. The integration sends market symbols and chart settings, not account IDs, access assignments, project data or Supabase credentials. Public ranking data is held in memory only. Service-worker caching remains restricted to public local static assets; provider APIs, embeds and prices are not cached for offline use.

The application CSP allows scripts from `s3.tradingview.com`, frames from TradingView's widget/chart hosts and ranking requests to `api.coingecko.com`. The embedded frames run under the provider's own origin and CSP. No API key, database migration or paid provider plan is configured by this integration.

## Verification

`python tests/trading-browser.py` serves the built app with the production CSP and deterministic provider fixtures. It verifies ranking, stablecoins, interval/style/symbol configuration, commodity units, member access, failure/retry/offline states, disposal of widgets on navigation/sign-out, mobile widths and exclusion of external data from caches. `python tests/mobile-layout-browser.py` also includes the new view.

The managed development environment's network policy does not allow TradingView or CoinGecko. These tests therefore mock the provider responses and do not verify current provider uptime, actual quotes or gestures inside the remote chart. In a normal online browser, check that the native chart loads, dragging loads earlier candles, crosshair values change, minute/hour controls request the expected resolution, and all selected commodity feeds are available. Keep provider failure messages and attribution visible.
