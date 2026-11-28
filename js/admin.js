import {
  db,
  auth,
  ORDER_STATUSES,
  STARTER_CATALOG,
  INITIAL_EXCEL_ORDERS,
  allocateNextOrderNumber,
  normalizeOrder,
  normalizeOrderItem,
  calcItemSubtotal,
  calcItemsTotal,
  calcOrderTotal,
  formatOrderNumber,
  formatMoney,
  formatMoneyOrDash,
  formatQuantity,
  formatShortDate,
  computeDaysLeft,
  todayISO,
  addDaysISO,
  escapeHtml
} from "./firebase.js?v=20261127";
import { getProductIllustration } from "./icons.js?v=20261127";
import { openReceiptModal } from "./receipt.js?v=20261127";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const authSection = document.getElementById("authSection");
const adminSection = document.getElementById("adminSection");
const adminUserEmail = document.getElementById("adminUserEmail");
const btnSignOut = document.getElementById("btnSignOut");
const authErrorBox = document.getElementById("authErrorBox");
const permissionErrorBanner = document.getElementById("permissionErrorBanner");

const tabOrders = document.getElementById("tabOrders");
const tabCatalog = document.getElementById("tabCatalog");
const ordersView = document.getElementById("ordersView");
const catalogView = document.getElementById("catalogView");

const seedOrdersBanner = document.getElementById("seedOrdersBanner");
const ordersTableBody = document.getElementById("ordersTableBody");
const ordersSearch = document.getElementById("ordersSearch");
const ordersStatusFilter = document.getElementById("ordersStatusFilter");
const adminCatalogGrid = document.getElementById("adminCatalogGrid");

const kpiPending = document.getElementById("kpiPending");
const kpiProcessing = document.getElementById("kpiProcessing");
const kpiReady = document.getElementById("kpiReady");
const kpiDelivered = document.getElementById("kpiDelivered");
const kpiGrandTotal = document.getElementById("kpiGrandTotal");
const historyCountBadge = document.getElementById("historyCountBadge");

// Order modal elements
const adminOrderModal = document.getElementById("adminOrderModal");
const adminOrderModalTitle = document.getElementById("adminOrderModalTitle");
const adminOrderForm = document.getElementById("adminOrderForm");
const editOrderId = document.getElementById("editOrderId");
const fOrderNumber = document.getElementById("fOrderNumber");
const fDate = document.getElementById("fDate");
const fStatus = document.getElementById("fStatus");
const fClient = document.getElementById("fClient");
const fContact = document.getElementById("fContact");
const fNotes = document.getElementById("fNotes");
const adminItemsContainer = document.getElementById("adminItemsContainer");
const fItemsSummary = document.getElementById("fItemsSummary");
const fTotalPreview = document.getElementById("fTotalPreview");
const fKeepAdding = document.getElementById("fKeepAdding");
const keepAddingWrap = document.getElementById("keepAddingWrap");
const saveAdminOrderBtn = document.getElementById("saveAdminOrderBtn");

// Product modal elements
const adminProductModal = document.getElementById("adminProductModal");
const adminProductModalTitle = document.getElementById("adminProductModalTitle");
const adminProductForm = document.getElementById("adminProductForm");
const editProductId = document.getElementById("editProductId");
const pName = document.getElementById("pName");
const pCategory = document.getElementById("pCategory");
const pDescription = document.getElementById("pDescription");
const pPrice = document.getElementById("pPrice");
const pLeadDays = document.getElementById("pLeadDays");
const pMaterial = document.getElementById("pMaterial");
const pBadge = document.getElementById("pBadge");
const pIconKey = document.getElementById("pIconKey");
const pSortOrder = document.getElementById("pSortOrder");
const pImageUrl = document.getElementById("pImageUrl");
const pImageFile = document.getElementById("pImageFile");
const pImageDropZone = document.getElementById("pImageDropZone");
const pImagePreviewRow = document.getElementById("pImagePreviewRow");
const pImagePreviewImg = document.getElementById("pImagePreviewImg");
const pImagePreviewMeta = document.getElementById("pImagePreviewMeta");
const btnPickProductImage = document.getElementById("btnPickProductImage");
const btnClearProductImage = document.getElementById("btnClearProductImage");
const pActive = document.getElementById("pActive");
const saveAdminProductBtn = document.getElementById("saveAdminProductBtn");

let orders = [];
let catalogItems = [];
let modalItems = [];
let uploadedProductImageDataUrl = "";
let sortByDeliveryDate = false;
let unsubOrders = null;
let unsubCatalog = null;

function showToast(message, isError = false) {
  const container = document.getElementById("toastContainer");
  const el = document.createElement("div");
  el.className = `toast${isError ? " error" : ""}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function showAuthError(msg) {
  authErrorBox.textContent = msg;
  authErrorBox.classList.remove("hidden");
}

function clearAuthError() {
  authErrorBox.textContent = "";
  authErrorBox.classList.add("hidden");
}

function mapAuthError(err) {
  const code = err?.code || "";
  if (code === "auth/unauthorized-domain") {
    return `Este dominio (${location.hostname}) todavía no está autorizado en Firebase Console → Authentication → Settings → Authorized domains.`;
  }
  if (code === "auth/popup-closed-by-user") {
    return "Cerraste la ventana de inicio de sesión antes de completar el ingreso.";
  }
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Correo o contraseña incorrectos.";
  }
  return err?.message || "No se pudo iniciar sesión.";
}

document.getElementById("btnGoogleSignIn").addEventListener("click", async () => {
  clearAuthError();
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (err) {
    showAuthError(mapAuthError(err));
  }
});

document.getElementById("emailLoginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAuthError();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    showAuthError(mapAuthError(err));
  }
});

btnSignOut.addEventListener("click", async () => {
  await signOut(auth);
});

function stopListeners() {
  if (unsubOrders) { unsubOrders(); unsubOrders = null; }
  if (unsubCatalog) { unsubCatalog(); unsubCatalog = null; }
}

function getMaxOrderNumber() {
  return orders.reduce((max, o) => Math.max(max, Number(o.orderNumber) || 0), 0);
}

function updateSuggestions() {
  const prodList = document.getElementById("productSuggestions");
  const clientList = document.getElementById("clientSuggestions");
  const itemProducts = orders.flatMap((o) => o.items.map((it) => it.product));
  const uniqueProds = [...new Set([
    ...catalogItems.map((c) => c.name),
    ...itemProducts
  ].filter(Boolean))];
  const uniqueClients = [...new Set(orders.map((o) => o.client).filter(Boolean))];

  prodList.innerHTML = uniqueProds.map((p) => `<option value="${escapeHtml(p)}"></option>`).join("");
  clientList.innerHTML = uniqueClients.map((c) => `<option value="${escapeHtml(c)}"></option>`).join("");
}

function renderKPIs() {
  let pending = 0;
  let processing = 0;
  let ready = 0;
  let delivered = 0;
  let activeTotalMoney = 0;

  for (const o of orders) {
    if (o.status === "Pending") pending++;
    else if (o.status === "Processing") processing++;
    else if (o.status === "Ready") ready++;
    else if (o.status === "Delivered") delivered++;

    if (o.status !== "Delivered") {
      activeTotalMoney += calcOrderTotal(o);
    }
  }

  kpiPending.textContent = String(pending);
  kpiProcessing.textContent = String(processing);
  kpiReady.textContent = String(ready);
  kpiDelivered.textContent = String(delivered);
  if (historyCountBadge) historyCountBadge.textContent = String(delivered);
  kpiGrandTotal.textContent = formatMoney(activeTotalMoney) || "$ 0";
}

function getVisibleOrders() {
  const term = ordersSearch.value.trim().toLowerCase();
  const statusFilter = ordersStatusFilter.value;

  const filtered = orders.filter((o) => {
    if (o.status === "Delivered") return false;
    const okStatus = statusFilter === "ALL" || o.status === statusFilter;
    const itemsText = o.items
      .map((it) => `${it.product || ""} ${it.description || ""}`)
      .join(" ")
      .toLowerCase();
    const numText = formatOrderNumber(o.orderNumber).toLowerCase();
    const okSearch =
      !term ||
      numText.includes(term) ||
      String(o.orderNumber || "").includes(term) ||
      (o.client || "").toLowerCase().includes(term) ||
      (o.contact || "").toLowerCase().includes(term) ||
      (o.notes || "").toLowerCase().includes(term) ||
      itemsText.includes(term);
    return okStatus && okSearch;
  });

  if (sortByDeliveryDate) {
    filtered.sort((a, b) => {
      if (!a.date && !b.date) return (b.orderNumber || 0) - (a.orderNumber || 0);
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });
  } else {
    filtered.sort((a, b) => (b.orderNumber || 0) - (a.orderNumber || 0));
  }

  return filtered;
}

function renderOrderItemsHtml(order) {
  const rows = order.items
    .map((it) => {
      const sub = calcItemSubtotal(it);
      const qtyLabel = it.quantity > 0 ? `${formatQuantity(it.quantity)}×` : "";
      const descHtml = it.description ? `<span class="order-item-desc">${escapeHtml(it.description)}</span>` : "";
      const subHtml = sub > 0
        ? escapeHtml(formatMoney(sub))
        : (it.price > 0 ? escapeHtml(formatMoney(it.price)) : "—");
      return `
        <li class="order-item-row">
          <div class="order-item-main">
            <span class="order-item-title">${qtyLabel ? `<span class="order-item-qty">${escapeHtml(qtyLabel)}</span>` : ""}${escapeHtml(it.product || "Sin producto")}</span>
            ${descHtml}
          </div>
          <span class="order-item-price">${subHtml}</span>
        </li>`;
    })
    .join("");

  const notesHtml = order.notes ? `<div class="order-notes-sub">Nota: ${escapeHtml(order.notes)}</div>` : "";
  return `<ul class="order-items-list">${rows}</ul>${notesHtml}`;
}

function renderOrdersTable() {
  renderKPIs();
  updateSuggestions();
  seedOrdersBanner.classList.toggle("hidden", orders.length > 0);

  const visible = getVisibleOrders();
  if (visible.length === 0) {
    const deliveredCount = orders.filter((o) => o.status === "Delivered").length;
    if (deliveredCount > 0 && !ordersSearch.value.trim() && ordersStatusFilter.value === "ALL") {
      ordersTableBody.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">
            No hay pedidos activos pendientes. Tenés <strong>${deliveredCount}</strong> en el
            <a href="./historial.html" style="text-decoration:underline;font-weight:700;color:var(--delivered-ink);">historial de entregados</a>.
          </td>
        </tr>`;
    } else {
      ordersTableBody.innerHTML = `<tr><td colspan="8" class="empty-state">No hay pedidos activos que coincidan con el filtro actual.</td></tr>`;
    }
    return;
  }

  ordersTableBody.innerHTML = visible
    .map((o) => {
      const days = computeDaysLeft(o.date, o.status);
      const totalVal = calcOrderTotal(o);
      const webTag = o.source === "web" ? `<span class="source-tag">Web</span>` : "";
      const contactHtml = o.contact ? `<span class="contact-sub">${escapeHtml(o.contact)}</span>` : "";

      const statusOptions = ORDER_STATUSES.map(
        (st) => `<option value="${st}" ${o.status === st ? "selected" : ""}>${st}</option>`
      ).join("");

      const deliveredBtnHtml = o.status === "Ready"
        ? `<button type="button" class="btn btn-delivered btn-sm btn-mark-delivered" data-id="${escapeHtml(o.id)}">Entregado</button>`
        : "";

      return `
        <tr data-id="${escapeHtml(o.id)}">
          <td>
            <span class="order-num-badge">${escapeHtml(formatOrderNumber(o.orderNumber))}</span>
            ${webTag}
          </td>
          <td class="mono">${escapeHtml(formatShortDate(o.date))}</td>
          <td><span class="days-pill ${days.kind}">${escapeHtml(days.text || "—")}</span></td>
          <td>
            <strong>${escapeHtml(o.client || "—")}</strong>
            ${contactHtml}
          </td>
          <td>${renderOrderItemsHtml(o)}</td>
          <td>
            <select class="status-select status-${escapeHtml(o.status)}" data-order-status="${escapeHtml(o.id)}">
              ${statusOptions}
            </select>
          </td>
          <td class="mono"><strong>${escapeHtml(formatMoneyOrDash(totalVal))}</strong></td>
          <td>
            <div class="row-actions">
              ${deliveredBtnHtml}
              <button type="button" class="btn btn-outline btn-sm btn-print-order" data-id="${escapeHtml(o.id)}">Boleta</button>
              <button type="button" class="btn btn-outline btn-sm btn-edit-order" data-id="${escapeHtml(o.id)}">Editar</button>
              <button type="button" class="btn btn-danger-outline btn-sm btn-del-order" data-id="${escapeHtml(o.id)}">Borrar</button>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  ordersTableBody.querySelectorAll("[data-order-status]").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const id = sel.dataset.orderStatus;
      const newStatus = sel.value;
      const existing = orders.find((x) => x.id === id);
      if (!existing) return;
      try {
        await updateDoc(doc(db, "orders", id), {
          status: newStatus,
          updatedAt: serverTimestamp()
        });
        showToast(
          newStatus === "Delivered"
            ? `Pedido ${formatOrderNumber(existing.orderNumber)} movido al historial`
            : `Estado actualizado a ${newStatus}`
        );
      } catch (err) {
        console.error(err);
        showToast("Error al actualizar estado", true);
        renderOrdersTable();
      }
    });
  });

  ordersTableBody.querySelectorAll(".btn-mark-delivered").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const order = orders.find((x) => x.id === id);
      if (!order) return;
      btn.disabled = true;
      try {
        await updateDoc(doc(db, "orders", id), {
          status: "Delivered",
          updatedAt: serverTimestamp()
        });
        showToast(`Pedido ${formatOrderNumber(order.orderNumber)} marcado como entregado`);
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        showToast("No se pudo marcar como entregado", true);
      }
    });
  });

  ordersTableBody.querySelectorAll(".btn-print-order").forEach((btn) => {
    btn.addEventListener("click", () => {
      const order = orders.find((x) => x.id === btn.dataset.id);
      if (order) openReceiptModal(order);
    });
  });

  ordersTableBody.querySelectorAll(".btn-edit-order").forEach((btn) => {
    btn.addEventListener("click", () => {
      const order = orders.find((x) => x.id === btn.dataset.id);
      if (order) openAdminOrderModal(order);
    });
  });

  ordersTableBody.querySelectorAll(".btn-del-order").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const order = orders.find((x) => x.id === btn.dataset.id);
      if (!order) return;
      btn.disabled = true;
      try {
        await deleteDoc(doc(db, "orders", order.id));
        showToast("Pedido eliminado");
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        showToast("No se pudo eliminar el pedido", true);
      }
    });
  });
}

function renderAdminCatalog() {
  if (catalogItems.length === 0) {
    adminCatalogGrid.innerHTML = `
      <div class="table-card empty-state" style="grid-column:1/-1;">
        <p style="margin:0 0 12px;">Todavía no hay productos en el catálogo de Firestore.</p>
        <button type="button" id="btnEmptySeedCatalog" class="btn btn-accent btn-sm">Cargar los 4 productos iniciales</button>
      </div>`;
    document.getElementById("btnEmptySeedCatalog")?.addEventListener("click", seedStarterCatalog);
    return;
  }

  adminCatalogGrid.innerHTML = catalogItems
    .map((item) => {
      const mediaHtml = item.imageUrl
        ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" />`
        : getProductIllustration(item.iconKey, item.category);
      const visBadge = item.active
        ? `<span class="product-badge" style="color:var(--delivered-ink);border-color:#bbf7d0;">Visible</span>`
        : `<span class="product-badge" style="color:var(--ink-subtle);">Oculto</span>`;

      return `
        <article class="product-card">
          <div class="product-media">
            ${visBadge}
            ${mediaHtml}
          </div>
          <div class="product-body">
            <div class="product-meta">
              <span>${escapeHtml(item.category)}</span>
              <span>Orden #${escapeHtml(String(item.sortOrder || 0))}</span>
            </div>
            <h3 class="product-title">${escapeHtml(item.name)}</h3>
            <p class="product-desc">${escapeHtml(item.description)}</p>
            <div class="product-footer">
              <div class="price-block">
                <strong class="mono">${escapeHtml(item.price > 0 ? formatMoney(item.price) : "A cotizar")}</strong>
                <span>${escapeHtml(item.material || "PLA+")} · ~${escapeHtml(String(item.leadTimeDays || 0))}d</span>
              </div>
              <div class="row-actions">
                <button type="button" class="btn btn-outline btn-sm btn-edit-prod" data-id="${escapeHtml(item.id)}">Editar</button>
                <button type="button" class="btn btn-danger-outline btn-sm btn-del-prod" data-id="${escapeHtml(item.id)}">Borrar</button>
              </div>
            </div>
          </div>
        </article>`;
    })
    .join("");

  adminCatalogGrid.querySelectorAll(".btn-edit-prod").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = catalogItems.find((p) => p.id === btn.dataset.id);
      if (item) openAdminProductModal(item);
    });
  });

  adminCatalogGrid.querySelectorAll(".btn-del-prod").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const item = catalogItems.find((p) => p.id === btn.dataset.id);
      if (!item) return;
      btn.disabled = true;
      try {
        await deleteDoc(doc(db, "catalog", item.id));
        showToast("Producto eliminado del catálogo");
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        showToast("No se pudo eliminar el producto", true);
      }
    });
  });
}

function buildOrderPayload(data, existingOrder = null) {
  const cleanItems = (data.items || []).map(normalizeOrderItem);
  const total = calcItemsTotal(cleanItems);
  return {
    orderNumber: Math.max(1, Math.min(1000000, Math.floor(Number(data.orderNumber) || 1))),
    date: String(data.date || "").slice(0, 10),
    client: String(data.client || "").slice(0, 100),
    contact: String(data.contact || "").slice(0, 120),
    status: ORDER_STATUSES.includes(data.status) ? data.status : "Pending",
    notes: String(data.notes || "").slice(0, 1000),
    items: cleanItems,
    total,
    source: existingOrder?.source || data.source || "admin",
    createdAt: existingOrder?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

function buildCatalogPayload(data, isUpdate = false) {
  const payload = {
    name: String(data.name || "").slice(0, 120),
    category: String(data.category || "3D").slice(0, 50),
    description: String(data.description || "").slice(0, 1000),
    material: String(data.material || "PLA+").slice(0, 80),
    price: Math.max(0, Number(data.price) || 0),
    leadTimeDays: Math.max(0, Math.round(Number(data.leadTimeDays) || 0)),
    badge: String(data.badge || "").slice(0, 40),
    imageUrl: String(data.imageUrl || "").slice(0, 450000),
    iconKey: String(data.iconKey || "custom").slice(0, 40),
    active: Boolean(data.active),
    sortOrder: Math.max(0, Number(data.sortOrder) || 1),
    updatedAt: serverTimestamp()
  };
  if (!isUpdate) {
    payload.createdAt = serverTimestamp();
  }
  return payload;
}

function updateOrderFormTotal() {
  const total = calcItemsTotal(modalItems);
  const totalUnits = modalItems.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  fItemsSummary.textContent = `${modalItems.length} ${modalItems.length === 1 ? "producto" : "productos"} · ${formatQuantity(totalUnits)} u.`;
  fTotalPreview.textContent = formatMoney(total) || "$ 0";
}

function renderModalItems() {
  adminItemsContainer.innerHTML = modalItems
    .map((it, idx) => {
      const sub = calcItemSubtotal(it);
      return `
        <div class="item-editor-card" data-idx="${idx}">
          <div class="item-editor-top">
            <input type="text" class="input adm-item-prod" data-idx="${idx}" list="productSuggestions" maxlength="140" value="${escapeHtml(it.product)}" placeholder="Producto (ej: Mate motor)" />
            ${modalItems.length > 1 ? `<button type="button" class="btn btn-danger-outline btn-sm adm-item-del" data-idx="${idx}">Quitar</button>` : ""}
          </div>
          <input type="text" class="input adm-item-desc" data-idx="${idx}" maxlength="500" value="${escapeHtml(it.description)}" placeholder="Descripción / color / detalles (opcional)" />
          <div class="item-editor-nums">
            <div class="field">
              <label>Precio unit. ($)</label>
              <input type="number" class="input adm-item-price" data-idx="${idx}" min="0" step="any" value="${it.price > 0 ? escapeHtml(String(it.price)) : ""}" placeholder="0" />
            </div>
            <div class="field">
              <label>Cantidad</label>
              <input type="number" class="input adm-item-qty" data-idx="${idx}" min="0" step="any" value="${escapeHtml(String(it.quantity))}" />
            </div>
            <span class="item-subtotal-pill">${escapeHtml(formatMoney(sub) || "$ 0")}</span>
          </div>
        </div>`;
    })
    .join("");

  adminItemsContainer.querySelectorAll(".adm-item-prod").forEach((inp) => {
    inp.addEventListener("input", () => {
      const idx = Number(inp.dataset.idx);
      modalItems[idx].product = inp.value;
    });
    inp.addEventListener("change", () => {
      const idx = Number(inp.dataset.idx);
      const match = catalogItems.find((c) => c.name.toLowerCase() === inp.value.trim().toLowerCase());
      if (match && match.price > 0 && !(Number(modalItems[idx].price) > 0)) {
        modalItems[idx].price = Number(match.price);
        modalItems[idx].catalogId = match.id;
        renderModalItems();
      }
    });
  });

  adminItemsContainer.querySelectorAll(".adm-item-desc").forEach((inp) => {
    inp.addEventListener("input", () => {
      modalItems[Number(inp.dataset.idx)].description = inp.value;
    });
  });

  adminItemsContainer.querySelectorAll(".adm-item-price").forEach((inp) => {
    inp.addEventListener("input", () => {
      const idx = Number(inp.dataset.idx);
      modalItems[idx].price = Math.max(0, Number(inp.value) || 0);
      const card = inp.closest(".item-editor-card");
      card.querySelector(".item-subtotal-pill").textContent = formatMoney(calcItemSubtotal(modalItems[idx])) || "$ 0";
      updateOrderFormTotal();
    });
  });

  adminItemsContainer.querySelectorAll(".adm-item-qty").forEach((inp) => {
    inp.addEventListener("input", () => {
      const idx = Number(inp.dataset.idx);
      modalItems[idx].quantity = Math.max(0, Number(inp.value) || 0);
      const card = inp.closest(".item-editor-card");
      card.querySelector(".item-subtotal-pill").textContent = formatMoney(calcItemSubtotal(modalItems[idx])) || "$ 0";
      updateOrderFormTotal();
    });
  });

  adminItemsContainer.querySelectorAll(".adm-item-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      modalItems.splice(Number(btn.dataset.idx), 1);
      renderModalItems();
    });
  });

  updateOrderFormTotal();
}

function openAdminOrderModal(order = null) {
  adminOrderForm.reset();
  if (order) {
    adminOrderModalTitle.textContent = `Editar Pedido ${formatOrderNumber(order.orderNumber)}`;
    saveAdminOrderBtn.textContent = "Guardar Cambios";
    keepAddingWrap.classList.add("hidden");
    editOrderId.value = order.id;
    fOrderNumber.value = String(order.orderNumber > 0 ? order.orderNumber : getMaxOrderNumber() + 1);
    fDate.value = order.date || "";
    fStatus.value = order.status || "Pending";
    fClient.value = order.client || "";
    fContact.value = order.contact || "";
    fNotes.value = order.notes || "";
    modalItems = order.items.map(normalizeOrderItem);
  } else {
    const nextNum = getMaxOrderNumber() + 1;
    adminOrderModalTitle.textContent = `Nuevo Pedido (#${String(nextNum).padStart(3, "0")})`;
    saveAdminOrderBtn.textContent = "Agregar Pedido";
    keepAddingWrap.classList.remove("hidden");
    editOrderId.value = "";
    fOrderNumber.value = String(nextNum);
    fDate.value = todayISO();
    fStatus.value = "Pending";
    fNotes.value = "";
    modalItems = [normalizeOrderItem({ product: "", description: "", price: 0, quantity: 1, catalogId: "" })];
  }
  renderModalItems();
  adminOrderModal.classList.add("open");
  fClient.focus();
}

function updateProductImagePreview(src, label = "") {
  if (!src) {
    pImagePreviewRow.classList.add("hidden");
    pImagePreviewImg.removeAttribute("src");
    pImagePreviewMeta.textContent = "";
    return;
  }
  pImagePreviewImg.src = src;
  pImagePreviewMeta.textContent = label || (src.startsWith("data:") ? `Imagen cargada (${Math.round(src.length * 0.75 / 1024)} KB)` : "Imagen por enlace externo");
  pImagePreviewRow.classList.remove("hidden");
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };
    img.src = objectUrl;
  });
}

async function processProductImageFile(file) {
  const validTypes = ["image/png", "image/jpeg", "image/webp"];
  if (!validTypes.includes(file.type)) {
    showToast("Formato no soportado. Elegí un archivo PNG, JPG o WebP.", true);
    return;
  }

  const img = await loadImageFromFile(file);
  const maxSteps = [800, 640, 500, 380];
  const isPng = file.type === "image/png";
  const maxChars = 430000;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  let resultDataUrl = "";

  for (const maxDim of maxSteps) {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    if (isPng) {
      const pngUrl = canvas.toDataURL("image/png");
      if (pngUrl.length <= maxChars) {
        resultDataUrl = pngUrl;
        break;
      }
    }

    const webpUrl = canvas.toDataURL("image/webp", 0.88);
    if (webpUrl.length <= maxChars) {
      resultDataUrl = webpUrl;
      break;
    }

    const jpgUrl = canvas.toDataURL("image/jpeg", 0.84);
    if (jpgUrl.length <= maxChars) {
      resultDataUrl = jpgUrl;
      break;
    }
  }

  if (!resultDataUrl) {
    showToast("La imagen es demasiado pesada incluso al optimizarla. Probá con un PNG más liviano.", true);
    return;
  }

  uploadedProductImageDataUrl = resultDataUrl;
  pImageUrl.value = "";
  updateProductImagePreview(
    resultDataUrl,
    `${file.name} · ${canvas.width}×${canvas.height}px (${Math.round(resultDataUrl.length * 0.75 / 1024)} KB)`
  );
  showToast("Imagen cargada y lista para guardar");
}

function openAdminProductModal(item = null) {
  adminProductForm.reset();
  uploadedProductImageDataUrl = "";
  pImageFile.value = "";
  if (item) {
    adminProductModalTitle.textContent = "Editar Producto";
    editProductId.value = item.id;
    pName.value = item.name || "";
    pCategory.value = item.category || "";
    pDescription.value = item.description || "";
    pPrice.value = String(item.price || 0);
    pLeadDays.value = String(item.leadTimeDays || 3);
    pMaterial.value = item.material || "PLA+";
    pBadge.value = item.badge || "";
    pIconKey.value = item.iconKey || "custom";
    pSortOrder.value = String(item.sortOrder || 1);
    const existingImg = item.imageUrl || "";
    if (existingImg.startsWith("data:image/")) {
      uploadedProductImageDataUrl = existingImg;
      pImageUrl.value = "";
      updateProductImagePreview(existingImg);
    } else {
      pImageUrl.value = existingImg;
      updateProductImagePreview(existingImg);
    }
    pActive.checked = item.active !== false;
  } else {
    adminProductModalTitle.textContent = "Nuevo Producto";
    editProductId.value = "";
    pLeadDays.value = "3";
    pMaterial.value = "PLA+";
    pSortOrder.value = String(catalogItems.length + 1);
    pImageUrl.value = "";
    updateProductImagePreview("");
    pActive.checked = true;
  }
  adminProductModal.classList.add("open");
  pName.focus();
}

async function seedStarterCatalog() {
  const batch = writeBatch(db);
  for (const item of STARTER_CATALOG) {
    const ref = doc(collection(db, "catalog"));
    batch.set(ref, buildCatalogPayload(item, false));
  }
  await batch.commit();
  showToast("Catálogo base cargado en Firestore");
}

async function seedAllStarterData() {
  const btn = document.getElementById("btnSeedStarterData");
  btn.disabled = true;
  btn.textContent = "Importando...";
  try {
    const batch = writeBatch(db);
    let maxNum = 0;
    for (const order of INITIAL_EXCEL_ORDERS) {
      const ref = doc(collection(db, "orders"));
      batch.set(ref, buildOrderPayload(order, null));
      if (order.orderNumber > maxNum) maxNum = order.orderNumber;
    }
    batch.set(doc(db, "counters", "orders"), { lastNumber: maxNum });
    if (catalogItems.length === 0) {
      for (const item of STARTER_CATALOG) {
        const ref = doc(collection(db, "catalog"));
        batch.set(ref, buildCatalogPayload(item, false));
      }
    }
    await batch.commit();
    showToast("Se importaron tus pedidos numerados y el catálogo base");
  } catch (err) {
    console.error(err);
    showToast("No se pudo importar: " + (err.message || "error de permisos"), true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Importar datos iniciales";
  }
}

function startListeners() {
  stopListeners();
  permissionErrorBanner.classList.add("hidden");

  const ordersQ = query(collection(db, "orders"), orderBy("createdAt", "desc"));
  unsubOrders = onSnapshot(
    ordersQ,
    (snap) => {
      orders = snap.docs.map((d) => normalizeOrder({ id: d.id, ...d.data() }));
      renderOrdersTable();
    },
    (err) => {
      console.error("Error leyendo pedidos:", err);
      permissionErrorBanner.classList.remove("hidden");
      permissionErrorBanner.innerHTML = `
        <div>
          <strong>Sin permisos de administrador en Firestore.</strong>
          <span style="display:block;font-size:0.86rem;">Verificá haber iniciado sesión con la cuenta autorizada (${escapeHtml(auth.currentUser?.email || "")}) o revisá las reglas desplegadas en Firebase.</span>
        </div>`;
    }
  );

  const catalogQ = query(collection(db, "catalog"), orderBy("sortOrder", "asc"));
  unsubCatalog = onSnapshot(
    catalogQ,
    (snap) => {
      catalogItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAdminCatalog();
      updateSuggestions();
    },
    (err) => {
      console.error("Error leyendo catálogo:", err);
    }
  );
}

// Tabs
tabOrders.addEventListener("click", () => {
  tabOrders.classList.add("active");
  tabCatalog.classList.remove("active");
  ordersView.classList.remove("hidden");
  catalogView.classList.add("hidden");
});

tabCatalog.addEventListener("click", () => {
  tabCatalog.classList.add("active");
  tabOrders.classList.remove("active");
  catalogView.classList.remove("hidden");
  ordersView.classList.add("hidden");
});

// Toolbar & filters
document.getElementById("btnNewOrder").addEventListener("click", () => openAdminOrderModal(null));
document.getElementById("btnAddAdminItem").addEventListener("click", () => {
  modalItems.push(normalizeOrderItem({ product: "", description: "", price: 0, quantity: 1, catalogId: "" }));
  renderModalItems();
});
document.getElementById("btnNewProduct").addEventListener("click", () => openAdminProductModal(null));
document.getElementById("btnSeedStarterData").addEventListener("click", seedAllStarterData);
document.getElementById("btnSeedCatalogOnly").addEventListener("click", seedStarterCatalog);

document.getElementById("btnSortDate").addEventListener("click", (e) => {
  sortByDeliveryDate = !sortByDeliveryDate;
  e.target.textContent = sortByDeliveryDate ? "Orden: Por Fecha ✓" : "Ordenar por Fecha";
  renderOrdersTable();
});

document.getElementById("btnExportCsv").addEventListener("click", () => {
  const rows = [["Pedido #", "Fecha", "Days Left", "Cliente", "Contacto", "Estado", "Productos", "Notas", "Total ($)"]];
  for (const o of getVisibleOrders()) {
    const days = computeDaysLeft(o.date, o.status).text;
    const total = calcOrderTotal(o);
    const itemsDetail = o.items
      .map((it) => `${it.quantity}x ${it.product}${it.description ? ` (${it.description})` : ""}${it.price > 0 ? ` [$${it.price}]` : ""}`)
      .join(" | ");
    rows.push([
      formatOrderNumber(o.orderNumber),
      o.date || "",
      days,
      o.client || "",
      o.contact || "",
      o.status || "",
      itemsDetail,
      o.notes || "",
      total || ""
    ]);
  }
  const csv = "\uFEFF" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sanie3d-pedidos-${todayISO()}.csv`;
  a.click();
});

ordersSearch.addEventListener("input", renderOrdersTable);
ordersStatusFilter.addEventListener("change", renderOrdersTable);

// Order form events
document.getElementById("closeAdminOrderModal").addEventListener("click", () => adminOrderModal.classList.remove("open"));
document.getElementById("cancelAdminOrderModal").addEventListener("click", () => adminOrderModal.classList.remove("open"));
adminOrderModal.addEventListener("click", (e) => {
  if (e.target === adminOrderModal) adminOrderModal.classList.remove("open");
});

document.querySelectorAll("[data-qdate]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const val = btn.dataset.qdate;
    fDate.value = val === "clear" ? "" : addDaysISO(Number(val));
  });
});

adminOrderForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = editOrderId.value;
  const client = fClient.value.trim();
  const cleanItems = modalItems
    .map(normalizeOrderItem)
    .filter((it) => it.product.trim() !== "" || it.description.trim() !== "" || it.price > 0);

  if (cleanItems.length === 0) {
    cleanItems.push(normalizeOrderItem({ product: client ? "A definir" : "", quantity: 1 }));
  }

  const hasContent = cleanItems.some((it) => it.product.trim() !== "") || client !== "";
  if (!hasContent) {
    showToast("Completá al menos el Cliente o un Producto.", true);
    return;
  }

  const requestedNum = Math.max(1, Math.floor(Number(fOrderNumber.value) || 0));

  const payloadInput = {
    orderNumber: requestedNum,
    date: fDate.value.trim(),
    client,
    contact: fContact.value.trim(),
    status: fStatus.value,
    notes: fNotes.value.trim(),
    items: cleanItems
  };

  saveAdminOrderBtn.disabled = true;
  try {
    if (id) {
      const existing = orders.find((o) => o.id === id);
      await setDoc(doc(db, "orders", id), buildOrderPayload(payloadInput, existing));
      showToast(`Pedido ${formatOrderNumber(requestedNum)} actualizado`);
      adminOrderModal.classList.remove("open");
    } else {
      let finalNumber = requestedNum;
      const autoSuggested = getMaxOrderNumber() + 1;
      if (requestedNum === autoSuggested) {
        finalNumber = await allocateNextOrderNumber(getMaxOrderNumber());
      } else {
        await setDoc(doc(db, "counters", "orders"), { lastNumber: Math.max(requestedNum, getMaxOrderNumber()) });
      }
      payloadInput.orderNumber = finalNumber;
      await addDoc(collection(db, "orders"), buildOrderPayload(payloadInput, null));
      showToast(`Pedido ${formatOrderNumber(finalNumber)} agregado`);

      if (fKeepAdding.checked) {
        const nextNum = Math.max(finalNumber, getMaxOrderNumber()) + 1;
        fOrderNumber.value = String(nextNum);
        fClient.value = "";
        fContact.value = "";
        fNotes.value = "";
        fStatus.value = "Pending";
        modalItems = [normalizeOrderItem({ product: "", description: "", price: 0, quantity: 1, catalogId: "" })];
        renderModalItems();
        fClient.focus();
      } else {
        adminOrderModal.classList.remove("open");
      }
    }
  } catch (err) {
    console.error(err);
    showToast("Error al guardar el pedido: " + (err.message || ""), true);
  } finally {
    saveAdminOrderBtn.disabled = false;
  }
});

// Product form events
btnPickProductImage.addEventListener("click", () => pImageFile.click());

pImageFile.addEventListener("change", () => {
  const file = pImageFile.files?.[0];
  if (file) processProductImageFile(file);
});

pImageDropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  pImageDropZone.classList.add("dragover");
});

pImageDropZone.addEventListener("dragleave", () => {
  pImageDropZone.classList.remove("dragover");
});

pImageDropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  pImageDropZone.classList.remove("dragover");
  const file = e.dataTransfer?.files?.[0];
  if (file) processProductImageFile(file);
});

btnClearProductImage.addEventListener("click", () => {
  uploadedProductImageDataUrl = "";
  pImageFile.value = "";
  pImageUrl.value = "";
  updateProductImagePreview("");
});

pImageUrl.addEventListener("input", () => {
  const urlVal = pImageUrl.value.trim();
  if (urlVal) {
    uploadedProductImageDataUrl = "";
    pImageFile.value = "";
    updateProductImagePreview(urlVal);
  } else if (!uploadedProductImageDataUrl) {
    updateProductImagePreview("");
  }
});

document.getElementById("closeAdminProductModal").addEventListener("click", () => adminProductModal.classList.remove("open"));
document.getElementById("cancelAdminProductModal").addEventListener("click", () => adminProductModal.classList.remove("open"));
adminProductModal.addEventListener("click", (e) => {
  if (e.target === adminProductModal) adminProductModal.classList.remove("open");
});

adminProductForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = editProductId.value;
  const finalImageUrl = uploadedProductImageDataUrl || pImageUrl.value.trim();
  const payloadInput = {
    name: pName.value.trim(),
    category: pCategory.value.trim(),
    description: pDescription.value.trim(),
    price: Number(pPrice.value) || 0,
    leadTimeDays: Number(pLeadDays.value) || 0,
    material: pMaterial.value.trim(),
    badge: pBadge.value.trim(),
    imageUrl: finalImageUrl,
    iconKey: pIconKey.value,
    sortOrder: Number(pSortOrder.value) || 1,
    active: pActive.checked
  };

  saveAdminProductBtn.disabled = true;
  try {
    if (id) {
      await updateDoc(doc(db, "catalog", id), buildCatalogPayload(payloadInput, true));
      showToast("Producto actualizado");
    } else {
      await addDoc(collection(db, "catalog"), buildCatalogPayload(payloadInput, false));
      showToast("Producto agregado al catálogo");
    }
    adminProductModal.classList.remove("open");
  } catch (err) {
    console.error(err);
    showToast("No se pudo guardar el producto: " + (err.message || ""), true);
  } finally {
    saveAdminProductBtn.disabled = false;
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    authSection.classList.add("hidden");
    adminSection.classList.remove("hidden");
    btnSignOut.classList.remove("hidden");
    adminUserEmail.textContent = user.email || user.uid;
    startListeners();
  } else {
    stopListeners();
    authSection.classList.remove("hidden");
    adminSection.classList.add("hidden");
    btnSignOut.classList.add("hidden");
    adminUserEmail.textContent = "";
  }
});
