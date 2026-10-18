/** Open pull requests that asked for the viewer's review, across repositories. */

import type { Scene, WidgetData } from "initiative-plugin-sdk/widget";

import type { myReviewRequests } from "../endpoints/pulls.js";
import { pullTable } from "./pull-table.js";

export function render(data: WidgetData<typeof myReviewRequests>): Scene {
  return pullTable(data, "Nothing is waiting on your review", true);
}
