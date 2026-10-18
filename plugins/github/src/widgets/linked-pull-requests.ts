/** The organization's open pull requests that name a task, with the task each names. */

import type { Scene, WidgetData } from "initiative-plugin-sdk/widget";

import type { linkedWork } from "../endpoints/pulls.js";
import { missing } from "./missing.js";

export function render(data: WidgetData<typeof linkedWork>): Scene {
  const nothing = missing(data.values);
  if (nothing) return nothing;
  if (!data.rows.length) return { v: 1, scene: { kind: "empty", message: "No open pull request names a task" } };
  return {
    v: 1,
    scene: {
      kind: "table",
      columns: [
        { key: "task", label: "Task" },
        { key: "number", label: "#", align: "end" },
        { key: "title", label: "Pull request" },
        { key: "repository", label: "Repository" },
      ],
      rows: data.rows.slice(0, 10).map((row) => ({
        task: row.references || "",
        number: row.numbers || "",
        title: row.titles || "",
        repository: row.repositories || "",
      })),
    },
  };
}
