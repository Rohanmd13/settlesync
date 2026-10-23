# SettleSync

USDC invoicing for Indian freelancers and builders, on Stellar. Every payment carries its invoice number in the Stellar memo field, so SettleSync matches it to the right invoice automatically, and exports a CA-ready ledger with the INR value on the day each payment arrived.

**Status:** testnet pilot.

## The problem

Indian Web3 developers, designers and contributors are increasingly paid in USDC by DAOs, grant programs and overseas clients. The payment lands in their wallet with no link to the work it paid for. Part-payments and late payments are tracked in spreadsheets, and at tax time the freelancer rebuilds a year of payments, with INR values, from a block explorer.

## How it works

1. **Create an invoice**: client, amount (USDC or XLM), due date. SettleSync assigns an ID like `SS-K7QM4X`.
2. **Get it to the client**, two ways:
   - **Pay link**: share on WhatsApp, email or as a QR code. The client opens it, connects any Stellar wallet, and pays in one click. No account needed.
   - **Wallet request**: enter the client's Stellar address. SettleSync sends the request *on Stellar itself* (a 0.0000001 XLM payment whose memo is `R:<invoiceId>:<amount>:<asset>`). It appears in the client's **Bills to pay**, and they pay with one tap. No server, works on any device.
3. **It marks itself paid**: the invoice ID is sent as the payment's text memo. SettleSync watches the freelancer's incoming payments on Horizon and matches by memo and asset. Partial payments add up until the invoice is fully paid.
4. **Export for your CA**: one CSV with every payment, the INR rate on the receipt day, and a link to each transaction as proof.

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
- Part-payments add up automatically; invoice PDF download
- Totals in INR at today's rate; CA export with the INR rate on each payment day
- Backup/restore, and automatic restore of wallet-requested invoices from Stellar
- Light and dark mode, mobile layout

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
src/lib/csv.js        CA ledger export
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
