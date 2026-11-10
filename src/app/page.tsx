"use client";

import { useEffect, useMemo, useState } from "react";
import type { IntentToken, Purchase, QuoteResponse, Schedule } from "@/types/dca";

const STORE_KEY = "orbit-dca-v1";
const TARGETS = ["BTC", "ETH", "NEAR"];
const TERMINAL = new Set(["SUCCESS", "FAILED", "REFUNDED", "INCOMPLETE_DEPOSIT"]);

function nextDate(interval: Schedule["interval"], from = new Date()) {
  const date = new Date(from);
  if (interval === "daily") date.setDate(date.getDate() + 1);
  if (interval === "weekly") date.setDate(date.getDate() + 7);
  if (interval === "monthly") date.setMonth(date.getMonth() + 1);
  return date.toISOString();
}

function smallestAmount(value: string, decimals: number) {
  const [whole = "0", fraction = ""] = value.split(".");
  if (!/^\d+(\.\d+)?$/.test(value) || fraction.length > decimals) throw new Error(`Enter a valid amount with at most ${decimals} decimal places.`);
  const padded = `${fraction}${"0".repeat(decimals)}`.slice(0, decimals);
  return (BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0")).toString();
}

function formattedUnits(value: string, decimals: number) {
  if (!/^\d+$/.test(value)) return value;
  const base = 10n ** BigInt(decimals);
  const units = BigInt(value);
  const whole = units / base;
  const fractional = (units % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}` : whole.toString();
}

function money(value: string | number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: number < 1 ? 6 : 2 }).format(number);
}

function prettyChain(chain: string) {
  const names: Record<string, string> = { eth: "Ethereum", arb: "Arbitrum", base: "Base", near: "NEAR", sol: "Solana", btc: "Bitcoin" };
  return names[chain] ?? chain.toUpperCase();
}

function targetName(token: IntentToken) {
  const symbol = token.symbol.toUpperCase();
  if (symbol === "BTC") return "BTC";
  if (symbol === "ETH") return "ETH";
  if (["NEAR", "WNEAR"].includes(symbol)) return "NEAR";
  return symbol;
}

function explorerFor(address: string) {
  void address;
  return "https://explorer.near-intents.org/";
}

export default function Home() {
  const [tokens, setTokens] = useState<IntentToken[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [originId, setOriginId] = useState("");
  const [targetSymbol, setTargetSymbol] = useState("BTC");
  const [amount, setAmount] = useState("25");
  const [recipient, setRecipient] = useState("");
  const [refundTo, setRefundTo] = useState("");
  const [interval, setInterval] = useState<Schedule["interval"]>("weekly");
  const [slippage, setSlippage] = useState("100");
  const [liveMode, setLiveMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteSource, setQuoteSource] = useState<IntentToken | null>(null);
  const [quoteTarget, setQuoteTarget] = useState<IntentToken | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
      setSchedules(Array.isArray(saved.schedules) ? saved.schedules : []);
      setPurchases(Array.isArray(saved.purchases) ? saved.purchases : []);
    } catch { /* Start with an empty local workspace if saved data is unreadable. */ }
    setHydrated(true);
    fetch("/api/intents/tokens")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "The supported asset list is unavailable.");
        if (!Array.isArray(data)) throw new Error(data.message ?? data.error ?? "The supported asset list is unavailable.");
        setTokens(data);
        const usdc = data.find((token: IntentToken) => token.symbol.toUpperCase() === "USDC" && token.blockchain.toLowerCase() === "eth")
          ?? data.find((token: IntentToken) => token.symbol.toUpperCase() === "USDC");
        if (usdc) setOriginId(usdc.assetId);
      })
      .catch((reason: Error) => setTokenError(reason.message))
      .finally(() => setLoadingTokens(false));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORE_KEY, JSON.stringify({ schedules, purchases }));
  }, [hydrated, schedules, purchases]);

  const originTokens = useMemo(() => tokens.filter((token) => token.symbol.toUpperCase() === "USDC"), [tokens]);
  const targetTokens = useMemo(() => {
    const matching = tokens.filter((token) => targetName(token) === targetSymbol);
    const preferred = matching.find((token) => token.blockchain.toLowerCase() === "near") ?? matching[0];
    return preferred ? [preferred] : [];
  }, [tokens, targetSymbol]);
  const origin = originTokens.find((token) => token.assetId === originId) ?? originTokens[0];
  const target = targetTokens[0];
  const totalMonthly = schedules.filter((schedule) => schedule.active).reduce((sum, schedule) => {
    const multiplier = schedule.interval === "daily" ? 30 : schedule.interval === "weekly" ? 4.33 : 1;
    return sum + Number(schedule.amount) * multiplier;
  }, 0);
  const activeSchedules = schedules.filter((schedule) => schedule.active).length;
  const invested = purchases.filter((purchase) => purchase.status === "SUCCESS").reduce((sum, purchase) => sum + Number(purchase.amountIn || 0), 0);
  const nextSchedule = schedules.filter((schedule) => schedule.active).sort((a, b) => a.nextRun.localeCompare(b.nextRun))[0];

  async function requestQuote(dry: boolean, schedule?: Schedule) {
    setBusy(true); setError(""); setNotice(""); setQuote(null);
    try {
      const source = schedule ? tokens.find((token) => token.assetId === schedule.originAsset) : origin;
      const destination = schedule ? tokens.find((token) => token.assetId === schedule.targetAsset) : target;
      if (!source || !destination) throw new Error("The selected asset is not available in the current 1Click token list.");
      const qty = schedule?.amount ?? amount;
      const to = schedule?.recipient ?? recipient.trim();
      const refund = schedule?.refundTo ?? refundTo.trim();
      const tolerance = Number(schedule?.slippage ?? slippage);
      if (!to || !refund) throw new Error("Add the destination address and source-chain refund address first.");
      if (!/^\d+(\.\d+)?$/.test(qty) || !Number.isFinite(Number(qty)) || Number(qty) <= 0) throw new Error("Enter an amount greater than zero using digits and a decimal point.");
      if (!Number.isInteger(tolerance) || tolerance < 1 || tolerance > 5000) throw new Error("Slippage must be from 1 to 5,000 basis points.");
      const response = await fetch("/api/intents/quote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dry, swapType: "EXACT_INPUT", originAsset: source.assetId, destinationAsset: destination.assetId,
          amount: smallestAmount(qty, source.decimals), recipient: to, refundTo: refund,
          depositType: "ORIGIN_CHAIN", recipientType: "DESTINATION_CHAIN", refundType: "ORIGIN_CHAIN",
          ...(source.blockchain.toLowerCase() === "stellar" ? { depositMode: "MEMO" } : {}),
          slippageTolerance: tolerance, deadline: new Date(Date.now() + 8 * 60 * 1000).toISOString(),
        }),
      });
      const data: QuoteResponse & { error?: string; message?: string } = await response.json();
      if (!response.ok) throw new Error(data.error ?? data.message ?? "1Click could not return a quote.");
      setQuote(data); setQuoteSource(source); setQuoteTarget(destination);
      if (!dry && data.quote?.depositAddress) {
        const item: Purchase = {
          id: data.correlationId ?? crypto.randomUUID(), scheduleId: schedule?.id, status: "PENDING_DEPOSIT",
          amountIn: data.quote.amountInFormatted ?? qty, amountOut: data.quote.amountOutFormatted ?? "—",
          inputSymbol: source.symbol, outputSymbol: targetName(destination), date: new Date().toISOString(),
          depositAddress: data.quote.depositAddress, depositMemo: data.quote.depositMemo,
        };
        setPurchases((current) => [item, ...current.filter((purchase) => purchase.id !== item.id)]);
        setNotice("Deposit route created. Your funds remain in your wallet until you send them to the address below.");
      } else if (dry) setNotice("Live market quote received. Dry run did not create a deposit route or move funds.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unexpected error while requesting the quote.");
    } finally { setBusy(false); }
  }

  function saveSchedule() {
    setError(""); setNotice("");
    if (!origin || !target) return setError("Wait for the supported 1Click assets to load, then choose a route.");
    if (!recipient.trim() || !refundTo.trim()) return setError("Add the destination and refund addresses to save this plan.");
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return setError("Enter an amount greater than zero.");
    const schedule: Schedule = {
      id: crypto.randomUUID(), label: `${origin.symbol} → ${targetSymbol}`, amount,
      originAsset: origin.assetId, originSymbol: origin.symbol, originChain: origin.blockchain,
      targetAsset: target.assetId, targetSymbol, recipient: recipient.trim(), refundTo: refundTo.trim(),
      interval, slippage: Number(slippage), nextRun: nextDate(interval), active: true, createdAt: new Date().toISOString(),
    };
    setSchedules((current) => [schedule, ...current]);
    setNotice("Plan saved in this browser. Each buy still needs your confirmation and a wallet deposit.");
  }

  function toggleSchedule(id: string) {
    setSchedules((current) => current.map((item) => item.id === id ? { ...item, active: !item.active } : item));
  }

  async function checkStatus(purchase: Purchase) {
    if (!purchase.depositAddress) return;
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams({ depositAddress: purchase.depositAddress });
      if (purchase.depositMemo) params.set("depositMemo", purchase.depositMemo);
      const response = await fetch(`/api/intents/status?${params.toString()}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? result.message ?? "Could not check swap status.");
      const status = String(result.status ?? "UNKNOWN");
      const hashes = result.swapDetails?.destinationChainTxHashes ?? result.swapDetails?.originChainTxHashes ?? [];
      const updated: Purchase = {
        ...purchase, status,
        amountOut: result.swapDetails?.amountOutFormatted ?? purchase.amountOut,
        explorerUrl: hashes[0]?.explorerUrl || explorerFor(purchase.depositAddress),
      };
      setPurchases((current) => current.map((item) => item.id === purchase.id ? updated : item));
      if (status === "SUCCESS" && purchase.scheduleId) {
        setSchedules((current) => current.map((item) => item.id === purchase.scheduleId ? { ...item, nextRun: nextDate(item.interval) } : item));
      }
      setNotice(`Swap status: ${status.replaceAll("_", " ")}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not check swap status."); }
    finally { setBusy(false); }
  }

  async function copyAddress(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice("Deposit address copied."); }
    catch { setNotice("Select and copy the deposit address manually."); }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Orbit home"><span className="brand-mark"><i /></span><span>orbit<span className="brand-dot">.</span></span></a>
        <nav className="main-nav" aria-label="Main navigation"><a className="selected" href="#overview">Overview</a><a href="#plans">Plans</a><a href="#activity">Activity</a></nav>
        <div className="top-actions"><span className="network-pill"><i /> 1Click live</span><button className="connect-button" onClick={() => document.getElementById("wallet-fields")?.scrollIntoView({ behavior: "smooth" })}>Add addresses <span>↗</span></button></div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line" /> CROSS-CHAIN DOLLAR COST AVERAGING</div><h1>Make your next move<br /><em>on your own terms.</em></h1><p>Build a steady position across chains. Your assets go straight from your wallet to the destination you choose.</p><a className="text-link" href="#create">Create a buy plan <span>↓</span></a></div>
        <div className="hero-art" aria-label="Illustration of recurring buys moving across chains"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core"><span>USDC</span><b>↗</b></div><div className="orbit-node node-a">₿</div><div className="orbit-node node-b">Ξ</div><div className="orbit-node node-c">N</div><div className="route-label">ONE ROUTE · MANY CHAINS</div></div>
      </section>

      <section className="stats-row" id="overview" aria-label="Portfolio overview">
        <div className="stat"><span>PLANNED MONTHLY</span><strong>${money(totalMonthly)}<small> USDC</small></strong><p>{activeSchedules} active {activeSchedules === 1 ? "plan" : "plans"}</p></div>
        <div className="stat"><span>BOUGHT TO DATE</span><strong>${money(invested)}<small> USDC</small></strong><p>Settled through 1Click</p></div>
        <div className="stat stat-next"><span>NEXT BUY</span><strong>{nextSchedule ? new Date(nextSchedule.nextRun).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</strong><p>{nextSchedule ? `${nextSchedule.amount} USDC · ${nextSchedule.targetSymbol}` : "Create a plan to get started"}</p></div>
        <div className="trust-note"><span className="trust-icon">↗</span><div><b>Your keys stay yours</b><p>Quotes and routing by NEAR Intents.<br />No funds held by Orbit.</p></div></div>
      </section>

      <section className="workspace-grid" id="create">
        <div className="panel plan-panel">
          <div className="panel-heading"><div><div className="section-kicker">MAKE IT A ROUTINE</div><h2>Set up a buy plan</h2></div><span className="step-chip">01 <span>—</span> 03</span></div>
          <div className="asset-route">
            <label className="asset-box"><span>BUY WITH</span><select aria-label="Origin USDC asset" value={origin?.assetId ?? ""} onChange={(event) => setOriginId(event.target.value)} disabled={!originTokens.length}>{originTokens.length ? originTokens.map((token) => <option key={token.assetId} value={token.assetId}>USDC · {prettyChain(token.blockchain)}</option>) : <option>{loadingTokens ? "Loading assets…" : "USDC unavailable"}</option>}</select></label>
            <span className="route-arrow">→</span>
            <label className="asset-box"><span>BUY TARGET</span><select aria-label="Target asset" value={targetSymbol} onChange={(event) => setTargetSymbol(event.target.value)}>{TARGETS.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}</select></label>
          </div>
          <div className="field-row"><label className="field"><span>AMOUNT PER BUY</span><div className="input-wrap"><input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} aria-label="Amount per buy" /><span>USDC</span></div></label><label className="field"><span>REPEAT</span><select value={interval} onChange={(event) => setInterval(event.target.value as Schedule["interval"])} aria-label="Repeat frequency"><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select></label></div>
          <div className="field-row address-row" id="wallet-fields"><label className="field"><span>DESTINATION ADDRESS</span><input placeholder="Address on the target chain" value={recipient} onChange={(event) => setRecipient(event.target.value)} /></label><label className="field"><span>REFUND ADDRESS</span><input placeholder="Address on the source chain" value={refundTo} onChange={(event) => setRefundTo(event.target.value)} /></label></div>
          <div className="slippage-row"><div><b>Slippage cap</b><span>1Click will enforce this limit on the route</span></div><label className="bps-input"><input inputMode="numeric" value={slippage} onChange={(event) => setSlippage(event.target.value)} aria-label="Slippage tolerance in basis points" /><span>bps</span></label><span className="slippage-percent">{(Number(slippage) / 100).toFixed(2)}%</span></div>
          <div className="form-notice">{tokenError && <span className="error-text">{tokenError}</span>}{error && <span className="error-text">{error}</span>}{notice && <span>{notice}</span>}</div>
          <div className="button-row"><button className="primary-button" onClick={() => requestQuote(!liveMode)} disabled={busy || loadingTokens || !target}>{busy ? <><span className="spinner" /> Getting quote…</> : liveMode ? "Create deposit route" : "Preview live quote"}<span>↗</span></button><button className={`mode-switch ${liveMode ? "mode-live" : ""}`} onClick={() => { setLiveMode((current) => !current); setQuote(null); }} aria-pressed={liveMode}><span className="switch-dot" />{liveMode ? "Live route" : "Dry run"}</button></div>
          <p className="fine-print">{liveMode ? "Creates a real, time-limited deposit route. You still approve and send the transfer from your wallet." : "Fetches a real 1Click quote without creating a deposit route or moving funds."}</p>
          {quote?.quote && <div className="quote-card"><div className="quote-top"><div><span className="section-kicker">{quote.quote.depositAddress ? "DEPOSIT ROUTE READY" : "LIVE QUOTE"}</span><b>{money(quote.quote.amountInFormatted ?? amount)} {quoteSource?.symbol} <i>→</i> {money(quote.quote.amountOutFormatted ?? "—")} {quoteTarget ? targetName(quoteTarget) : targetSymbol}</b></div><span className="quote-status">{quote.quote.depositAddress ? "AWAITING DEPOSIT" : "DRY RUN"}</span></div><div className="quote-meta"><span>Estimated arrival <b>{quote.quote.timeEstimate ? `${Math.ceil(quote.quote.timeEstimate / 60)} min` : "Route dependent"}</b></span><span>Minimum received <b>{quote.quote.minAmountOut && quoteTarget ? `${formattedUnits(quote.quote.minAmountOut, quoteTarget.decimals)} ${targetName(quoteTarget)}` : "Protected by slippage cap"}</b></span></div>{quote.quote.depositAddress && <div className="deposit-box"><span>1CLICK DEPOSIT ADDRESS · EXPIRES {quote.quote.deadline ? new Date(quote.quote.deadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "SOON"}</span><div><code>{quote.quote.depositAddress}</code><button onClick={() => copyAddress(quote.quote!.depositAddress!)}>Copy</button></div>{quote.quote.depositMemo && <p className="deposit-memo">Required transfer memo <code>{quote.quote.depositMemo}</code></p>}<a href={explorerFor(quote.quote.depositAddress)} target="_blank" rel="noreferrer">Open NEAR Intents Explorer ↗</a></div>}</div>}
          {tokenError && <p className="api-hint">The API token list could not load. Check your connection and refresh to retry.</p>}
          {loadingTokens && <p className="api-hint">Loading supported 1Click assets…</p>}
        </div>

        <aside className="side-column">
          <div className="panel schedule-panel" id="plans"><div className="panel-heading compact"><div><div className="section-kicker">YOUR ROUTINE</div><h2>Upcoming buys</h2></div><span className="count-badge">{activeSchedules}</span></div>
            {schedules.length ? <div className="schedule-list">{schedules.slice(0, 4).map((schedule) => <article className={`schedule-item ${!schedule.active ? "paused" : ""}`} key={schedule.id}><div className="coin-badge">{schedule.targetSymbol === "BTC" ? "₿" : schedule.targetSymbol === "ETH" ? "Ξ" : "N"}</div><div className="schedule-info"><b>{schedule.amount} USDC <span>→ {schedule.targetSymbol}</span></b><small>{schedule.active ? `${schedule.interval} · next ${new Date(schedule.nextRun).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Paused"}</small><button className="run-quote-link" onClick={() => requestQuote(!liveMode, schedule)} disabled={!schedule.active || busy}>Run quote ↗</button></div><button className="pause-button" onClick={() => toggleSchedule(schedule.id)}>{schedule.active ? "Pause" : "Resume"}</button></article>)}</div> : <div className="empty-state"><div className="empty-orbit">↗</div><b>Your first plan starts here</b><p>Choose an amount and rhythm. Your plan stays saved in this browser.</p></div>}
            <button className="outline-button" onClick={saveSchedule}>Save this plan <span>＋</span></button>
            <div className="schedule-footnote"><span>i</span><p>Plans are stored in this browser. Run a quote when it’s due; every transfer needs your wallet approval.</p></div>
          </div>
          <div className="intent-note"><div className="intent-symbol">N</div><div><span>POWERED BY</span><b>NEAR Intents</b><p>One request. Liquidity across chains.</p></div><a href="https://docs.near-intents.org/" target="_blank" rel="noreferrer" aria-label="Learn about NEAR Intents">↗</a></div>
        </aside>
      </section>

      <section className="activity-section" id="activity"><div className="activity-heading"><div><div className="section-kicker">EVERY MOVE, VISIBLE</div><h2>Recent activity</h2></div><a href="https://explorer.near-intents.org/" target="_blank" rel="noreferrer">Open explorer ↗</a></div>
        {purchases.length ? <div className="activity-table"><div className="table-head"><span>ROUTE</span><span>AMOUNT</span><span>STATUS</span><span>WHEN</span><span /></div>{purchases.slice(0, 6).map((purchase) => <article className="activity-row" key={purchase.id}><div className="activity-route"><span className="mini-coin">{purchase.outputSymbol === "BTC" ? "₿" : purchase.outputSymbol === "ETH" ? "Ξ" : "N"}</span><span>USDC <i>→</i> {purchase.outputSymbol}</span></div><span className="activity-amount">{purchase.amountIn} USDC <small>→ {purchase.amountOut} {purchase.outputSymbol}</small></span><span className={`status-pill status-${purchase.status.toLowerCase()}`}>{purchase.status.replaceAll("_", " ")}</span><span className="activity-date">{new Date(purchase.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span><div className="row-actions">{purchase.status !== "SUCCESS" && !TERMINAL.has(purchase.status) && <button onClick={() => checkStatus(purchase)} disabled={busy}>Check status</button>}<a href={purchase.explorerUrl || (purchase.depositAddress ? explorerFor(purchase.depositAddress) : "https://explorer.near-intents.org/")} target="_blank" rel="noreferrer">↗</a></div></article>)}</div> : <div className="activity-empty"><span>✳</span><p>Nothing here yet. Your quotes and completed buys will show up here.</p><a href="#create">Get a live quote ↗</a></div>}
      </section>
      <footer className="footer"><a className="brand footer-brand" href="#top"><span className="brand-mark"><i /></span><span>orbit<span className="brand-dot">.</span></span></a><span>Markets keep moving. Your keys stay with you.</span><a href="https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request" target="_blank" rel="noreferrer">Built on NEAR Intents ↗</a></footer>
    </main>
  );
}
