import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getFirestore,
  doc,
  runTransaction
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getAnalytics, isSupported as isAnalyticsSupported } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-analytics.js";

export const firebaseConfig = {
  apiKey: "AIzaSyBP6sMrhygtwYdJIR8L23PUrXmwpHjN8ms",
  authDomain: "sanie-31158.firebaseapp.com",
  projectId: "sanie-31158",
  storageBucket: "sanie-31158.firebasestorage.app",
  messagingSenderId: "513620664418",
  appId: "1:513620664418:web:a92a95d78024b84484713b",
  measurementId: "G-8FF59ETJYP"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

isAnalyticsSupported()
  .then((supported) => {
    if (supported) getAnalytics(app);
  })
  .catch(() => {});

export const ADMIN_EMAIL = "corderomelaniebelen@gmail.com";
export const ORDER_STATUSES = ["Pending", "Processing", "Ready", "Delivered"];

export function formatMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "";
  return "$ " + num.toLocaleString("es-AR", {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  });
}

export function formatMoneyOrDash(value) {
  const formatted = formatMoney(value);
  return formatted || "—";
}

export function formatOrderNumber(num) {
  const n = Math.floor(Number(num) || 0);
  if (n <= 0) return "#—";
  return "#" + String(n).padStart(3, "0");
}

export function normalizeOrderItem(item = {}) {
  return {
    product: String(item.product || "").slice(0, 140),
    description: String(item.description || "").slice(0, 500),
    price: Math.max(0, Number(item.price) || 0),
    quantity: Math.max(0, Number(item.quantity) || 0),
    catalogId: String(item.catalogId || "").slice(0, 120)
  };
}

export function calcItemSubtotal(item) {
  const price = Math.max(0, Number(item?.price) || 0);
  if (price <= 0) return 0;
  const qty = Math.max(0, Number(item?.quantity) || 0);
  return price * (qty > 0 ? qty : 1);
}

export function calcItemsTotal(items = []) {
  return items.reduce((sum, item) => sum + calcItemSubtotal(item), 0);
}

export function normalizeOrder(raw = {}) {
  const items = Array.isArray(raw.items) && raw.items.length > 0
    ? raw.items.map(normalizeOrderItem)
    : [
        normalizeOrderItem({
          product: raw.product || "",
          description: raw.description || "",
          price: raw.price || 0,
          quantity: raw.quantity || 0,
          catalogId: raw.catalogId || ""
        })
      ];

  const computedTotal = calcItemsTotal(items);
  const total = computedTotal > 0 ? computedTotal : Math.max(0, Number(raw.total) || 0);

  return {
    ...raw,
    orderNumber: Math.max(0, Math.floor(Number(raw.orderNumber) || 0)),
    date: String(raw.date || ""),
    client: String(raw.client || ""),
    contact: String(raw.contact || ""),
    status: ORDER_STATUSES.includes(raw.status) ? raw.status : "Pending",
    notes: String(raw.notes || ""),
    items,
    total
  };
}

export function calcOrderTotal(order) {
  if (!order) return 0;
  if (Array.isArray(order.items)) {
    const sum = calcItemsTotal(order.items);
    return sum > 0 ? sum : Math.max(0, Number(order.total) || 0);
  }
  const price = Number(order.price) || 0;
  if (price <= 0) return 0;
  const qty = Number(order.quantity) || 0;
  return price * (qty > 0 ? qty : 1);
}

export function calcOrderUnits(order) {
  const normalized = normalizeOrder(order);
  return normalized.items.reduce((sum, item) => {
    const q = Math.max(0, Number(item.quantity) || 0);
    if (q > 0) return sum + q;
    return item.product || item.price > 0 ? sum + 1 : sum;
  }, 0);
}

export async function allocateNextOrderNumber(minFloor = 0) {
  const counterRef = doc(db, "counters", "orders");
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Math.max(0, Math.floor(Number(snap.data().lastNumber) || 0)) : 0;
    const nextNum = Math.max(current, Math.max(0, Math.floor(Number(minFloor) || 0))) + 1;
    tx.set(counterRef, { lastNumber: nextNum });
    return nextNum;
  });
}

export function formatTimestampDate(ts) {
  if (!ts) return "—";
  const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "—";
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()}-${months[d.getMonth()]} ${hh}:${mm}`;
}

export function getTimestampMonthKey(ts) {
  if (!ts) return "";
  const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(monthKey) {
  if (!monthKey || !monthKey.includes("-")) return monthKey || "";
  const [y, m] = monthKey.split("-");
  const names = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  const idx = Number(m) - 1;
  return idx >= 0 && idx < 12 ? `${names[idx]} ${y}` : monthKey;
}

export function formatQuantity(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return "—";
  return num.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

export function parseISODateLocal(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function formatShortDate(dateStr) {
  const d = parseISODateLocal(dateStr);
  if (!d) return "—";
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d.getDate()}-${months[d.getMonth()]}`;
}

export function computeDaysLeft(dateStr, status) {
  if (!dateStr) return { text: "", kind: "empty", num: null };
  if (status === "Delivered") return { text: "-", kind: "done", num: null };
  const target = parseISODateLocal(dateStr);
  if (!target) return { text: "", kind: "empty", num: null };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  return {
    text: String(diffDays),
    kind: diffDays < 0 ? "overdue" : diffDays <= 2 ? "urgent" : "normal",
    num: diffDays
  };
}

export function todayISO() {
  const d = new Date();
  return toISODate(d);
}

export function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const STARTER_CATALOG = [
  {
    id: "starter-mate-motor",
    name: "Mate Motor",
    category: "Mates",
    description: "Mate impreso en 3D con diseño mecánico de bloque motor e interior térmico removible. Personalizable en los colores de tu equipo o combinación favorita.",
    material: "PLA+ / Interior polímero",
    price: 18500,
    leadTimeDays: 3,
    badge: "Más pedido",
    imageUrl: "",
    iconKey: "mate-motor",
    active: true,
    sortOrder: 1
  },
  {
    id: "starter-mate-tuerca",
    name: 'Mate "Tuerca"',
    category: "Mates",
    description: "Diseño hexagonal tipo tuerca industrial, cómodo al agarre y resistente. Ideal para taller, regalo o uso diario con interior lavable.",
    material: "PLA+ / Interior polímero",
    price: 16500,
    leadTimeDays: 3,
    badge: "Personalizable",
    imageUrl: "",
    iconKey: "mate-tuerca",
    active: true,
    sortOrder: 2
  },
  {
    id: "starter-ajedrez-jiujitsu",
    name: "Ajedrez Jiu-Jitsu",
    category: "Juegos",
    description: "Set temático completo de piezas inspiradas en jiu-jitsu. Incluye torre especial y tablero de chapa listo para jugar o regalar.",
    material: "PLA+ de alta definición",
    price: 42000,
    leadTimeDays: 6,
    badge: "Edición especial",
    imageUrl: "",
    iconKey: "ajedrez",
    active: true,
    sortOrder: 3
  },
  {
    id: "starter-diseno-medida",
    name: "Pieza o Diseño a Medida",
    category: "A medida",
    description: "¿Tenés un archivo STL o una idea para imprimir? Cotizamos soportes, repuestos, llaveros por mayor y regalos personalizados.",
    material: "PLA+ / PETG",
    price: 0,
    leadTimeDays: 5,
    badge: "A cotizar",
    imageUrl: "",
    iconKey: "custom",
    active: true,
    sortOrder: 4
  }
];

export const INITIAL_EXCEL_ORDERS = [
  {
    orderNumber: 1,
    date: "2026-11-27",
    client: "Papa",
    contact: "",
    status: "Processing",
    notes: "Mate motor programado para el 23-nov",
    source: "admin",
    items: [
      { product: "Mate motor", description: "Color boca", price: 0, quantity: 1, catalogId: "" },
      { product: 'Mate "tuerca"', description: "", price: 0, quantity: 1, catalogId: "" },
      { product: "Ajedrez jiu-jitzu", description: "Incluye torre + tablero de chapa", price: 0, quantity: 1, catalogId: "" }
    ]
  },
  {
    orderNumber: 2,
    date: "",
    client: "Mishelle",
    contact: "",
    status: "Pending",
    notes: "",
    source: "admin",
    items: [
      { product: "Producto 1 (a definir)", description: "", price: 0, quantity: 1, catalogId: "" },
      { product: "Producto 2 (a definir)", description: "", price: 0, quantity: 1, catalogId: "" },
      { product: "Producto 3 (a definir)", description: "", price: 0, quantity: 1, catalogId: "" }
    ]
  },
  {
    orderNumber: 3,
    date: "",
    client: "Tamara",
    contact: "",
    status: "Pending",
    notes: "",
    source: "admin",
    items: [
      { product: "Producto (a definir)", description: "", price: 0, quantity: 1, catalogId: "" }
    ]
  }
];
