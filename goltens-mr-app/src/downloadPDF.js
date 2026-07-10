/**
 * downloadPDF.js
 * Opens a print-ready window that exactly matches the portal form styling.
 * Page 1 = MR Form, Pages 2+ = Supporting documents (rendered via PDF.js).
 * Font: Inter (professional)
 */
import { getDocumentUrls } from "./api";

// Render PDF pages as base64 images using PDF.js
async function pdfToImages(pdfUrl) {
  try {
    // Load PDF.js from CDN
    if (!window.pdfjsLib) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }

    const loadingTask = window.pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false });
    const pdfDoc = await loadingTask.promise;
    const images = [];

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.8 }); // High quality
      const canvas = document.createElement("canvas");
      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      images.push(canvas.toDataURL("image/jpeg", 0.92));
    }
    return images;
  } catch (e) {
    console.warn("PDF.js render failed:", e);
    return null;
  }
}

export async function downloadMRWithDocs(mr) {
  // Get presigned URLs and render PDFs as images via PDF.js
  const docBlobs = [];
  if (mr.document_s3_keys && mr.document_s3_keys.length > 0) {
    try {
      const docData = await getDocumentUrls(mr.mr_id);
      const docs = Array.isArray(docData) ? docData : (docData?.documents || []);
      for (const doc of docs) {
        try {
          const url      = doc.url || doc.s3_key || "";
          const rawName  = doc.filename || doc.file_name || url.split("/").slice(-1)[0].split("?")[0];
          const filename = rawName.replace(/^[0-9a-f]{32}_/i, "");
          const isPdf    = /\.pdf$/i.test(filename);
          const isImage  = /\.(jpg|jpeg|png|gif|webp)$/i.test(filename);
          if (!url) continue;
          if (isPdf) {
            const pages = await pdfToImages(url);
            docBlobs.push({ blobUrl: url, filename, isPdf, isImage, pdfPages: pages });
          } else {
            docBlobs.push({ blobUrl: url, filename, isPdf, isImage, pdfPages: null });
          }
        } catch (e) {
          console.warn("Could not process doc:", doc, e);
        }
      }
    } catch(e) {
      console.warn("Could not fetch document URLs:", e);
    }
  }

  const total = parseFloat(mr.total_cost || 0).toLocaleString("en-AE", { minimumFractionDigits: 2 });

  const itemRows = (mr.items || []).map((it, i) => `
    <tr class="${i % 2 === 0 ? "row-even" : "row-odd"}">
      <td class="tc">${i + 1}</td>
      <td>${it.item_code || ""}</td>
      <td class="desc">${it.description || ""}</td>
      <td class="tc">${it.qty || ""}</td>
      <td class="tc">${it.uom || ""}</td>
      <td>${it.activity_code || ""}</td>
      <td class="tr">${parseFloat(it.estimated_cost || 0).toLocaleString("en-AE", { minimumFractionDigits: 2 })}</td>
      <td class="tc">${it.budgeted || ""}</td>
    </tr>`).join("");

  const sigs = [
    { title: "Requested By",           name: mr.submitted_by_name || "—",        id: mr.submitted_by_id_no || "—" },
    { title: "Approved By (Manager)",  name: mr.approved_by || mr.manager_approved_by || "—", id: "—" },
    { title: "Approved By (HOD/GM)",   name: mr.hod_approved_by || "—",          id: "—" },
    { title: "M.R. Received By",       name: mr.sc_received_by_name || "—",      id: mr.sc_received_by_id || "—" },
    { title: "Items Issued To",        name: mr.warehouse_issued_to_name || mr.issued_to_name || "—", id: mr.warehouse_issued_to_id || "—" },
  ];

  const sigBoxes = sigs.map(s => `
    <div class="sig-box">
      <div class="sig-title">${s.title}</div>
      <div class="sig-field"><span class="sig-lbl">Name</span><span class="sig-val">${s.name}</span></div>
      <div class="sig-field"><span class="sig-lbl">ID No.</span><span class="sig-val">${s.id}</span></div>
      <div class="sig-field"><span class="sig-lbl">Signature</span><span class="sig-val sig-sign">________________________</span></div>
    </div>`).join("");

  const statusColor = {
    APPROVED: "#1a7a4a", ISSUED: "#1a7a4a",
    REJECTED: "#c0392b",
    PENDING_HOD: "#7b1fa2",
    IN_PROCESS: "#b8860b",
    PENDING: "#1B6CA8",
  }[mr.status] || "#1A3A5C";

  const docPages = docBlobs.map((doc, i) => `
    <div class="doc-page">
      <div class="doc-page-header">
        <div class="doc-page-title">Supporting Document ${i + 1} of ${docBlobs.length}</div>
        <div class="doc-filename">📎 ${doc.filename}</div>
      </div>
      <div class="doc-content">
        ${(() => {
          if (doc.isImage) return '<img src="' + doc.blobUrl + '" style="max-width:100%;max-height:230mm;object-fit:contain;display:block;margin:0 auto;border-radius:4px"/>';
          if (doc.isPdf && doc.pdfPages && doc.pdfPages.length > 0) {
            return doc.pdfPages.map((imgData, pi) =>
              '<div style="width:100%;margin-bottom:8px;text-align:center;">' +
              '<div style="font-size:11px;color:#888;margin-bottom:4px;">Page ' + (pi+1) + ' of ' + doc.pdfPages.length + '</div>' +
              '<img src="' + imgData + '" style="width:100%;max-width:190mm;height:auto;display:block;margin:0 auto;border:1px solid #eee;"/>' +
              '</div>'
            ).join('');
          }
          if (doc.isPdf) return '<div style="text-align:center;padding:40px;background:#f8f9fa;border:2px dashed #ccc;border-radius:4px;"><div style="font-size:48px;margin-bottom:12px">📄</div><div style="font-weight:700;color:#1A3A5C;margin-bottom:8px">' + doc.filename + '</div><a href="' + doc.blobUrl + '" target="_blank" style="background:#1A3A5C;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;">📥 Open PDF</a></div>';
          return '<div style="text-align:center;padding:40px;background:#f8f9fa;"><div style="font-size:48px;margin-bottom:12px">📎</div><div style="font-size:14px;color:#333">' + doc.filename + '</div></div>';
        })()}
      </div>
    </div>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>MR ${mr.mr_id} — Goltens Co. Ltd. Dubai Branch</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', Arial, sans-serif;
    font-size: 11px;
    color: #1A1A1A;
    background: #f5f7fa;
    -webkit-font-smoothing: antialiased;
  }

  @page { size: A4 portrait; margin: 12mm 14mm 12mm 14mm; }

  @media print {
    body { background: #fff; }
    .no-print { display: none !important; }
    .form-page, .doc-page { page-break-after: always; box-shadow: none; margin: 0; border-radius: 0; }
    .form-page:last-of-type { page-break-after: avoid; }
  }

  /* ── Print button ── */
  .print-bar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 999;
    background: #1A3A5C; padding: 10px 24px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .print-bar-title { color: #fff; font-weight: 700; font-size: 14px; }
  .print-bar-sub   { color: rgba(255,255,255,0.65); font-size: 11px; margin-top:2px; }
  .print-btn {
    background: #1B6CA8; color: #fff; border: none; border-radius: 6px;
    padding: 9px 22px; font-size: 13px; font-weight: 600; cursor: pointer;
    font-family: 'Inter', Arial, sans-serif;
  }
  .print-btn:hover { background: #155a8f; }

  /* ── Page container ── */
  .pages-wrap { padding: 80px 32px 32px; max-width: 820px; margin: 0 auto; }

  @media print {
    .pages-wrap { padding: 0; max-width: 100%; }
  }

  /* ── Form page ── */
  .form-page {
    background: #fff; border-radius: 8px;
    box-shadow: 0 2px 16px rgba(0,0,0,0.10);
    padding: 24px 28px; margin-bottom: 24px;
  }

  /* ── Header ── */
  .header {
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 2.5px solid #1A3A5C; padding-bottom: 14px; margin-bottom: 14px;
  }
  .logo-wrap { display: flex; align-items: center; gap: 10px; }
  .logo-icon {
    width: 42px; height: 42px; background: #1A3A5C; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; font-weight: 800; color: #fff; letter-spacing: -1px;
  }
  .logo-name   { font-weight: 700; font-size: 17px; color: #1A3A5C; }
  .logo-branch { font-size: 10px; color: #5a7a96; margin-top: 1px; }
  .title-area  { text-align: right; }
  .form-title  { font-weight: 700; font-size: 11px; color: #1A3A5C; text-transform: uppercase; letter-spacing: 1px; }
  .mr-no-wrap  { margin-top: 4px; }
  .mr-no-lbl   { font-size: 10px; color: #5a7a96; }
  .mr-no       { font-size: 20px; font-weight: 800; color: #c0392b; letter-spacing: 2px; margin-left: 4px; }

  /* ── Status badge ── */
  .status-badge {
    display: inline-block; padding: 3px 12px; border-radius: 10px;
    font-size: 10px; font-weight: 700; margin-bottom: 10px;
    background: #E8F2F9; color: ${statusColor};
    border: 1px solid ${statusColor}44;
  }

  /* ── Purpose box ── */
  .purpose-box {
    background: #fff8e1; border: 1px solid #ffe082; border-radius: 6px;
    padding: 9px 14px; margin-bottom: 12px; font-size: 11px; line-height: 1.6;
  }
  .purpose-lbl { font-weight: 700; color: #1A3A5C; margin-right: 6px; }

  /* ── Meta grid ── */
  .meta-grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 8px 20px; margin-bottom: 12px;
  }
  .meta-lbl { font-size: 9px; font-weight: 600; color: #5a7a96; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .meta-val { font-size: 11px; font-weight: 600; color: #1A3A5C; }

  /* ── Items table ── */
  .items-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 6px; }
  .items-table th {
    background: #1A3A5C; color: #fff; padding: 6px 8px;
    text-align: left; font-weight: 600; font-size: 9.5px;
    white-space: nowrap;
  }
  .items-table td { padding: 5px 8px; border-bottom: 1px solid #B8D4E8; vertical-align: middle; }
  .row-even { background: #fff; }
  .row-odd  { background: #E8F2F9; }
  .tc { text-align: center; }
  .tr { text-align: right; }
  .desc { min-width: 100px; }

  .total-row { display: flex; justify-content: flex-end; align-items: center; gap: 14px; margin: 6px 0 12px; }
  .total-lbl { font-weight: 600; color: #5a7a96; font-size: 11px; }
  .total-val { font-weight: 800; font-size: 15px; color: #1B6CA8; }

  /* ── Notes ── */
  .note { border-radius: 5px; padding: 7px 12px; font-size: 10px; margin-bottom: 8px; line-height: 1.5; }
  .note-rejection { background: #fff5f5; border: 1px solid #f5c6c6; color: #c0392b; }
  .note-inprocess  { background: #fff8e1; border: 1px solid #ffe082; color: #b8860b; }
  .note-sc         { background: #e8f5e9; border: 1px solid #a5d6a7; color: #1a7a4a; }

  /* ── Signatories ── */
  .sig-grid {
    display: grid; grid-template-columns: repeat(5, 1fr);
    gap: 7px; border-top: 1px solid #B8D4E8; padding-top: 12px; margin-top: 6px;
  }
  .sig-box { border: 1px solid #B8D4E8; border-radius: 6px; padding: 8px 9px; background: #E8F2F9; }
  .sig-title {
    font-weight: 700; color: #1A3A5C; font-size: 9px; margin-bottom: 7px;
    padding-bottom: 4px; border-bottom: 1px solid #B8D4E8;
  }
  .sig-field { margin-bottom: 5px; }
  .sig-lbl   { display: block; font-size: 8px; color: #5a7a96; margin-bottom: 1px; }
  .sig-val   { font-size: 9.5px; font-weight: 600; color: #1A3A5C; display: block; }
  .sig-sign  { color: #bbb !important; font-weight: 400 !important; }

  /* ── Copy note ── */
  .copy-note {
    font-size: 8.5px; color: #5a7a96;
    border-top: 1px solid #B8D4E8; padding-top: 8px; margin-top: 8px;
    line-height: 1.6;
  }

  /* ── Doc pages ── */
  .doc-page {
    background: #fff; border-radius: 8px;
    box-shadow: 0 2px 16px rgba(0,0,0,0.10);
    padding: 24px 28px; margin-bottom: 24px;
  }
  .doc-page-header { border-bottom: 2px solid #1A3A5C; padding-bottom: 10px; margin-bottom: 16px; }
  .doc-page-title  { font-weight: 700; font-size: 12px; color: #1A3A5C; }
  .doc-filename    { font-size: 11px; color: #5a7a96; margin-top: 3px; }
  .doc-content     { display: flex; justify-content: center; }
  .doc-unsupported { text-align: center; padding: 40px; color: #888; }
</style>
</head>
<body>

<!-- Print bar -->
<div class="print-bar no-print">
  <div>
    <div class="print-bar-title">MR ${mr.mr_id} — Goltens Co. Ltd. Dubai Branch</div>
    <div class="print-bar-sub">${docBlobs.length > 0 ? `Form + ${docBlobs.length} supporting document(s)` : "Form only — no supporting documents"}</div>
  </div>
  <button class="print-btn" onclick="window.print()">⬇ Save as PDF</button>
</div>

<div class="pages-wrap">

  <!-- ══ PAGE 1: MR FORM ══ -->
  <div class="form-page">

    <!-- Header -->
    <div class="header">
      <div class="logo-wrap">
        <div class="logo-icon">G</div>
        <div>
          <div class="logo-name">Goltens</div>
          <div class="logo-branch">Co. Ltd. Dubai Branch</div>
        </div>
      </div>
      <div class="title-area">
        <div class="form-title">Material Requisition / Store Issue</div>
        <div class="mr-no-wrap">
          <span class="mr-no-lbl">No.</span>
          <span class="mr-no">${mr.mr_id}</span>
        </div>
      </div>
    </div>

    <!-- Status -->
    <div>
      <span class="status-badge">${(mr.status || "").replace(/_/g, " ")}</span>
    </div>

    <!-- Purpose -->
    ${mr.purpose ? `<div class="purpose-box"><span class="purpose-lbl">Purpose:</span>${mr.purpose}</div>` : ""}

    <!-- Meta -->
    <div class="meta-grid">
      <div><div class="meta-lbl">Vessel</div><div class="meta-val">${mr.vessel || "—"}</div></div>
      <div><div class="meta-lbl">Department</div><div class="meta-val">${mr.department || "—"}</div></div>
      <div><div class="meta-lbl">Job No.</div><div class="meta-val">${mr.job_no || "—"}</div></div>
      <div><div class="meta-lbl">Date Requested</div><div class="meta-val">${mr.date_requested || "—"}</div></div>
      <div><div class="meta-lbl">Date Required</div><div class="meta-val">${mr.date_required || "—"}</div></div>
      <div><div class="meta-lbl">Form Type</div><div class="meta-val">${(mr.form_type || "Material Requisition").replace(/_/g, " ")}</div></div>
    </div>

    <!-- Items table -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width:32px">S.N.</th>
          <th>Item Code</th>
          <th class="desc">Description</th>
          <th>Qty</th>
          <th>U.O.M</th>
          <th>Activity Code</th>
          <th>Est. Cost (AED)</th>
          <th>Budgeted</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="total-row">
      <span class="total-lbl">Total Estimated Cost:</span>
      <span class="total-val">AED ${total}</span>
    </div>

    <!-- Notes -->
    ${mr.rejection_reason ? `<div class="note note-rejection"><strong>Rejection Reason:</strong> ${mr.rejection_reason}</div>` : ""}
    ${mr.inprocess_note   ? `<div class="note note-inprocess"><strong>In Process Note:</strong> ${mr.inprocess_note}</div>` : ""}
    ${mr.warehouse_collection_comment ? `<div class="note note-sc"><strong>Supply Chain Note:</strong> ${mr.warehouse_collection_comment}</div>` : ""}

    <!-- Signatories -->
    <div class="sig-grid">${sigBoxes}</div>

    <!-- Footer -->
    <div class="copy-note">
      White — Accounts &nbsp;|&nbsp; Yellow — Purchase &nbsp;|&nbsp; Blue — Originator
      &nbsp;·&nbsp; Item issued by supply chain, mention as issued &nbsp;·&nbsp; FO-552-0201, Rev.06 (Jan 18)
    </div>

  </div>
  <!-- end form-page -->

  ${docPages}

</div>
</body>
</html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  // PDF.js rendering already done before window opens, just delay for paint
  win.onload = () => setTimeout(() => { try { win.print(); } catch(e) {} }, 1000);
}