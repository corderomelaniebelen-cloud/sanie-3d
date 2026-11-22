import {
  app,
  db,
  auth,
  ORDER_STATUSES,
  STARTER_CATALOG,
  INITIAL_EXCEL_ORDERS,
  formatMoney,
  formatMoneyOrDash,
  formatQuantity,
  formatShortDate,
  computeDaysLeft,
  todayISO,
  addDaysISO,
  escapeHtml
} from "./firebase.js";
import { getProductIllustration } from "./icons.js";
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

// Order modal elements
const adminOrderModal = document.getElementById("adminOrderModal");
const adminOrderModalTitle = document.getElementById("adminOrderModalTitle");
const adminOrderForm = document.getElementById("adminOrderForm");
const editOrderId = document.getElementById("editOrderId");
const fDate = document.getElementById("fDate");
const fProduct = document.getElementById("fProduct");
const fDescription = document.getElementById("fDescription");
const fStatus = document.getElementById("fStatus");
const fPrice = document.getElementById("fPrice");
const fQuantity = document.getElementById("fQuantity");
const fTotalPreview = document.getElementById("fTotalPreview");
const fClient = document.getElementById("fClient");
const fContact = document.getElementById("fContact");
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
const pActive = document.getElementById("pActive");
const saveAdminProductBtn = document.getElementById("saveAdminProductBtn");

let orders = [];
let catalogItems = [];
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

function updateSuggestions() {
  const prodList = document.getElementById("productSuggestions");
  const clientList = document.getElementById("clientSuggestions");
  const uniqueProds = [...new Set([
    ...catalogItems.map((c) => c.name),
    ...orders.map((o) => o.product)
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
  let totalMoney = 0;

  for (const o of orders) {
    if (o.status === "Pending") pending++;
    else if (o.status === "Processing") processing++;
    else if (o.status === "Ready") ready++;
    else if (o.status === "Delivered") delivered++;

    const lineTotal = (Number(o.price) || 0) * (Number(o.quantity) || 0);
    totalMoney += lineTotal;
  }

  kpiPending.textContent = String(pending);
  kpiProcessing.textContent = String(processing);
  kpiReady.textContent = String(ready);
  kpiDelivered.textContent = String(delivered);
  kpiGrandTotal.textContent = formatMoney(totalMoney) || "$ 0";
}

function getVisibleOrders() {
  const term = ordersSearch.value.trim().toLowerCase();
  const statusFilter = ordersStatusFilter.value;

  const filtered = orders.filter((o) => {
    const okStatus = statusFilter === "ALL" || o.status === statusFilter;
    const okSearch =
      !term ||
      (o.product || "").toLowerCase().includes(term) ||
      (o.description || "").toLowerCase().includes(term) ||
      (o.client || "").toLowerCase().includes(term) ||
      (o.contact || "").toLowerCase().includes(term);
    return okStatus && okSearch;
  });

  if (sortByDeliveryDate) {
    filtered.sort((a, b) => {
      if (!a.date && !b.date) return (a.client || "").localeCompare(b.client || "");
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });
  }

  return filtered;
}

function renderOrdersTable() {
  renderKPIs();
  updateSuggestions();
  seedOrdersBanner.classList.toggle("hidden", orders.length > 0);

  const visible = getVisibleOrders();
  if (visible.length === 0) {
    ordersTableBody.innerHTML = `<tr><td colspan="10" class="empty-state">No hay pedidos que coincidan con el filtro actual.</td></tr>`;
    return;
  }

  ordersTableBody.innerHTML = visible
    .map((o) => {
      const days = computeDaysLeft(o.date, o.status);
      const priceVal = Number(o.price) || 0;
      const qtyVal = Number(o.quantity) || 0;
      const totalVal = priceVal > 0 ? priceVal * (qtyVal > 0 ? qtyVal : 1) : 0;
      const webTag = o.source === "web" ? `<span class="source-tag">Web</span>` : "";
      const contactHtml = o.contact ? `<span class="contact-sub">${escapeHtml(o.contact)}</span>` : "";

      const statusOptions = ORDER_STATUSES.map(
        (st) => `<option value="${st}" ${o.status === st ? "selected" : ""}>${st}</option>`
      ).join("");

      return `
        <tr data-id="${escapeHtml(o.id)}">
          <td class="mono">${escapeHtml(formatShortDate(o.date))}</td>
          <td><span class="days-pill ${days.kind}">${escapeHtml(days.text || "—")}</span></td>
          <td><strong>${escapeHtml(o.product || "—")}</strong>${webTag}</td>
          <td style="max-width:250px;color:var(--ink-muted);">${escapeHtml(o.description || "—")}</td>
          <td>
            <select class="status-select status-${escapeHtml(o.status)}" data-order-status="${escapeHtml(o.id)}">
              ${statusOptions}
            </select>
          </td>
          <td class="mono">${escapeHtml(formatMoneyOrDash(priceVal))}</td>
          <td class="mono">${escapeHtml(qtyVal > 0 ? formatQuantity(qtyVal) : "—")}</td>
          <td class="mono"><strong>${escapeHtml(formatMoneyOrDash(totalVal))}</strong></td>
          <td>
            <strong>${escapeHtml(o.client || "—")}</strong>
            ${contactHtml}
          </td>
          <td>
            <div class="row-actions">
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
        showToast(`Estado actualizado a ${newStatus}`);
      } catch (err) {
        console.error(err);
        showToast("Error al actualizar estado", true);
        renderOrdersTable();
      }
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
      const label = order.product || order.client || "este pedido";
      if (!confirm(`¿Eliminar "${label}" de ${order.client || "sin cliente"}?`)) return;
      try {
        await deleteDoc(doc(db, "orders", order.id));
        showToast("Pedido eliminado");
      } catch (err) {
        console.error(err);
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
      if (!confirm(`¿Eliminar "${item.name}" del catálogo público?`)) return;
      try {
        await deleteDoc(doc(db, "catalog", item.id));
        showToast("Producto eliminado del catálogo");
      } catch (err) {
        console.error(err);
        showToast("No se pudo eliminar el producto", true);
      }
    });
  });
}

function buildOrderPayload(data, isUpdate = false) {
  const payload = {
    date: String(data.date || "").slice(0, 10),
    product: String(data.product || "").slice(0, 140),
    description: String(data.description || "").slice(0, 1000),
    status: ORDER_STATUSES.includes(data.status) ? data.status : "Pending",
    price: Math.max(0, Number(data.price) || 0),
    quantity: Math.max(0, Number(data.quantity) || 0),
    client: String(data.client || "").slice(0, 100),
    contact: String(data.contact || "").slice(0, 120),
    catalogId: String(data.catalogId || "").slice(0, 120),
    updatedAt: serverTimestamp()
  };
  if (!isUpdate) {
    payload.source = data.source || "admin";
    payload.createdAt = serverTimestamp();
  }
  return payload;
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
    imageUrl: String(data.imageUrl || "").slice(0, 500),
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
  const price = Math.max(0, Number(fPrice.value) || 0);
  const qty = Math.max(0, Number(fQuantity.value) || 0);
  const total = price * (qty || (price > 0 ? 1 : 0));
  fTotalPreview.textContent = formatMoney(total) || "$ 0";
}

function openAdminOrderModal(order = null) {
  adminOrderForm.reset();
  if (order) {
    adminOrderModalTitle.textContent = "Editar Pedido";
    saveAdminOrderBtn.textContent = "Guardar Cambios";
    keepAddingWrap.classList.add("hidden");
    editOrderId.value = order.id;
    fDate.value = order.date || "";
    fProduct.value = order.product || "";
    fDescription.value = order.description || "";
    fStatus.value = order.status || "Pending";
    fPrice.value = order.price > 0 ? String(order.price) : "";
    fQuantity.value = order.quantity > 0 ? String(order.quantity) : (order.price > 0 ? "1" : "");
    fClient.value = order.client || "";
    fContact.value = order.contact || "";
  } else {
    adminOrderModalTitle.textContent = "Nuevo Pedido";
    saveAdminOrderBtn.textContent = "Agregar Pedido";
    keepAddingWrap.classList.remove("hidden");
    editOrderId.value = "";
    fDate.value = todayISO();
    fStatus.value = "Pending";
    fQuantity.value = "1";
  }
  updateOrderFormTotal();
  adminOrderModal.classList.add("open");
  fProduct.focus();
}

function openAdminProductModal(item = null) {
  adminProductForm.reset();
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
    pImageUrl.value = item.imageUrl || "";
    pActive.checked = item.active !== false;
  } else {
    adminProductModalTitle.textContent = "Nuevo Producto";
    editProductId.value = "";
    pLeadDays.value = "3";
    pMaterial.value = "PLA+";
    pSortOrder.value = String(catalogItems.length + 1);
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
    for (const order of INITIAL_EXCEL_ORDERS) {
      const ref = doc(collection(db, "orders"));
      batch.set(ref, buildOrderPayload(order, false));
    }
    if (catalogItems.length === 0) {
      for (const item of STARTER_CATALOG) {
        const ref = doc(collection(db, "catalog"));
        batch.set(ref, buildCatalogPayload(item, false));
      }
    }
    await batch.commit();
    showToast("Se importaron tus pedidos del Excel y el catálogo base");
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
      orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
document.getElementById("btnNewProduct").addEventListener("click", () => openAdminProductModal(null));
document.getElementById("btnSeedStarterData").addEventListener("click", seedAllStarterData);
document.getElementById("btnSeedCatalogOnly").addEventListener("click", seedStarterCatalog);

document.getElementById("btnSortDate").addEventListener("click", (e) => {
  sortByDeliveryDate = !sortByDeliveryDate;
  e.target.textContent = sortByDeliveryDate ? "Orden: Por Fecha ✓" : "Ordenar por Fecha";
  renderOrdersTable();
});

document.getElementById("btnExportCsv").addEventListener("click", () => {
  const rows = [["Date", "Days Left", "Product", "Description", "Status", "Price", "Cantidad", "Total", "Client", "Contact"]];
  for (const o of getVisibleOrders()) {
    const days = computeDaysLeft(o.date, o.status).text;
    const price = Number(o.price) || 0;
    const qty = Number(o.quantity) || 0;
    const total = price > 0 ? price * (qty > 0 ? qty : 1) : 0;
    rows.push([o.date || "", days, o.product || "", o.description || "", o.status || "", price || "", qty || "", total || "", o.client || "", o.contact || ""]);
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

fPrice.addEventListener("input", updateOrderFormTotal);
fQuantity.addEventListener("input", updateOrderFormTotal);

fProduct.addEventListener("change", () => {
  if (!editOrderId.value && !fPrice.value) {
    const match = catalogItems.find((c) => c.name.toLowerCase() === fProduct.value.trim().toLowerCase());
    if (match && match.price > 0) {
      fPrice.value = String(match.price);
      updateOrderFormTotal();
    }
  }
});

adminOrderForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = editOrderId.value;
  const product = fProduct.value.trim();
  const client = fClient.value.trim();

  if (!product && !client) {
    showToast("Completá al menos el Producto o el Cliente.", true);
    return;
  }

  const price = Math.max(0, Number(fPrice.value) || 0);
  const quantity = fQuantity.value === "" ? (price > 0 ? 1 : 0) : Math.max(0, Number(fQuantity.value) || 0);

  const payloadInput = {
    date: fDate.value.trim(),
    product,
    description: fDescription.value.trim(),
    status: fStatus.value,
    price,
    quantity,
    client,
    contact: fContact.value.trim()
  };

  saveAdminOrderBtn.disabled = true;
  try {
    if (id) {
      const existing = orders.find((o) => o.id === id);
      await updateDoc(doc(db, "orders", id), buildOrderPayload({ ...payloadInput, catalogId: existing?.catalogId || "" }, true));
      showToast("Pedido actualizado");
      adminOrderModal.classList.remove("open");
    } else {
      await addDoc(collection(db, "orders"), buildOrderPayload(payloadInput, false));
      showToast("Pedido agregado");
      if (fKeepAdding.checked) {
        fProduct.value = "";
        fDescription.value = "";
        fPrice.value = "";
        fQuantity.value = "1";
        fStatus.value = "Pending";
        updateOrderFormTotal();
        fProduct.focus();
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
document.getElementById("closeAdminProductModal").addEventListener("click", () => adminProductModal.classList.remove("open"));
document.getElementById("cancelAdminProductModal").addEventListener("click", () => adminProductModal.classList.remove("open"));
adminProductModal.addEventListener("click", (e) => {
  if (e.target === adminProductModal) adminProductModal.classList.remove("open");
});

adminProductForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = editProductId.value;
  const payloadInput = {
    name: pName.value.trim(),
    category: pCategory.value.trim(),
    description: pDescription.value.trim(),
    price: Number(pPrice.value) || 0,
    leadTimeDays: Number(pLeadDays.value) || 0,
    material: pMaterial.value.trim(),
    badge: pBadge.value.trim(),
    imageUrl: pImageUrl.value.trim(),
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
