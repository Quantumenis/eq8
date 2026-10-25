// Tous les textes de l'interface. Ajouter ici toute nouvelle chaîne visible.

export const fr = {
  app: {
    name: "Quilt Studio",
    untitled: "Sans titre",
  },
  worktables: {
    quilt: "Quilt",
    block: "Bloc",
    image: "Image",
    switchTo: (name: string) => `Plan de travail ${name}`,
  },
  ribbon: {
    quilt: ["NOUVEAU QUILT", "DISPOSITION", "BORDURES", "DESIGN", "IMPRIMER & EXPORTER"],
    block: ["NOUVEAU BLOC", "DESSIN", "COLORATION", "IMPRIMER & EXPORTER"],
    image: ["IMAGE", "IMPRIMER & EXPORTER"],
  },
  palette: {
    title: "Palette",
    empty: "Les outils de cet onglet arrivent dans un prochain jalon.",
  },
  placeholder: {
    quilt: "Plan Quilt — dispositions, bordures et coloration arrivent aux jalons M5 et M6.",
    block: "Plan Bloc — le dessin EasyDraw arrive au jalon M2.",
    image: "Plan Image — l'import et la mise à l'échelle des tissus arrivent au jalon M4.",
  },
  status: {
    ready: "Prêt",
    units: "Unités : pouces",
    theme: "Thème",
    themes: { light: "Clair", dark: "Sombre", system: "Système" },
    version: (v: string) => `Version ${v}`,
  },
} as const;
