# SettleSync

USDC invoicing for Indian freelancers and builders, on Stellar. Every payment carries its invoice number in the Stellar memo field, so SettleSync matches it to the right invoice automatically, and exports a CA-ready ledger with the INR value on the day each payment arrived.

**Status:** testnet pilot.

## The problem

Indian Web3 developers, designers and contributors are increasingly paid in USDC by DAOs, grant programs and overseas clients. The payment lands in their wallet with no link to the work it paid for. Part-payments and late payments are tracked in spreadsheets, and at tax time the freelancer rebuilds a year of payments, with INR values, from a block explorer.

## How it works

1. **Create an invoice**: client, amount (USDC or XLM), due date. SettleSync assigns an ID like `SS-K7QM4X`.
2. **Send the pay link**: the client opens it, connects Freighter, and pays in one click. No account needed.
3. **It marks itself paid**: the invoice ID is sent as the payment's text memo. SettleSync watches the freelancer's incoming payments on Horizon and matches by memo and asset. Partial payments add up until the invoice is fully paid.
4. **Export for your CA**: one CSV with every payment, the INR rate on the receipt day, and a link to each transaction as proof.

## Use of Stellar

- **Payments** with a **text memo** carrying the invoice ID: the core of exact, automatic reconciliation.
- **USDC** (Circle) via a one-click trustline (`changeTrust`) from inside the app.
- **Horizon** payments stream (`/accounts/{id}/payments?join=transactions`) for matching.
- **Freighter** for signing. Non-custodial: funds move wallet to wallet, SettleSync never holds them.

## Run it locally

```bash
npm install
npm run dev
```

Then open the printed URL with the Freighter extension installed and set to **Testnet**.

## Project structure

```
src/lib/stellar.js    Horizon, payment and trustline transactions, result-code messages
src/lib/wallet.js     Freighter connect, network check, signing
src/lib/invoices.js   invoice IDs, pay links, memo matching, statuses
src/lib/csv.js        CA ledger export
src/lib/inr.js        INR rate on the receipt day (CoinGecko daily history)
src/pages/            Landing, Dashboard (freelancer), PayPage (client)
```

## Roadmap

- Mainnet launch with USDC
- Pro tier (₹299/month or 3 USDC): unlimited invoices, CA export, branding, reminders
- Invoices synced across devices
- Milestone invoices for larger contracts using Trustless Work escrow
- INR off-ramp through a regulated partner

## License

MIT
