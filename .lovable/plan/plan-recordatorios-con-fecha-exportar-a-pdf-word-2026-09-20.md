# Plan: Recordatorios con fecha + Exportar a PDF/Word

## 1. Recordatorios con fecha (tablero de Tareas)

- **Fecha límite en cada tarjeta**: se añade un campo `due` (fecha) a las tarjetas. Cada tarjeta tendrá un botón de calendario para poner o quitar una fecha límite (selector de fecha emergente).
- **Aviso visual en la tarjeta**: chip con la fecha en formato legible, coloreado — rojo si ya venció, ámbar si vence hoy o mañana, gris en otro caso. Se oculta cuando la tarea está en "Hecho".
- **Notificaciones del navegador**: nuevo botón "Activar recordatorios" en la cabecera de Tareas que pide permiso al navegador. Un comprobador local (al abrir la app y cada hora) avisa con una notificación del sistema por cada tarea con fecha de hoy o vencida que aún no esté hecha. Cada aviso se registra para no repetirse el mismo día.
- Todo sigue guardándose en los mismos sitios de siempre (app, localStorage y archivo `.json` vinculado); las tarjetas antiguas siguen funcionando igual (la fecha es opcional).

## 2. Exportar a PDF y Word (actas y notas)

- En cada **acta** (pantalla principal) y en cada **nota del Lienzo de Reunión** se añaden dos botones: **Exportar PDF** y **Exportar Word**.
- **PDF**: se abre una ventana de impresión con una versión limpia y con formato (título, contenido renderizado, fecha) y el navegador ofrece "Guardar como PDF". Sin servidores ni servicios externos.
- **Word**: se descarga un archivo `.doc` con el contenido formateado (negritas, listas, tablas) que se abre directamente en Word, Google Docs o LibreOffice. También se genera en el propio ordenador.
- En las notas se exporta el texto renderizado; en las actas, el acta completa más la transcripción.

## Detalles técnicos

- Archivos afectados:
  - `src/lib/tasks.ts`: campo opcional `due` en `Card`.
  - `src/routes/tareas.tsx`: selector de fecha (Popover + Calendar de shadcn, ya instalado), chip de fecha coloreado, botón "Activar recordatorios", comprobador de avisos.
  - Nuevo `src/lib/reminders.ts`: permiso de notificaciones, comprobación de tareas vencidas, anti-duplicados en localStorage.
  - Nuevo `src/lib/export-doc.ts`: utilidades `exportPdf(titulo, html)` (ventana de impresión) y `exportWordDoc(titulo, html)` (blob `application/msword`).
  - `src/routes/index.tsx` y `src/routes/notas.tsx`: botones "Exportar PDF" / "Exportar Word" usando las utilidades.
  - `src/routes/ayuda.tsx`: nueva sección con las dos funciones.
- Sin dependencias nuevas ni servicios externos; todo funciona sin conexión y con los datos ya en local.

## Verificación

- `bunx tsgo --noEmit` sin errores.
- Playwright: poner fecha a una tarjeta y ver el chip; abrir el PDF de prueba; comprobar que la app carga sin errores de consola.
