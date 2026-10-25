// Formatted Excel workbooks for the accountant export and payment history.
import { rateOn } from "./inr";
import { NETWORK } from "./stellar";
import { statusOf, STATUS_LABEL } from "./invoices";
import { describePayment } from "./csv";

const RED = "FFA3161C", NAVY = "FF18203A", CREAM = "FFF7F2EA", RULE = "FFD9DDE7";
const STATUS_FILL = { paid: "FFE3F2EA", partial: "FFFBEFD8", overdue: "FFFBE7E6", pending: "FFE5ECF8" };
const STATUS_FONT = { paid: "FF1D7A4C", partial: "FF8A4B00", overdue: "FFB0191F", pending: "FF23417A" };

async function newBook() {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "SettleSync";
  wb.created = new Date();
  return wb;
}

function titleBlock(ws, { title, subtitle, cols }) {
  ws.mergeCells(1, 1, 1, cols);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: "Calibri", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
  t.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 30;
  ws.mergeCells(2, 1, 2, cols);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { size: 10, color: { argb: "FF48506B" } };
  s.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREAM } };
  s.alignment = { vertical: "middle", indent: 1, wrapText: true };
  ws.getRow(2).height = 32;
}

function headerRow(ws, rowNum, headers) {
  const row = ws.getRow(rowNum);
  headers.forEach((h, i) => {
    const c = row.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = { bottom: { style: "thin", color: { argb: NAVY } } };
  });
  row.height = 32;
}

function styleBody(ws, from, to, cols) {
  for (let r = from; r <= to; r++) {
    const row = ws.getRow(r);
    row.height = 20;
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      cell.border = { bottom: { style: "thin", color: { argb: RULE } } };
      cell.alignment = { vertical: "middle", ...(cell.alignment || {}) };
      if ((r - from) % 2 === 1 && !cell.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAF7" } };
    }
  }
}

function notes(ws, startRow, cols, lines) {
  lines.forEach((l, i) => {
    ws.mergeCells(startRow + i, 1, startRow + i, cols);
    const c = ws.getCell(startRow + i, 1);
    c.value = l;
    c.font = { size: 9, italic: true, color: { argb: "FF7A8098" } };
  });
}

async function download(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const toDate = (iso) => (iso ? new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso) : null);

export async function downloadLedgerXlsx(invoices, owner, profile = {}) {
  const fiat = profile.currency || "INR";
  const fmtFiat = fiat === "INR" ? '"₹"#,##,##0.00' : `"${fiat} "#,##0.00`;
  const wb = await newBook();
  const ws = wb.addWorksheet("Invoices", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }], properties: { tabColor: { argb: RED } } });
  const headers = ["Invoice no.", "Client", "Description", "Issued", "Due", "Amount", "Asset", "Status", "Paid on", "Received", `${fiat} rate`, `${fiat} value`, "Paid from wallet", "Proof on Stellar"];
  const widths = [13, 22, 28, 12, 12, 12, 8, 14, 18, 12, 11, 14, 22, 18];
  ws.columns = widths.map((w) => ({ width: w }));
  titleBlock(ws, {
    title: `SettleSync · Invoice ledger${profile.name ? ` · ${profile.name}` : ""}${profile.gstin ? ` (GSTIN ${profile.gstin})` : ""}`,
    subtitle: `Wallet ${owner}  ·  Exported ${new Date().toLocaleString("en-IN")}  ·  Stellar ${NETWORK.name.toLowerCase()}`,
    cols: headers.length,
  });
  headerRow(ws, 4, headers);

  let r = 5;
  let totalFiat = 0;
  const first = r;
  for (const inv of invoices) {
    const st = statusOf(inv);
    const pays = inv.payments?.length ? inv.payments : [null];
    for (const p of pays) {
      const rate = p ? await rateOn(p.assetCode, p.createdAt, fiat) : null;
      const value = p && rate ? Number(p.amount) * rate : null;
      if (value) totalFiat += value;
      const row = ws.getRow(r);
      row.values = [
        inv.id, inv.client || "", inv.description || "", toDate(inv.createdAt), toDate(inv.dueDate),
        Number(inv.amount), inv.assetCode, STATUS_LABEL[st],
        p ? toDate(p.createdAt) : null, p ? Number(p.amount) : null, rate, value,
        p ? p.from : "", p ? { text: "View transaction", hyperlink: NETWORK.explorerTx(p.hash) } : "",
      ];
      row.getCell(4).numFmt = "dd mmm yyyy";
      row.getCell(5).numFmt = "dd mmm yyyy";
      row.getCell(9).numFmt = "dd mmm yyyy hh:mm";
      row.getCell(6).numFmt = "#,##0.00";
      row.getCell(10).numFmt = "#,##0.00";
      row.getCell(11).numFmt = "#,##0.0000";
      row.getCell(12).numFmt = fmtFiat;
      const sc = row.getCell(8);
      sc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_FILL[st] } };
      sc.font = { bold: true, color: { argb: STATUS_FONT[st] }, size: 10 };
      sc.alignment = { horizontal: "center" };
      row.getCell(1).font = { bold: true };
      row.getCell(13).font = { size: 9, color: { argb: "FF7A8098" } };
      if (p) row.getCell(14).font = { color: { argb: RED }, underline: true };
      r++;
    }
  }
  styleBody(ws, first, r - 1, headers.length);

  const tot = ws.getRow(r);
  ws.mergeCells(r, 1, r, 11);
  tot.getCell(1).value = `Total received (${fiat}, at each payment day's rate)`;
  tot.getCell(1).alignment = { horizontal: "right" };
  tot.getCell(12).value = totalFiat;
  tot.getCell(12).numFmt = fmtFiat;
  for (const c of [1, 12]) tot.getCell(c).font = { bold: true, size: 11, color: { argb: c === 12 ? RED : NAVY } };
  for (let c = 1; c <= headers.length; c++) tot.getCell(c).border = { top: { style: "double", color: { argb: NAVY } } };
  tot.height = 24;

  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, r - 1), column: headers.length } };
  notes(ws, r + 2, headers.length, [
    `${fiat} rates are CoinGecko's daily rate for the date each payment arrived.`,
    "This is a record for your CA or accountant, not tax advice. Every row links to its transaction on Stellar as proof.",
  ]);
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  await download(wb, `settlesync-ledger-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function downloadHistoryXlsx(payments, owner, fiat = "INR") {
  const fmtFiat = fiat === "INR" ? '"₹"#,##,##0.00' : `"${fiat} "#,##0.00`;
  const wb = await newBook();
  const ws = wb.addWorksheet("History", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }], properties: { tabColor: { argb: NAVY } } });
  const headers = ["Date", "Direction", "What", "Amount", "Asset", `${fiat} value`, "Other wallet", "Memo", "Proof on Stellar"];
  ws.columns = [18, 11, 34, 12, 8, 14, 24, 18, 18].map((w) => ({ width: w }));
  titleBlock(ws, { title: "SettleSync · Payment history", subtitle: `Wallet ${owner}  ·  Exported ${new Date().toLocaleString("en-IN")}`, cols: headers.length });
  headerRow(ws, 4, headers);
  let r = 5;
  for (const p of payments) {
    const what = describePayment(p);
    const rate = what.kind === "request" || what.kind === "code" ? null : await rateOn(p.assetCode, p.createdAt, fiat);
    const row = ws.getRow(r);
    row.values = [
      new Date(p.createdAt), p.direction === "in" ? "Received" : "Sent", what.label, Number(p.amount), p.assetCode,
      rate ? Number(p.amount) * rate : null, p.direction === "in" ? p.from : p.to, p.memo || "",
      { text: "View transaction", hyperlink: NETWORK.explorerTx(p.hash) },
    ];
    row.getCell(1).numFmt = "dd mmm yyyy hh:mm";
    row.getCell(4).numFmt = "#,##0.00##";
    row.getCell(6).numFmt = fmtFiat;
    row.getCell(2).font = { bold: true, color: { argb: p.direction === "in" ? "FF1D7A4C" : RED } };
    row.getCell(7).font = { size: 9, color: { argb: "FF7A8098" } };
    row.getCell(9).font = { color: { argb: RED }, underline: true };
    r++;
  }
  styleBody(ws, 5, r - 1, headers.length);
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, r - 1), column: headers.length } };
  notes(ws, r + 1, headers.length, ["Values use CoinGecko's daily rate for each payment date. A record, not tax advice."]);
  await download(wb, `settlesync-history-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
