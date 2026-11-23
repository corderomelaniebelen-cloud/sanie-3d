import {
  db,
  auth,
  formatMoney,
  formatMoneyOrDash,
  calcOrderTotal,
  formatQuantity,
  formatShortDate,
  formatTimestampDate,
  getTimestampMonthKey,
  formatMonthLabel,
  todayISO,
  escapeHtml
} from "./firebase.js";
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
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const authSection = document.getElementById("authSection");
const historySection = document.getElementById("historySection");
const adminUserEmail = document.getElementById("adminUserEmail");
const btnSignOut = document.getElementById("btnSignOut");
const authErrorBox = document.getElementById("authErrorBox");
const permissionErrorBanner = document.getElementById("permissionErrorBanner");

const kpiTotalDelivered = document.getElementById("kpiTotalDelivered");
const kpiTotalUnits = document.getElementById("kpiTotalUnits");
const kpiTotalRevenue = document.getElementById("kpiTotalRevenue");
const kpiMonthRevenue = document.getElementById("kpiMonthRevenue");
const kpiMonthSub = document.getElementById("kpiMonthSub");

const historySearch = document.getElementById("historySearch");
const historyMonthFilter = document.getElementById("historyMonthFilter");
const historyVisibleCount = document.getElementById("historyVisibleCount");
const historyTableBody = document.getElementById("historyTableBody");

let deliveredOrders = [];
let unsubOrders = null;

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

function stopListener() {
  if (unsubOrders) {
    unsubOrders();
    unsubOrders = null;
  }
}

function getOrderMonthKey(o) {
  return getTimestampMonthKey(o.updatedAt) || (o.date ? o.date.slice(0, 7) : "");
}

function updateMonthDropdown() {
  const currentSelected = historyMonthFilter.value;
  const months = [...new Set(deliveredOrders.map(getOrderMonthKey).filter(Boolean))].sort().reverse();

  historyMonthFilter.innerHTML =
    `<option value="ALL">Todos los meses</option>` +
    months
      .map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(formatMonthLabel(m))}</option>`)
      .join("");

  if (currentSelected === "ALL" || months.includes(currentSelected)) {
    historyMonthFilter.value = currentSelected;
  } else {
    historyMonthFilter.value = "ALL";
  }
}

function renderKPIs() {
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  let totalUnits = 0;
  let totalRevenue = 0;
  let monthRevenue = 0;
  let monthCount = 0;

  for (const o of deliveredOrders) {
    const qty = Number(o.quantity) || 0;
    const price = Number(o.price) || 0;
    const lineTotal = calcOrderTotal(o);
    totalUnits += qty > 0 ? qty : (price > 0 ? 1 : 0);
    totalRevenue += lineTotal;

    if (getOrderMonthKey(o) === currentMonthKey) {
      monthCount++;
      monthRevenue += lineTotal;
    }
  }

  kpiTotalDelivered.textContent = String(deliveredOrders.length);
  kpiTotalUnits.textContent = formatQuantity(totalUnits);
  kpiTotalRevenue.textContent = formatMoney(totalRevenue) || "$ 0";
  kpiMonthRevenue.textContent = formatMoney(monthRevenue) || "$ 0";
  kpiMonthSub.textContent = `${monthCount} ${monthCount === 1 ? "pedido" : "pedidos"} en ${formatMonthLabel(currentMonthKey)}`;
}

function getVisibleHistory() {
  const term = historySearch.value.trim().toLowerCase();
  const monthFilter = historyMonthFilter.value;

  return deliveredOrders.filter((o) => {
    const okMonth = monthFilter === "ALL" || getOrderMonthKey(o) === monthFilter;
    const okSearch =
      !term ||
      (o.product || "").toLowerCase().includes(term) ||
      (o.description || "").toLowerCase().includes(term) ||
      (o.client || "").toLowerCase().includes(term) ||
      (o.contact || "").toLowerCase().includes(term);
    return okMonth && okSearch;
  });
}

function renderHistoryTable() {
  renderKPIs();
  updateMonthDropdown();

  const visible = getVisibleHistory();
  historyVisibleCount.textContent = `${visible.length} ${visible.length === 1 ? "registro" : "registros"}`;

  if (deliveredOrders.length === 0) {
    historyTableBody.innerHTML = `
      <tr>
        <td colspan="9" class="empty-state">
          <p style="margin:0 0 12px;">Todavía no hay pedidos entregados en el historial.</p>
          <a href="./admin.html" class="btn btn-primary btn-sm">Ir a Pedidos Activos</a>
        </td>
      </tr>`;
    return;
  }

  if (visible.length === 0) {
    historyTableBody.innerHTML = `
      <tr>
        <td colspan="9" class="empty-state">No hay pedidos entregados que coincidan con ese filtro.</td>
      </tr>`;
    return;
  }

  historyTableBody.innerHTML = visible
    .map((o) => {
      const priceVal = Number(o.price) || 0;
      const qtyVal = Number(o.quantity) || 0;
      const totalVal = calcOrderTotal(o);
      const webTag = o.source === "web" ? `<span class="source-tag">Web</span>` : "";
      const contactHtml = o.contact ? `<span class="contact-sub">${escapeHtml(o.contact)}</span>` : "";

      return `
        <tr data-id="${escapeHtml(o.id)}">
          <td class="mono" style="color:var(--delivered-ink);font-weight:600;">${escapeHtml(formatTimestampDate(o.updatedAt))}</td>
          <td class="mono">${escapeHtml(formatShortDate(o.date))}</td>
          <td><strong>${escapeHtml(o.product || "—")}</strong>${webTag}</td>
          <td style="max-width:250px;color:var(--ink-muted);">${escapeHtml(o.description || "—")}</td>
          <td class="mono">${escapeHtml(formatMoneyOrDash(priceVal))}</td>
          <td class="mono">${escapeHtml(qtyVal > 0 ? formatQuantity(qtyVal) : "—")}</td>
          <td class="mono"><strong>${escapeHtml(formatMoneyOrDash(totalVal))}</strong></td>
          <td>
            <strong>${escapeHtml(o.client || "—")}</strong>
            ${contactHtml}
          </td>
          <td>
            <div class="row-actions">
              <button type="button" class="btn btn-outline btn-sm btn-restore-order" data-id="${escapeHtml(o.id)}">Restaurar</button>
              <button type="button" class="btn btn-danger-outline btn-sm btn-del-history" data-id="${escapeHtml(o.id)}">Borrar</button>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  historyTableBody.querySelectorAll(".btn-restore-order").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const order = deliveredOrders.find((x) => x.id === id);
      if (!order) return;
      const label = order.product || order.client || "este pedido";
      if (!confirm(`¿Devolver "${label}" al panel de Pedidos Activos con estado Ready?`)) return;
      btn.disabled = true;
      try {
        await updateDoc(doc(db, "orders", id), {
          status: "Ready",
          updatedAt: serverTimestamp()
        });
        showToast("Pedido restaurado a Ready en Pedidos Activos");
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        showToast("No se pudo restaurar el pedido", true);
      }
    });
  });

  historyTableBody.querySelectorAll(".btn-del-history").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const order = deliveredOrders.find((x) => x.id === id);
      if (!order) return;
      const label = order.product || order.client || "este pedido";
      if (!confirm(`¿Eliminar definitivamente "${label}" del historial?`)) return;
      try {
        await deleteDoc(doc(db, "orders", id));
        showToast("Registro eliminado del historial");
      } catch (err) {
        console.error(err);
        showToast("No se pudo eliminar el registro", true);
      }
    });
  });
}

function startListener() {
  stopListener();
  permissionErrorBanner.classList.add("hidden");

  const q = query(collection(db, "orders"), orderBy("updatedAt", "desc"));
  unsubOrders = onSnapshot(
    q,
    (snap) => {
      deliveredOrders = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((o) => o.status === "Delivered");
      renderHistoryTable();
    },
    (err) => {
      console.error("Error leyendo historial:", err);
      permissionErrorBanner.classList.remove("hidden");
      permissionErrorBanner.innerHTML = `
        <div>
          <strong>Sin permisos de administrador en Firestore.</strong>
          <span style="display:block;font-size:0.86rem;">Verificá haber iniciado sesión con tu cuenta autorizada (${escapeHtml(auth.currentUser?.email || "")}).</span>
        </div>`;
    }
  );
}

historySearch.addEventListener("input", renderHistoryTable);
historyMonthFilter.addEventListener("change", renderHistoryTable);

document.getElementById("btnExportHistoryCsv").addEventListener("click", () => {
  const rows = [["Entregado", "Fecha Pactada", "Product", "Description", "Price", "Cantidad", "Total", "Client", "Contact"]];
  for (const o of getVisibleHistory()) {
    const price = Number(o.price) || 0;
    const qty = Number(o.quantity) || 0;
    const total = calcOrderTotal(o);
    rows.push([
      formatTimestampDate(o.updatedAt),
      o.date || "",
      o.product || "",
      o.description || "",
      price || "",
      qty || "",
      total || "",
      o.client || "",
      o.contact || ""
    ]);
  }
  const csv = "\uFEFF" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sanie3d-historial-entregados-${todayISO()}.csv`;
  a.click();
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    authSection.classList.add("hidden");
    historySection.classList.remove("hidden");
    btnSignOut.classList.remove("hidden");
    adminUserEmail.textContent = user.email || user.uid;
    startListener();
  } else {
    stopListener();
    authSection.classList.remove("hidden");
    historySection.classList.add("hidden");
    btnSignOut.classList.add("hidden");
    adminUserEmail.textContent = "";
  }
});
