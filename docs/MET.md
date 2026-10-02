# Estimación energética

Fuente: [2024 Adult Compendium of Physical Activities](https://pacompendium.com/adult-compendium/), [tabla oficial](https://pacompendium.com/wp-content/uploads/2024/01/2024-adult-compendium-tracking-guide_1-2024.pdf).

| Actividad | Código | MET |
|---|---|---|
| Resistencia, ejercicios múltiples | 02054 | 3.5 |
| Resistencia con peso corporal, general | 02056 | 3.0 |
| Estiramiento suave | 02100 | 2.3 |

Fórmula: kcal = MET × 3.5 × masa en kg / 200 × minutos. Redondeo al entero más cercano. Se usa la masa introducida en Ajustes (70 kg inicial, editable). La sesión usa la media simple de MET de ejercicios registrados y el tiempo total transcurrido, incluidos descansos. Las modalidades sin correspondencia específica usan 3.5 como aproximación general; esto no estima velocidad ni intensidad individual. La exportación declara `method: "met-estimate"`. No es una medición de gasto energético.
