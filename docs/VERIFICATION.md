# Verificación de entrega

Referencia: [DESIGN.md](../DESIGN.md), código Fize read-only del ref feat/redesign-visual y tokens reales de @swal/ui. Revisión mediante Playwright y capturas locales, sin despliegue ni push.

Gates finales y evidencia se registran al terminar la ejecución. El JSON Schema es un espejo local del borrador, validado con Ajv; las reglas de orden temporal se prueban aparte. El flujo smoke prueba navegación real y persistencia IndexedDB tras recargas, no inspección de código fuente.
