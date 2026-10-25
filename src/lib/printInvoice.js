// Branded, single-page A4 invoice for "Download PDF" (browser print → Save as PDF).
import QRCode from "qrcode";
import { formatAmount, formatDate, statusOf, STATUS_LABEL, payLinkFor } from "./invoices";
import { NETWORK } from "./stellar";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function printInvoice(inv) {
  const status = statusOf(inv);
  const link = payLinkFor(inv);
  let qr = "";
  if (status !== "paid") {
    try {
      qr = await QRCode.toDataURL(link, { margin: 0, width: 240, color: { dark: "#18203a", light: "#ffffff" } });
    } catch { /* print without QR */ }
  }
  const remaining = Math.max(0, Number(inv.amount) - (inv.received || 0));
  const rows = (inv.payments || [])
    .map(
      (p) => `<tr><td>${esc(formatDate(p.createdAt))}</td><td class="r">${esc(formatAmount(p.amount, p.assetCode))}</td><td class="mono">${esc(p.hash.slice(0, 10))}…${esc(p.hash.slice(-6))}</td></tr>`
    )
    .join("");

  const html = `
  <div class="pi">
    <header class="pi__band">
      <div class="pi__brand"><span class="pi__mark"></span>SettleSync</div>
      <div class="pi__title">INVOICE</div>
    </header>

    <section class="pi__meta">
      <div>
        <p class="pi__label">From</p>
        <p class="pi__big">${esc(inv.fromName || "Freelancer")}</p>
        ${inv.gstin ? `<p>GSTIN ${esc(inv.gstin)}</p>` : ""}
        <p class="mono small">${esc(inv.to)}</p>
      </div>
      <div>
        <p class="pi__label">Billed to</p>
        <p class="pi__big">${esc(inv.client || "—")}</p>
      </div>
      <div class="pi__facts">
        <p><span>Invoice no.</span><b>${esc(inv.id)}</b></p>
        <p><span>Issued</span><b>${esc(formatDate(inv.createdAt))}</b></p>
        <p><span>Due</span><b>${esc(formatDate(inv.dueDate))}</b></p>
        <p><span>Status</span><b class="pi__st pi__st--${status}">${esc(STATUS_LABEL[status])}</b></p>
      </div>
    </section>

    <table class="pi__items">
      <thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>
      <tbody><tr><td>${esc(inv.description || "Services")}</td><td class="r">${esc(formatAmount(inv.amount, inv.assetCode))}</td></tr></tbody>
      <tfoot>
        ${inv.received > 0 ? `<tr><td class="r">Received</td><td class="r">− ${esc(formatAmount(inv.received, inv.assetCode))}</td></tr>` : ""}
        <tr class="pi__total"><td class="r">${status === "paid" ? "Total paid" : "Amount due"}</td><td class="r">${esc(formatAmount(status === "paid" ? inv.amount : remaining, inv.assetCode))}</td></tr>
      </tfoot>
    </table>

    ${status === "paid" ? `<div class="pi__stamp">PAID<small>${esc(formatDate(inv.paidAt))}</small></div>` : ""}

    <section class="pi__pay">
      <div>
        <p class="pi__label">How to pay</p>
        <ol>
          <li>Open the pay link or scan the QR code, and connect any Stellar wallet.</li>
          <li>Or send ${esc(inv.assetCode)} on Stellar to the address above with memo <b>${esc(inv.id)}</b>.</li>
        </ol>
        <p class="small mono break">${esc(link.length > 140 ? link.slice(0, 140) + "…" : link)}</p>
      </div>
      ${qr ? `<img class="pi__qr" src="${qr}" alt="" />` : ""}
    </section>

    ${rows ? `<section><p class="pi__label">Payments received</p><table class="pi__rec"><thead><tr><th>Date</th><th class="r">Amount</th><th>Stellar transaction</th></tr></thead><tbody>${rows}</tbody></table></section>` : ""}

    <footer class="pi__foot">
      Settled wallet to wallet on Stellar ${esc(NETWORK.name.toLowerCase())}. SettleSync never holds funds. Verify any payment at stellar.expert.
    </footer>
  </div>`;

  let root = document.getElementById("print-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "print-root";
    document.body.appendChild(root);
  }
  root.innerHTML = html;
  const prevTitle = document.title;
  document.title = `${inv.id} ${inv.client || ""}`.trim();
  document.body.dataset.print = "invoice";
  const done = () => {
    delete document.body.dataset.print;
    document.title = prevTitle;
    root.innerHTML = "";
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  // give the QR image a frame to decode
  await new Promise((r) => setTimeout(r, 120));
  window.print();
}
