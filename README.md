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

## Data

3,000 real Limit Order Book snapshots captured between
January 9 and January 13, 2023.
Price range: 17,144 to 19,074 — a 9.41% rise over 4 days.
