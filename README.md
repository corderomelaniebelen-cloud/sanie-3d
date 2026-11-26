# Sanie 3D — Catálogo y Gestión de Pedidos de Impresión 3D

Aplicación web clara y minimalista para gestionar el catálogo público y los pedidos de impresión 3D de **Sanie 3D**, conectada en tiempo real a **Cloud Firestore** y **Firebase Authentication**.

## Estructura

- `index.html` + `js/store.js`: Catálogo público minimalista con filtros por categoría, buscador, armado de pedido multi-producto con cálculo automático de total y envío directo de pedidos numerados a Firestore.
- `admin.html` + `js/admin.js`: Panel privado de taller con login (Google o Correo/Contraseña), contadores en vivo (`Pending`, `Processing`, `Ready`, `Entregados`, `Total Activo ($)`), tabla por **Pedido #** con fecha, `Days Left`, cliente, lista de productos (`items`), suma total automática, botón rápido **`Entregado`** cuando el estado es `Ready`, creación/edición multi-producto en modal, exportación CSV y gestor del catálogo público.
- `historial.html` + `js/historial.js`: Dashboard independiente de **Historial de Pedidos Entregados** agrupado por **Pedido #**, con detalle de productos, métricas de facturación total y mensual, filtro por mes, buscador, exportación CSV y opción para restaurar un pedido al panel activo.
- `js/receipt.js`: Vista previa e impresión de boleta/comprobante (formato Boleta A4/PDF o Ticket 80mm) con detalle de productos, precios unitarios, cantidades, subtotales y total sumado.
- `firestore.rules` y `firestore.indexes.json`: Reglas de seguridad e índices de Cloud Firestore (`sanie-31158`).
