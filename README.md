# Orbit

Orbit is a cross-chain DCA prototype for the NEAR Hackathon DeFi track. It uses the 1Click API for supported asset discovery, live quote previews, deposit route creation, and swap status tracking.

## DEN Global relationship

This is a standalone app in the DEN-Global organization, using a compatible Manrope and forest/lime visual style. It does not call the private DEN backend or wallet. DEN's current wallet package is read-only and its payment package is sandbox-only, so neither can fund or execute DCA buys. The Orbit flow uses NEAR Intents directly. A future authenticated DEN workspace integration needs an agreed account/session boundary and a wallet service that supports the intended transaction flow.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

`NEAR_INTENTS_JWT` is optional. Without it, 1Click applies its unauthenticated fee schedule. The app does not include or expose a wallet secret.

## Current flow

- Load USDC source assets and BTC, ETH, and NEAR destinations from the 1Click token list.
- Preview a live quote with `dry: true` and a configurable slippage tolerance.
- Create a real, expiring deposit route with `dry: false`; the user must send the source-chain transfer from their own wallet.
- Check the route status and show pending, successful, failed, refunded, and incomplete outcomes.
- Save DCA plans and activity in browser local storage.

Plans are currently browser-local and user-triggered. The app does not run a background scheduler, hold funds, or sign/send deposits. Those need persistent schedule storage, a deployed job runner, and wallet or contract execution before the prototype can make unattended recurring buys. The live API has no testnet, so use dry-run mode for demos without funds.
