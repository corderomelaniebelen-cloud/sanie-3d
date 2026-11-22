# Sanie 3D — Catálogo y Gestión de Pedidos de Impresión 3D

Aplicación web clara y minimalista para gestionar el catálogo público y los pedidos de impresión 3D de **Sanie 3D**, conectada en tiempo real a **Cloud Firestore** y **Firebase Authentication**.

## Estructura

- `index.html` + `js/store.js`: Catálogo público minimalista con filtros por categoría, buscador, selector de cantidad con cálculo automático de total y envío directo de pedidos a Firestore.
- `admin.html` + `js/admin.js`: Panel privado de taller con login (Google o Correo/Contraseña), contadores en vivo (`Pending`, `Processing`, `Ready`, `Delivered`, `Total ($)`), tabla de pedidos con `Days Left` y `Cantidad × Precio`, creación/edición en modal, exportación CSV y gestor del catálogo público.
- `firestore.rules` y `firestore.indexes.json`: Reglas de seguridad e índices de Cloud Firestore (`sanie-31158`).
