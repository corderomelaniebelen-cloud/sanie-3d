import {
  formatOrderNumber,
  formatMoney,
  formatMoneyOrDash,
  formatQuantity,
  calcItemSubtotal,
  calcOrderTotal,
  calcOrderUnits,
  parseISODateLocal,
  escapeHtml
} from "./firebase.js?v=20261127";

let modalReady = false;
let currentOrder = null;
let ticketMode = false;

function formatFullDateArg(dateStr) {
  const d = parseISODateLocal(dateStr);
  if (!d) return "A coordinar";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function ensureReceiptDom() {
  if (modalReady) return;

  const printArea = document.createElement("div");
  printArea.id = "printReceiptArea";
  printArea.className = "print-only-area";
  document.body.appendChild(printArea);

  const modal = document.createElement("div");
  modal.id = "receiptModal";
  modal.className = "modal-backdrop";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "receiptModalTitle");
  modal.innerHTML = `
    <div class="modal-panel modal-panel-wide">
      <div class="modal-head">
        <h2 id="receiptModalTitle">Boleta de Pedido</h2>
        <button id="closeReceiptModal" class="modal-close" type="button" aria-label="Cerrar">&times;</button>
      </div>
      <div class="modal-body">
        <div class="receipt-toolbar">
          <div class="pill-group">
            <button type="button" id="btnModeA4" class="pill-btn active">Boleta A4 / PDF</button>
            <button type="button" id="btnModeTicket" class="pill-btn">Ticket 80mm</button>
          </div>
          <div class="toolbar-group">
            <button type="button" id="btnPrintReceiptNow" class="btn btn-primary btn-sm">Imprimir / Guardar PDF</button>
          </div>
        </div>
        <div id="receiptPreviewWrapper" class="receipt-preview-wrap"></div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById("closeReceiptModal").addEventListener("click", closeReceiptModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeReceiptModal();
  });

  document.getElementById("btnModeA4").addEventListener("click", () => {
    ticketMode = false;
    document.getElementById("btnModeA4").classList.add("active");
    document.getElementById("btnModeTicket").classList.remove("active");
    renderReceiptContents();
  });

  document.getElementById("btnModeTicket").addEventListener("click", () => {
    ticketMode = true;
    document.getElementById("btnModeTicket").classList.add("active");
    document.getElementById("btnModeA4").classList.remove("active");
    renderReceiptContents();
  });

  document.getElementById("btnPrintReceiptNow").addEventListener("click", () => {
    if (!currentOrder) return;
    renderReceiptContents();
    window.print();
  });

  modalReady = true;
}

function closeReceiptModal() {
  document.getElementById("receiptModal")?.classList.remove("open");
}

function buildReceiptHtml(order) {
  const numStr = formatOrderNumber(order.orderNumber);
  const issuedDate = new Date().toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
  const deliveryDate = formatFullDateArg(order.date);
  const total = calcOrderTotal(order);
  const totalUnits = calcOrderUnits(order);

  const items = Array.isArray(order.items) && order.items.length > 0
    ? order.items
    : [{
        product: order.product || "Sin producto",
        description: order.description || "",
        price: Number(order.price) || 0,
        quantity: Number(order.quantity) || 1
      }];

  const rowsHtml = items
    .map((it) => {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.price) || 0;
      const sub = calcItemSubtotal(it);
      const descHtml = it.description
        ? `<div class="rcp-item-desc">${escapeHtml(it.description)}</div>`
        : "";
      return `
        <tr>
          <td>
            <div class="rcp-item-name">${escapeHtml(it.product || "Sin producto")}</div>
            ${descHtml}
          </td>
          <td class="mono rcp-num">${escapeHtml(qty > 0 ? formatQuantity(qty) : "—")}</td>
          <td class="mono rcp-num">${escapeHtml(price > 0 ? formatMoney(price) : "A cotizar")}</td>
          <td class="mono rcp-num"><strong>${escapeHtml(sub > 0 ? formatMoney(sub) : "—")}</strong></td>
        </tr>`;
    })
    .join("");

  const notesHtml = order.notes
    ? `<div class="rcp-notes"><strong>Notas:</strong> ${escapeHtml(order.notes)}</div>`
    : "";

  const contactHtml = order.contact
    ? `<div><span>Contacto:</span> <strong>${escapeHtml(order.contact)}</strong></div>`
    : "";

  return `
    <article class="receipt-sheet ${ticketMode ? "receipt-ticket" : ""}">
      <header class="rcp-head">
        <div>
          <div class="rcp-brand">SANIE 3D</div>
          <div class="rcp-tagline">Taller de Impresión 3D · Diseños Personalizados</div>
        </div>
        <div class="rcp-doc-box">
          <span class="rcp-doc-label">COMPROBANTE DE PEDIDO</span>
          <strong class="mono rcp-doc-num">${escapeHtml(numStr)}</strong>
        </div>
      </header>

      <section class="rcp-meta-grid">
        <div>
          <div><span>Cliente:</span> <strong>${escapeHtml(order.client || "Consumidor Final")}</strong></div>
          ${contactHtml}
        </div>
        <div class="rcp-meta-right">
          <div><span>Emisión:</span> <strong class="mono">${escapeHtml(issuedDate)}</strong></div>
          <div><span>Entrega:</span> <strong class="mono">${escapeHtml(deliveryDate)}</strong></div>
          <div><span>Estado:</span> <strong>${escapeHtml(order.status || "Pending")}</strong></div>
        </div>
      </section>

      <table class="rcp-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th class="rcp-num">Cant.</th>
            <th class="rcp-num">P. Unit.</th>
            <th class="rcp-num">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      ${notesHtml}

      <footer class="rcp-total-bar">
        <div class="rcp-units-info">${items.length} ${items.length === 1 ? "ítem" : "ítems"} · ${escapeHtml(formatQuantity(totalUnits))} ${totalUnits === 1 ? "unidad" : "unidades"}</div>
        <div class="rcp-grand-total">
          <span>TOTAL</span>
          <strong class="mono">${escapeHtml(total > 0 ? formatMoneyOrDash(total) : "A cotizar")}</strong>
        </div>
      </footer>

      <p class="rcp-legal">
        Gracias por elegir Sanie 3D · Comprobante interno de pedido (documento no válido como factura fiscal).
      </p>
    </article>`;
}

function renderReceiptContents() {
  if (!currentOrder) return;
  const html = buildReceiptHtml(currentOrder);
  const preview = document.getElementById("receiptPreviewWrapper");
  const printArea = document.getElementById("printReceiptArea");
  if (preview) preview.innerHTML = html;
  if (printArea) printArea.innerHTML = html;
}

export function openReceiptModal(order) {
  ensureReceiptDom();
  currentOrder = order;
  document.getElementById("receiptModalTitle").textContent = `Boleta ${formatOrderNumber(order.orderNumber)}`;
  renderReceiptContents();
  document.getElementById("receiptModal").classList.add("open");
}
