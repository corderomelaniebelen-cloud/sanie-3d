import {
  db,
  STARTER_CATALOG,
  allocateNextOrderNumber,
  formatOrderNumber,
  formatMoney,
  calcItemsTotal,
  calcItemSubtotal,
  todayISO,
  escapeHtml
} from "./firebase.js?v=20261126";
import { getProductIllustration } from "./icons.js?v=20261126";
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
const orderSuccessTitle = document.getElementById("orderSuccessTitle");
const orderSuccessSummary = document.getElementById("orderSuccessSummary");

const publicItemsContainer = document.getElementById("publicItemsContainer");
const orderDate = document.getElementById("orderDate");
const orderNotes = document.getElementById("orderNotes");
const orderClient = document.getElementById("orderClient");
const orderContact = document.getElementById("orderContact");
const orderPriceBreakdown = document.getElementById("orderPriceBreakdown");
const orderTotalDisplay = document.getElementById("orderTotalDisplay");
const submitPublicOrder = document.getElementById("submitPublicOrder");
const hpWebsite = document.getElementById("hpWebsite");

let allProducts = [];
let activeCategory = "Todos";
let draftItems = [];

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

function makeDraftFromProduct(product = null) {
  if (!product) {
    return {
      selectedId: "__custom__",
      catalogId: "",
      product: "",
      description: "",
      price: 0,
      quantity: 1
    };
  }
  return {
    selectedId: product.id,
    catalogId: product.id.startsWith("starter-") ? "" : product.id,
    product: product.name,
    description: "",
    price: Number(product.price) || 0,
    quantity: 1
  };
}

function updateDraftSummary() {
  const total = calcItemsTotal(draftItems);
  const totalUnits = draftItems.reduce((acc, it) => acc + Math.max(1, Number(it.quantity) || 1), 0);
  const hasQuoteItems = draftItems.some((it) => (Number(it.price) || 0) <= 0);

  orderPriceBreakdown.textContent = `${draftItems.length} ${draftItems.length === 1 ? "producto" : "productos"} · ${totalUnits} u.`;
  if (total <= 0) {
    orderTotalDisplay.textContent = "A cotizar";
  } else {
    orderTotalDisplay.textContent = hasQuoteItems
      ? `${formatMoney(total)} + a cotizar`
      : formatMoney(total);
  }
}

function renderPublicDraftItems() {
  const catalogOptions = allProducts
    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}${p.price > 0 ? ` (${escapeHtml(formatMoney(p.price))})` : " (A cotizar)"}</option>`)
    .join("");

  publicItemsContainer.innerHTML = draftItems
    .map((item, idx) => {
      const isCustom = item.selectedId === "__custom__" || !allProducts.some((p) => p.id === item.selectedId);
      const sub = calcItemSubtotal(item);
      const subText = sub > 0 ? formatMoney(sub) : "A cotizar";

      return `
        <div class="item-editor-card" data-idx="${idx}">
          <div class="item-editor-top">
            <select class="select pub-item-select" data-idx="${idx}">
              ${catalogOptions}
              <option value="__custom__" ${isCustom ? "selected" : ""}>Pieza / diseño a medida...</option>
            </select>
            ${draftItems.length > 1 ? `<button type="button" class="btn btn-danger-outline btn-sm pub-item-remove" data-idx="${idx}" title="Quitar">Quitar</button>` : ""}
          </div>

          <div class="field ${isCustom ? "" : "hidden"} pub-custom-name-wrap">
            <label>Nombre del producto o pieza</label>
            <input type="text" class="input pub-item-name" data-idx="${idx}" maxlength="140" value="${escapeHtml(item.product)}" placeholder="Ej: Soporte auricular / Llavero personalizado" ${isCustom ? "required" : ""} />
          </div>

          <div class="field">
            <label>Colores o personalización (opcional)</label>
            <input type="text" class="input pub-item-desc" data-idx="${idx}" maxlength="500" value="${escapeHtml(item.description)}" placeholder="Ej: Color Boca, nombre grabado, medidas..." />
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
            <div class="qty-stepper">
              <button type="button" class="pub-qty-minus" data-idx="${idx}" aria-label="Restar">−</button>
              <input type="number" class="pub-item-qty" data-idx="${idx}" min="1" max="500" step="1" value="${escapeHtml(String(item.quantity))}" required />
              <button type="button" class="pub-qty-plus" data-idx="${idx}" aria-label="Sumar">+</button>
            </div>
            <span class="item-subtotal-pill">${escapeHtml(subText)}</span>
          </div>
        </div>`;
    })
    .join("");

  publicItemsContainer.querySelectorAll(".pub-item-select").forEach((sel) => {
    const idx = Number(sel.dataset.idx);
    if (draftItems[idx].selectedId && allProducts.some((p) => p.id === draftItems[idx].selectedId)) {
      sel.value = draftItems[idx].selectedId;
    } else {
      sel.value = "__custom__";
    }
    sel.addEventListener("change", () => {
      if (sel.value === "__custom__") {
        draftItems[idx].selectedId = "__custom__";
        draftItems[idx].catalogId = "";
        draftItems[idx].product = "";
        draftItems[idx].price = 0;
      } else {
        const chosen = allProducts.find((p) => p.id === sel.value);
        if (chosen) {
          draftItems[idx].selectedId = chosen.id;
          draftItems[idx].catalogId = chosen.id.startsWith("starter-") ? "" : chosen.id;
          draftItems[idx].product = chosen.name;
          draftItems[idx].price = Number(chosen.price) || 0;
        }
      }
      renderPublicDraftItems();
    });
  });

  publicItemsContainer.querySelectorAll(".pub-item-name").forEach((inp) => {
    inp.addEventListener("input", () => {
      draftItems[Number(inp.dataset.idx)].product = inp.value;
    });
  });

  publicItemsContainer.querySelectorAll(".pub-item-desc").forEach((inp) => {
    inp.addEventListener("input", () => {
      draftItems[Number(inp.dataset.idx)].description = inp.value;
    });
  });

  publicItemsContainer.querySelectorAll(".pub-item-qty").forEach((inp) => {
    inp.addEventListener("input", () => {
      const idx = Number(inp.dataset.idx);
      let q = Math.floor(Number(inp.value) || 1);
      if (q < 1) q = 1;
      if (q > 500) q = 500;
      draftItems[idx].quantity = q;
      const card = inp.closest(".item-editor-card");
      const sub = calcItemSubtotal(draftItems[idx]);
      card.querySelector(".item-subtotal-pill").textContent = sub > 0 ? formatMoney(sub) : "A cotizar";
      updateDraftSummary();
    });
  });

  publicItemsContainer.querySelectorAll(".pub-qty-minus").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      draftItems[idx].quantity = Math.max(1, (Number(draftItems[idx].quantity) || 1) - 1);
      renderPublicDraftItems();
    });
  });

  publicItemsContainer.querySelectorAll(".pub-qty-plus").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      draftItems[idx].quantity = Math.min(500, (Number(draftItems[idx].quantity) || 1) + 1);
      renderPublicDraftItems();
    });
  });

  publicItemsContainer.querySelectorAll(".pub-item-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      draftItems.splice(idx, 1);
      renderPublicDraftItems();
    });
  });

  updateDraftSummary();
}

function openOrderModal(product = null) {
  publicOrderForm.classList.remove("hidden");
  orderSuccessView.classList.add("hidden");
  publicOrderForm.reset();
  orderDate.min = todayISO();

  orderModalTitle.textContent = product ? `Encargar: ${product.name}` : "Armar Pedido";
  draftItems = [makeDraftFromProduct(product)];
  renderPublicDraftItems();
  orderModal.classList.add("open");
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

document.getElementById("btnAddPublicItem").addEventListener("click", () => {
  const firstCatalog = allProducts[0] || null;
  draftItems.push(makeDraftFromProduct(firstCatalog));
  renderPublicDraftItems();
});

document.getElementById("btnCustomHero").addEventListener("click", () => openOrderModal(null));
document.getElementById("btnCustomHeroNav").addEventListener("click", () => openOrderModal(allProducts[0] || null));
document.getElementById("btnCustomBanner").addEventListener("click", () => openOrderModal(null));
document.getElementById("closeOrderModal").addEventListener("click", closeModal);
document.getElementById("cancelOrderModal").addEventListener("click", closeModal);
document.getElementById("btnNewAfterSuccess").addEventListener("click", closeModal);
orderModal.addEventListener("click", (e) => {
  if (e.target === orderModal) closeModal();
});

publicOrderForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (hpWebsite.value.trim() !== "") return;

  const client = orderClient.value.trim();
  const contact = orderContact.value.trim();
  const date = orderDate.value.trim();
  const notes = orderNotes.value.trim();

  const items = draftItems
    .map((it) => ({
      product: String(it.product || "").trim().slice(0, 140),
      description: String(it.description || "").trim().slice(0, 500),
      price: Math.max(0, Number(it.price) || 0),
      quantity: Math.max(1, Math.min(500, Math.round(Number(it.quantity) || 1))),
      catalogId: String(it.catalogId || "").trim().slice(0, 120)
    }))
    .filter((it) => it.product.length > 0);

  if (items.length === 0 || !client || !contact) {
    showToast("Completá los productos, tu nombre y un contacto.", true);
    return;
  }

  const total = calcItemsTotal(items);

  submitPublicOrder.disabled = true;
  submitPublicOrder.textContent = "Enviando...";

  try {
    const orderNumber = await allocateNextOrderNumber();
    await addDoc(collection(db, "orders"), {
      orderNumber,
      date,
      client,
      contact,
      status: "Pending",
      notes,
      items,
      total,
      source: "web",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    const summaryList = items.map((i) => `${i.quantity}× ${i.product}`).join(", ");
    const totalMsg = total > 0 ? ` · Total estimado: ${formatMoney(total)}` : " · A cotizar";
    orderSuccessTitle.textContent = `¡Pedido ${formatOrderNumber(orderNumber)} enviado al taller!`;
    orderSuccessSummary.textContent = `${client}, registramos tu pedido (${summaryList})${totalMsg}. Te escribimos a ${contact} para confirmar detalles.`;
    publicOrderForm.classList.add("hidden");
    orderSuccessView.classList.remove("hidden");
    showToast(`¡Pedido ${formatOrderNumber(orderNumber)} enviado!`);
  } catch (err) {
    console.error("Error al enviar pedido:", err);
    showToast("No se pudo enviar el pedido. Revisá tu conexión o intentá de nuevo.", true);
  } finally {
    submitPublicOrder.disabled = false;
    submitPublicOrder.textContent = "Enviar pedido";
  }
});

loadCatalog();
