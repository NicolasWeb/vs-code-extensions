"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  detectLocale,
  operatingSystemLocales,
  supportedLocale,
  translate,
} = require("../src/localization");

assert.equal(supportedLocale("fr-FR"), "fr-FR");
assert.equal(supportedLocale("es_ES.UTF-8"), "es-ES");
assert.equal(supportedLocale("de-DE"), "");
assert.equal(detectLocale("fr-FR", ["es-ES"]), "fr-FR");
assert.equal(detectLocale("de-DE", ["es_ES.UTF-8"]), "es-ES");
assert.equal(detectLocale("de-DE", ["de-DE"]), "en-US");
assert.equal(translate("fr-FR", "actions.connect"), "Connecter");
assert.equal(
  translate("es-ES", "messages.status", { state: "Conectado", port: 8443 }),
  "Estado del túnel: Conectado. Puerto local: 8443."
);
assert.deepEqual(
  operatingSystemLocales("linux", {
    LC_ALL: "C",
    LC_MESSAGES: "fr_FR.UTF-8",
    LANG: "en_US.UTF-8",
  }, "de-DE"),
  ["C", "fr_FR.UTF-8", "en_US.UTF-8", "de-DE"]
);
const catalogs = ["en-US", "fr-FR", "es-ES"].map((locale) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "..", "l10n", `${locale}.json`), "utf8"))
);
assert.deepEqual(Object.keys(catalogs[0]).sort(), Object.keys(catalogs[1]).sort());
assert.deepEqual(Object.keys(catalogs[0]).sort(), Object.keys(catalogs[2]).sort());
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
assert.equal(manifest.main, "./src/extension.js");
assert.equal(manifest.contributes.commands[0].command, "ai4devTunnel.showActions");
assert.equal(manifest.engines.vscode, "^1.95.0");
const prefillSetting =
  manifest.contributes.configuration.properties["ai4devTunnel.authenticationPromptPrefill"];
assert.equal(prefillSetting.type, "boolean");
assert.equal(prefillSetting.default, true);
assert.equal(
  translate("fr-FR", "tooltip.authenticationPrefill", { value: "Activé" }),
  "Préremplissage de la commande d’authentification : Activé"
);
assert.match(
  translate("en-US", "errors.invalidBooleanSetting", { setting: "authenticationPromptPrefill" }),
  /must be a boolean value/
);
assert.match(
  translate("fr-FR", "errors.invalidBooleanSetting", { setting: "authenticationPromptPrefill" }),
  /doit être une valeur booléenne/
);
assert.match(
  translate("es-ES", "errors.invalidBooleanSetting", { setting: "authenticationPromptPrefill" }),
  /debe ser un valor booleano/
);

console.log("ai4dev_tunnel_localization_test: PASS");
