/** Pull requests in a repository that asked for the viewer's review. */

import type { Scene, WidgetData } from "initiative-plugin-sdk/widget";

import type { reviewQueue } from "../endpoints/pulls.js";
import { pullTable } from "./pull-table.js";

export function render(data: WidgetData<typeof reviewQueue>): Scene {
  return pullTable(data, "Nothing is waiting on you");
}
