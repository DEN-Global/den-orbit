# Orbit

Orbit is a cross-chain DCA prototype for the NEAR Hackathon DeFi track. It uses the 1Click API for supported asset discovery, live quote previews, deposit route creation, and swap status tracking.

## DEN Global workspace

Orbit is registered as an authenticated DEN workspace at `/orbit/`. It uses DEN's same-origin session and CSRF protected API, with user-owned DCA plans and swap history stored in DEN's database. Sign in through a DEN workspace before opening Orbit. This application does not use DEN Wallet or Payments: swaps remain direct NEAR Intents routes, and the user must manually authorize deposits from their own wallet.

## Build locally

```bash
npm install
npm run build
```

The export is written to `out/` for DEN's asset packer. To use the workspace interactively, serve it through a DEN backend instance so `/api/auth/*` and `/api/orbit/*` share the session cookie and origin.

`NEAR_INTENTS_JWT` is optional. Without it, 1Click applies its unauthenticated fee schedule. The app does not include or expose a wallet secret.

## Current flow

- Load USDC source assets and BTC, ETH, and NEAR destinations from the 1Click token list.
- Preview a live quote with `dry: true` and a configurable slippage tolerance.
- Create a real, expiring deposit route with `dry: false`; the user must send the source-chain transfer from their own wallet.
- Check the route status and show pending, successful, failed, refunded, and incomplete outcomes.
- Save DCA plans and activity to the signed-in user's DEN workspace.

Plans are stored for the authenticated user, but are user-triggered. The app does not run a background scheduler, hold funds, or sign/send deposits. The live API has no testnet, so use dry-run mode for demos without funds.
