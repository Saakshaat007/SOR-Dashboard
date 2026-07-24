# SOR Dashboard

Smart Order Routing Dashboard built on real Limit Order Book data.
Live replay, signal detection, routing decisions, and Excel export.

## What This Dashboard Does

- Replays 3,000 real order book snapshots from January 2023
- Generates BUY, SELL, and HOLD signals from real imbalance data
- Shows routing decisions, slippage analysis, and market heat score
- Download Excel button on every visualization widget

## Files

| File | Purpose |
|---|---|
| index.html | Dashboard layout and structure |
| style.css | Dark professional theme |
| script.js | Live replay engine and all chart logic |
| sample-data.json | 3,000 real LOB snapshots |

## How to Run Locally

1. Download or clone this repository
2. Open terminal inside the downloaded folder
3. Run this command:
   python3 -m http.server 8765
4. Open your browser and go to:
   http://localhost:8765

## Tech Stack

- HTML, CSS, Vanilla JavaScript
- Chart.js for all visualizations
- SheetJS for Excel download functionality
- Python built-in HTTP server for local serving

## Charts Used and Why

### 1. Price Movement - Bar Chart
Shows the mid price at each snapshot. Green bars mean price went up,
red bars mean price went down. A bar chart was chosen over a line chart
because color coded bars make direction immediately obvious without
reading numbers.

### 2. Buy vs Sell Volume History - Stacked Bar Chart
Shows buyer and seller volume side by side for each snapshot. Stacked
bars answer three questions at once - who had more volume, how much
total activity was there, and how has that balance been changing.

### 3. Routing Decision Breakdown - Donut Chart
Shows a running tally of how often each route was chosen during the
session. A donut chart was chosen because it clearly shows proportions
and each slice is immediately comparable to the others.

### 4. Cumulative Signal Mix - Stacked Area Chart
Shows BUY, SELL, and NEUTRAL signal counts accumulating over time. The
filled areas make it immediately clear whether the session has been
buy-heavy, sell-heavy, or balanced without reading any numbers.

### 5. Order Book Imbalance with Thresholds - Line Chart
Shows the raw imbalance value over time with two dashed reference lines
at plus 0.3 and minus 0.3. These are the exact thresholds the routing
engine uses. When the purple line crosses above the green dashed line a
BUY signal fires. When it crosses below the red dashed line a SELL
signal fires. This makes the decision logic fully transparent.

### 6. Simulated Execution Slippage - Bar Chart
Shows arrival price versus next-tick price per signal in basis points.
Green bars mean the price moved in our favour. Red bars mean it moved
against us. In this dataset BUY signals averaged plus 0.66 bps and SELL
signals averaged minus 0.28 bps confirming the signals were directionally
correct.

### 7. Market Heat Trend - Area Chart
Shows the Market Heat Score over time on a fixed 0 to 100 scale. Above
50 means buy pressure. Below 50 means sell pressure. The filled area
makes the space above and below the neutral midpoint visually clear.

### 8. Trading Cost Monitor - Area Chart
Shows the bid-ask spread over time. Almost completely flat at 0.10 for
99 percent of the data with occasional spikes when liquidity temporarily
collapsed. The fill makes even small spikes visible against the baseline.

### 9. Price Momentum - Bar Chart
Shows how much the price changed each tick. Green bars above zero mean
price went up. Red bars below zero mean price went down. Taller bars
mean bigger moves. A bar chart with a zero line in the middle is the
clearest way to show values that can be both positive and negative.

### 10. Order Book Depth - Horizontal Bar Chart
Shows buyer and seller order sizes at each of the top 5 price levels.
Horizontal orientation was chosen because level labels fit naturally on
the vertical axis and bar lengths are easier to compare when running in
the same direction.

### 11. Market Heat Score - Gauge Chart
A semicircular doughnut chart showing a single score from 0 to 100.
Left side is red representing sell pressure. Right side is green
representing buy pressure. A gauge was chosen because it gives an
instant directional read without needing to read a number.

## Data

3,000 real Limit Order Book snapshots captured between
January 9 and January 13, 2023.
Price range: 17,144 to 19,074 — a 9.41% rise over 4 days.
