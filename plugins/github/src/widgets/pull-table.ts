/**
 * Pull requests as a table, the first ten: each one's number and title, and,
 * on a list that spans repositories, the repository its address names.
 */

import type { Scene, WidgetData } from "initiative-plugin-sdk/widget";

import type { ROWS_OUT } from "../vocabulary.js";
import { missing } from "./missing.js";

/** A pull request's repository, `owner/name`, from its address at GitHub. */
const repositoryOf = (url: string | undefined) => (url ?? "").split("/").slice(3, 5).join("/");

export function pullTable(data: WidgetData<{ returns: typeof ROWS_OUT }>, empty: string, repositories = false): Scene {
  const nothing = missing(data.values);
  if (nothing) return nothing;
  if (!data.rows.length) return { v: 1, scene: { kind: "empty", message: empty } };
  return {
    v: 1,
    scene: {
      kind: "table",
      columns: [
        { key: "number", label: "#", align: "end" },
        { key: "title", label: "Pull request" },
        ...(repositories ? [{ key: "repository", label: "Repository" }] : []),
      ],
      rows: data.rows.slice(0, 10).map((row) => ({
        number: row.numbers || "",
        title: row.titles || "",
        ...(repositories ? { repository: repositoryOf(row.urls) } : {}),
      })),
    },
  };
}
