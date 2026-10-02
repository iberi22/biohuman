export const domainConfig = {
  appId: 'swal-training',
  appName: 'SWAL Training',
  instanceId: 'default',
  entities: [
    { name: "preferences", label: "Ajustes", fields: ["payload"], xavierKind: "preferences" },
    { name: "active-session", label: "Sesión activa", fields: ["payload"], xavierKind: "active-session" },
    { name: "dietary-profile", label: "Perfil dietario", fields: ["payload"], xavierKind: "dietary-profile" },
    {
        name: "exercise",
        label: "Exercise",
        fields: [
            "name",
            "status"
        ],
        xavierKind: "exercise"
    },
    {
        name: "routine",
        label: "Routine",
        fields: [
            "name",
            "status"
        ],
        xavierKind: "routine"
    },
    {
        name: "workout-session",
        label: "Workout-session",
        fields: [
            "name",
            "status"
        ],
        xavierKind: "workout-session"
    },
    {
        name: "body-metric",
        label: "Body-metric",
        fields: [
            "name",
            "status"
        ],
        xavierKind: "body-metric"
    }
],
  aui: {
    enabled: true,
    allowAgentTheme: true,
  },
  billing: {
    tier: 'socio' as const,
    mode: 'swal-managed' as const,
  },
} as const;
export type DomainConfig = typeof domainConfig;
