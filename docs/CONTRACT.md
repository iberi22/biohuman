# Contrato de salud v1

Implementación del borrador `docs/ecosistema-salud/CONTRATO-DATOS.md` del 2026-10-02. El documento define ejemplos, todavía no aporta un JSON Schema normativo; `src/data/workout-session.schema.json` es un espejo local testeado con Ajv. Validadores adicionales verifican el orden temporal y valores finitos.

Se exportan arrays `.swalhealth.json` con ULID, sujeto local seudónimo, `source.app: training`, refs `wg:<slug>`, kg, segundos y metros, y energía `met-estimate`. `gosDataset` se omite porque no se calculan nutrientes. Se puede recibir un `dietary-profile`; se muestra y pide consentimiento dentro de la app antes de persistirlo. No se importan vitales, condiciones ni alimentos.

Deep link: `orionhealth://import?p=<base64url(gzip(json))>`. Límite 8192 bytes del payload codificado; archivo si se excede. No se fija un dominio HTTPS de OrionHealth porque el contrato no especifica su URL de producción. Mesh cifrado con @swal/vault se conserva en la plantilla, no se activa para los registros de salud en este MVP.
