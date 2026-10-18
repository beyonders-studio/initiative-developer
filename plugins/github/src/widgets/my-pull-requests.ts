/** The viewer's own open pull requests, across repositories. */

import type { Scene, WidgetData } from "initiative-plugin-sdk/widget";

import type { myPullRequests } from "../endpoints/pulls.js";
import { pullTable } from "./pull-table.js";

export function render(data: WidgetData<typeof myPullRequests>): Scene {
  return pullTable(data, "You have no open pull requests", true);
}
