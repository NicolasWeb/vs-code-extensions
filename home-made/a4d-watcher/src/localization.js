"use strict";

const enUs = require("../l10n/en-US.json");
const esEs = require("../l10n/es-ES.json");
const frFr = require("../l10n/fr-FR.json");

const CATALOGS = {
  "en-US": enUs,
  "es-ES": esEs,
  "fr-FR": frFr,
};

const LANGUAGE_CATALOG = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
};

function supportedLocale(locale) {
  const language = String(locale || "")
    .trim()
    .replace(/_/g, "-")
    .split("-")[0]
    .toLowerCase();
  return LANGUAGE_CATALOG[language] || "";
}

function detectLocale(vscodeLocale, operatingSystemLocales) {
  const vscodeMatch = supportedLocale(vscodeLocale);
  if (vscodeMatch) {
    return vscodeMatch;
  }

  for (const candidate of operatingSystemLocales || []) {
    const osMatch = supportedLocale(candidate);
    if (osMatch) {
      return osMatch;
    }
  }
  return "en-US";
}

function operatingSystemLocales(platform = process.platform, env = process.env, intlLocale) {
  const systemLocale = intlLocale || Intl.DateTimeFormat().resolvedOptions().locale;
  const environmentLocales =
    platform === "win32"
      ? [systemLocale, env.LC_ALL, env.LC_MESSAGES, env.LANG]
      : [env.LC_ALL, env.LC_MESSAGES, env.LANG, systemLocale];
  return environmentLocales.filter((locale) => typeof locale === "string" && locale.length > 0);
}

// A string missing in the selected catalog is never an error: it falls back to
// the source language (en-US), then to the key itself.
function translate(locale, key, values = {}) {
  const catalog = CATALOGS[locale] || CATALOGS["en-US"];
  const source = CATALOGS["en-US"];
  let template;
  if (Object.prototype.hasOwnProperty.call(catalog, key)) {
    template = catalog[key];
  } else if (Object.prototype.hasOwnProperty.call(source, key)) {
    template = source[key];
  } else {
    template = key;
  }
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
  );
}

module.exports = {
  detectLocale,
  operatingSystemLocales,
  supportedLocale,
  translate,
};
