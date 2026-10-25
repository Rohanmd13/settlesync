# SettleSync

USDC invoicing for freelancers and the people who pay them, on Stellar. Built in India, for everywhere. Every payment carries its invoice number in the Stellar memo field, so SettleSync matches it to the right invoice automatically, and exports a CA-ready ledger with the INR value on the day each payment arrived.

**Status:** testnet pilot.

## The problem

Indian Web3 developers, designers and contributors are increasingly paid in USDC by DAOs, grant programs and overseas clients. The payment lands in their wallet with no link to the work it paid for. Part-payments and late payments are tracked in spreadsheets, and at tax time the freelancer rebuilds a year of payments, with INR values, from a block explorer.

## How it works

1. **Create an invoice**: client, amount (USDC or XLM), due date. SettleSync assigns an ID like `SS-K7QM4X`.
2. **Get it to the client**, two ways:
   - **Pay link**: share on WhatsApp, email or as a QR code. The client opens it, connects any Stellar wallet, and pays in one click. No account needed.
   - **Wallet request**: enter the client's Stellar address. SettleSync sends the request *on Stellar itself* (a 0.0000001 XLM payment whose memo is `R:<invoiceId>:<amount>:<asset>`). It appears in the client's **Bills to pay**, and they pay with one tap. No server, works on any device.
3. **It marks itself paid**: the invoice ID is sent as the payment's text memo. SettleSync watches the freelancer's incoming payments on Horizon and matches by memo and asset. Partial payments add up until the invoice is fully paid.
3b. **Client pays first (claim codes)**: a client can pay before any invoice exists. The amount is locked in a fresh one-time Stellar account (created, funded and trust-lined in one transaction co-signed by the payer's wallet and the one-time key). The code is that key: the recipient redeems it in SettleSync, which pays them, removes the trustline and data entries, and merges the account back to the payer so the XLM deposit returns. Unredeemed codes can be taken back.
4. **Export for your accountant**: a formatted Excel workbook with every payment, the local-currency rate on the receipt day, totals, filters and a link to each transaction as proof.

## Use of Stellar

- **Payments** with a **text memo** carrying the invoice ID: the core of exact, automatic reconciliation.
- **USDC** (Circle) via a one-click trustline (`changeTrust`) from inside the app.
- **Horizon** payments stream (`/accounts/{id}/payments?join=transactions`) for matching.
- **Payment requests on-chain**: memo-encoded request transfers, so requests reach the client on any device and invoices can be restored from the chain.
- **manageData**: the sender's display name is stored on their own account (`ss.name`) so clients see who is requesting.
- **Stellar Wallets Kit** for signing with Freighter, xBull, Albedo, LOBSTR, Hana, Rabet and more. Non-custodial: funds move wallet to wallet, SettleSync never holds them.

## Features

- Roles: Freelancer, Business/agency (GSTIN on invoices), Client/company, each with its own dashboard layout
- Invoices, Bills to pay, and full payment History, with search and filters
- Pay links with QR codes, WhatsApp sharing and overdue reminders
- Part-payments add up automatically; branded one-page A4 invoice PDF with pay QR code
- Totals in INR at today's rate; CA export with the INR rate on each payment day
- Backup/restore, and automatic restore of wallet-requested invoices from Stellar
- Send money: pay a wallet directly with a note, or create claim codes; track, re-share and take back codes
- Pro subscription paid on-chain to the SettleSync treasury; hidden owner dashboard (`#/owner`) reads revenue live from the treasury
- Local currency for totals and exports (INR default, plus USD, EUR, GBP, AED, SGD, NGN, BRL, PHP)
- "Get test USDC" swaps test XLM for USDC on Stellar's built-in exchange (path payment)
- Light and dark mode, interactive ink-dot background, mobile and iOS layouts

## Why SettleSync

| | SettleSync | Plain wallet transfer | Bank wire / PayPal | Freelance marketplace |
|---|---|---|---|---|
| Knows which invoice a payment was for | Automatic, by memo | By hand | Reference often missing | Inside the platform only |
| Time to settle | ~5 seconds | Seconds | 1–5 days | Days |
| Cost to get paid | < ₹0.01 network fee | Network fee | 3–5% + FX | 10–20% commission |
| Client can pay before an invoice | Claim codes | Only with your address | Yes | No |
| Accountant export in local currency | One click | No | Statements only | Platform reports |
| Who holds the money | You | You | Bank / PayPal | Platform |

## Run it locally

```bash
npm install
npm run dev
```

Then open the printed URL with a Stellar wallet set to **Testnet** (Albedo works with nothing to install).

## Project structure

```
src/lib/stellar.js    Horizon, payment and trustline transactions, result-code messages
src/lib/wallet.js     Stellar Wallets Kit: connect any wallet, network check, signing
src/lib/actions.js    pay invoice, send payment request, enable USDC
src/lib/invoices.js   invoice IDs, pay links, memo matching, statuses
src/lib/xlsx.js       formatted Excel exports (ledger, history)
src/lib/printInvoice.js  branded A4 invoice PDF
src/lib/inr.js        INR rate on the receipt day (CoinGecko daily history)
src/pages/            Landing, Dashboard (+ dash/ tabs), PayPage, Plans
```

## Roadmap

- Mainnet launch with USDC
- Pro tier (₹299/month or 3 USDC): unlimited invoices, CA export, branding, reminders
- Invoices synced across devices
- Milestone invoices for larger contracts using Trustless Work escrow
- INR off-ramp through a regulated partner

## License

MIT
