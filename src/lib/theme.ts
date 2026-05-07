// Light, conventional B2B SaaS palette. White surfaces, slate text, red accent.
// Boring on purpose — this is what the client wants.

export const theme = {
  colors: {
    // Page surfaces
    surface: "#ffffff",
    "surface-container": "#ffffff",
    "surface-container-low": "#f8fafc",
    "surface-container-lowest": "#ffffff",
    "surface-container-high": "#f1f5f9",
    "surface-container-highest": "#e2e8f0",
    "surface-bright": "#ffffff",
    "surface-dim": "#f8fafc",
    "surface-tint": "#dc2626",
    background: "#ffffff",

    // Accent / primary CTA — red-600
    primary: "#dc2626",
    "primary-container": "#fee2e2",
    "on-primary": "#ffffff",
    "on-primary-container": "#7f1d1d",

    // Slate text
    "on-surface": "#0f172a",
    "on-surface-variant": "#475569",

    // Secondary = dark slate (the "Manage" button look)
    secondary: "#0f172a",
    "secondary-container": "#0f172a",
    "on-secondary": "#ffffff",
    "on-secondary-container": "#ffffff",

    // Tertiary = neutral muted slate
    tertiary: "#475569",
    "tertiary-container": "#e5e7eb",
    "on-tertiary": "#ffffff",
    "on-tertiary-container": "#0f172a",

    // Errors are also red — our accent is red so be careful using these
    error: "#dc2626",
    "error-container": "#fee2e2",
    "on-error": "#ffffff",
    "on-error-container": "#7f1d1d",

    // Borders / outlines
    outline: "#94a3b8",
    "outline-variant": "#e5e7eb",

    // Stars / chart helpers (referenced from a couple of places)
    star: "#fbbf24",
    success: "#16a34a",
    danger: "#dc2626",
  },
  fontFamily: {
    headline: ["Inter", "system-ui", "sans-serif"],
    body: ["Inter", "system-ui", "sans-serif"],
    label: ["Inter", "system-ui", "sans-serif"],
  },
  borderRadius: {
    DEFAULT: "0.375rem",
    lg: "0.5rem",
    xl: "0.75rem",
    full: "9999px",
  },
};

export type Theme = typeof theme;
