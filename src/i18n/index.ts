// i18n entrypoint. UI_LOCALE selects the catalog (defaults to zh). V1 ships zh only;
// adding a locale means adding a catalog that satisfies the Messages type. Framework-
// agnostic (no next/react), so both server components and scripts can read messages.

import { zh } from "./messages/zh";

export type Messages = typeof zh;

const catalogs: Record<string, Messages> = { zh };

export const UI_LOCALE = process.env.UI_LOCALE ?? "zh";

export function getMessages(locale: string = UI_LOCALE): Messages {
  return catalogs[locale] ?? zh;
}

/** Default catalog for the configured locale. */
export const messages: Messages = getMessages();
