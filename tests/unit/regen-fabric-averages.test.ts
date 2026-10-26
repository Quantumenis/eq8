// Régénère src/core/library/fabricAverages.ts : QS_REGEN=1 npx vitest run tests/unit/regen-fabric-averages.test.ts
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { LIBRARY_FABRICS } from "../../src/core/library/fabrics";
import { generatedAverage } from "../../src/core/fabric/generator";

it.skipIf(!process.env.QS_REGEN)("régénère la table des couleurs moyennes", () => {
  const lines = LIBRARY_FABRICS.map((f) => `  ${JSON.stringify(f.id)}: ${JSON.stringify(generatedAverage(f.source))},`);
  writeFileSync(
    "src/core/library/fabricAverages.ts",
    `// Couleurs moyennes précalculées des tissus de la bibliothèque intégrée (fichier généré ; vérifié par fabrics.test.ts).\n// Pour le régénérer après un changement de la bibliothèque ou du générateur : voir PROGRESS.md (notes pratiques).\n\nexport const FABRIC_AVERAGES: Readonly<Record<string, string>> = {\n${lines.join("\n")}\n};\n`,
  );
});
