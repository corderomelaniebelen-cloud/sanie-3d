import {
  db,
  STARTER_CATALOG,
  formatMoney,
  todayISO,
  escapeHtml
} from "./firebase.js";
import { getProductIllustration } from "./icons.js";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const catalogGrid = document.getElementById("catalogGrid");
const catalogNotice = document.getElementById("catalogNotice");
const categoryPills = document.getElementById("categoryPills");
const catalogSearch = document.getElementById("catalogSearch");
const heroIllustration = document.getElementById("heroIllustration");

const orderModal = document.getElementById("orderModal");
const orderModalTitle = document.getElementById("orderModalTitle");
const publicOrderForm = document.getElementById("publicOrderForm");
const orderSuccessView = document.getElementById("orderSuccessView");
const orderSuccessSummary = document.getElementById("orderSuccessSummary");

const orderCatalogId = document.getElementById("orderCatalogId");
const orderUnitPrice = document.getElementById("orderUnitPrice");
const orderProduct = document.getElementById("orderProduct");
const orderQty = document.getElementById("orderQty");
const orderDate = document.getElementById("orderDate");
const orderDesc = document.getElementById("orderDesc");
const orderClient = document.getElementById("orderClient");
const orderContact = document.getElementById("orderContact");
const orderPriceBreakdown = document.getElementById("orderPriceBreakdown");
const orderTotalDisplay = document.getElementById("orderTotalDisplay");
const submitPublicOrder = document.getElementById("submitPublicOrder");
const hpWebsite = document.getElementById("hpWebsite");

let allProducts = [];
let activeCategory = "Todos";

heroIllustration.innerHTML = getProductIllustration("mate-motor", "Mates");

function showToast(message, isError = false) {
  const container = document.getElementById("toastContainer");
  const el = document.createElement("div");
  el.className = `toast${isError ? " error" : ""}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function renderCategoryPills(items) {
  const categories = ["Todos", ...new Set(items.map((item) => item.category).filter(Boolean))];
  if (!categories.includes(activeCategory)) activeCategory = "Todos";
  categoryPills.innerHTML = categories
    .map(
      (cat) =>
        `<button type="button" class="pill-btn ${cat === activeCategory ? "active" : ""}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`
    )
    .join("");
}

function renderCatalog() {
  const term = catalogSearch.value.trim().toLowerCase();
  const filtered = allProducts.filter((item) => {
    const matchesCat = activeCategory === "Todos" || item.category === activeCategory;
    const matchesSearch =
      !term ||
      item.name.toLowerCase().includes(term) ||
      item.description.toLowerCase().includes(term) ||
      (item.material || "").toLowerCase().includes(term);
    return matchesCat && matchesSearch;
  });

  if (filtered.length === 0) {
    catalogGrid.innerHTML = `
      <div class="table-card empty-state" style="grid-column: 1 / -1;">
        <p style="margin:0 0 12px;">No encontramos productos para ese filtro.</p>
        <button type="button" class="btn btn-outline btn-sm" id="btnResetCatalogFilter">Ver todos</button>
      </div>`;
    document.getElementById("btnResetCatalogFilter")?.addEventListener("click", () => {
      activeCategory = "Todos";
      catalogSearch.value = "";
      renderCategoryPills(allProducts);
      renderCatalog();
    });
    return;
  }

  catalogGrid.innerHTML = filtered
    .map((item) => {
      const priceText = item.price > 0 ? formatMoney(item.price) : "A cotizar";
      const leadText = item.leadTimeDays > 0 ? `~${item.leadTimeDays} días` : "A coordinar";
      const mediaHtml = item.imageUrl
        ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy" />`
        : getProductIllustration(item.iconKey, item.category);
      const badgeHtml = item.badge ? `<span class="product-badge">${escapeHtml(item.badge)}</span>` : "";

      return `
        <article class="product-card">
          <div class="product-media">
            ${badgeHtml}
            ${mediaHtml}
          </div>
          <div class="product-body">
            <div class="product-meta">
              <span>${escapeHtml(item.category || "3D")}</span>
              <span>${escapeHtml(item.material || "PLA+")}</span>
            </div>
            <h3 class="product-title">${escapeHtml(item.name)}</h3>
            <p class="product-desc">${escapeHtml(item.description)}</p>
            <div class="product-footer">
              <div class="price-block">
                <strong class="mono">${escapeHtml(priceText)}</strong>
                <span>Entrega estimada: ${escapeHtml(leadText)}</span>
              </div>
              <button type="button" class="btn btn-primary btn-sm btn-order-product" data-id="${escapeHtml(item.id)}">
                Encargar
              </button>
            </div>
          </div>
        </article>`;
    })
    .join("");

  catalogGrid.querySelectorAll(".btn-order-product").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = allProducts.find((p) => p.id === btn.dataset.id);
      if (item) openOrderModal(item);
    });
  });
}

function updateOrderPreview() {
  const unit = Number(orderUnitPrice.value) || 0;
  let qty = Math.floor(Number(orderQty.value) || 1);
  if (qty < 1) qty = 1;
  if (qty > 500) qty = 500;

  if (unit <= 0) {
    orderPriceBreakdown.textContent = "Precio: A cotizar según archivo/colores";
    orderTotalDisplay.textContent = `${qty} u. · A cotizar`;
  } else {
    orderPriceBreakdown.textContent = `${formatMoney(unit)} × ${qty} u.`;
    orderTotalDisplay.textContent = formatMoney(unit * qty);
  }
}

function openOrderModal(product = null) {
  publicOrderForm.classList.remove("hidden");
  orderSuccessView.classList.add("hidden");
  publicOrderForm.reset();
  orderDate.min = todayISO();

  if (product) {
    orderModalTitle.textContent = `Encargar: ${product.name}`;
    orderCatalogId.value = product.id.startsWith("starter-") ? "" : product.id;
    orderProduct.value = product.name;
    orderUnitPrice.value = String(product.price || 0);
  } else {
    orderModalTitle.textContent = "Encargar diseño o pieza a medida";
    orderCatalogId.value = "";
    orderProduct.value = "";
    orderProduct.placeholder = "Ej: Soporte auricular / Llavero personalizado";
    orderUnitPrice.value = "0";
  }

  orderQty.value = "1";
  updateOrderPreview();
  orderModal.classList.add("open");
  (product ? orderDesc : orderProduct).focus();
}

function closeModal() {
  orderModal.classList.remove("open");
}

async function loadCatalog() {
  catalogGrid.innerHTML = `<div class="table-card empty-state" style="grid-column:1/-1;">Cargando catálogo desde Firebase...</div>`;
  try {
    const q = query(
      collection(db, "catalog"),
      where("active", "==", true),
      orderBy("sortOrder", "asc")
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      allProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      catalogNotice.classList.add("hidden");
    } else {
      allProducts = [...STARTER_CATALOG];
      catalogNotice.classList.remove("hidden");
      catalogNotice.innerHTML = `
        <span>Mostrando catálogo base de Sanie 3D. Cuando cargues tus propios productos en <a href="./admin.html" style="text-decoration:underline;font-weight:700;">Panel Admin</a>, se mostrarán aquí automáticamente.</span>`;
    }
  } catch (err) {
    console.warn("No se pudo leer el catálogo remoto, usando vista base:", err);
    allProducts = [...STARTER_CATALOG];
    catalogNotice.classList.add("hidden");
  }
  renderCategoryPills(allProducts);
  renderCatalog();
}

categoryPills.addEventListener("click", (e) => {
  const btn = e.target.closest(".pill-btn");
  if (!btn) return;
  activeCategory = btn.dataset.category;
  renderCategoryPills(allProducts);
  renderCatalog();
});

catalogSearch.addEventListener("input", renderCatalog);

document.getElementById("btnCustomHero").addEventListener("click", () => openOrderModal(null));
document.getElementById("btnCustomHeroNav").addEventListener("click", () => openOrderModal(null));
document.getElementById("btnCustomBanner").addEventListener("click", () => openOrderModal(null));
document.getElementById("closeOrderModal").addEventListener("click", closeModal);
document.getElementById("cancelOrderModal").addEventListener("click", closeModal);
document.getElementById("btnNewAfterSuccess").addEventListener("click", closeModal);
orderModal.addEventListener("click", (e) => {
  if (e.target === orderModal) closeModal();
});

document.getElementById("qtyMinus").addEventListener("click", () => {
  const current = Math.max(1, Math.floor(Number(orderQty.value) || 1));
  orderQty.value = String(Math.max(1, current - 1));
  updateOrderPreview();
});

document.getElementById("qtyPlus").addEventListener("click", () => {
  const current = Math.max(1, Math.floor(Number(orderQty.value) || 1));
  orderQty.value = String(Math.min(500, current + 1));
  updateOrderPreview();
});

orderQty.addEventListener("input", updateOrderPreview);

publicOrderForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (hpWebsite.value.trim() !== "") return;

  const product = orderProduct.value.trim();
  const description = orderDesc.value.trim();
  const client = orderClient.value.trim();
  const contact = orderContact.value.trim();
  const date = orderDate.value.trim();
  const price = Math.max(0, Number(orderUnitPrice.value) || 0);
  const quantity = Math.max(1, Math.min(500, Math.round(Number(orderQty.value) || 1)));

  if (!product || !client || !contact) {
    showToast("Completá el producto, tu nombre y un contacto.", true);
    return;
  }

  submitPublicOrder.disabled = true;
  submitPublicOrder.textContent = "Enviando...";

  try {
    await addDoc(collection(db, "orders"), {
      date,
      product,
      description,
      status: "Pending",
      price,
      quantity,
      client,
      contact,
      source: "web",
      catalogId: orderCatalogId.value.trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    const totalMsg = price > 0 ? ` · Total estimado: ${formatMoney(price * quantity)}` : " · A cotizar";
    orderSuccessSummary.textContent = `${client}, registramos "${product}" × ${quantity}${totalMsg}. Te vamos a escribir a ${contact} para confirmar detalles.`;
    publicOrderForm.classList.add("hidden");
    orderSuccessView.classList.remove("hidden");
    showToast("¡Pedido enviado correctamente!");
  } catch (err) {
    console.error("Error al enviar pedido:", err);
    showToast("No se pudo enviar el pedido. Revisá tu conexión o intentá de nuevo.", true);
  } finally {
    submitPublicOrder.disabled = false;
    submitPublicOrder.textContent = "Enviar pedido";
  }
});

loadCatalog();
