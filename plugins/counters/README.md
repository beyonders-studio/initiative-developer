# Counters for Initiative

Counters as a tool plug-in: groups of named numbers that people in an
[Initiative](https://github.com/beyonders-studio/initiative) initiative step up
and down, reset and link to what they are counting towards. It is the tool
Initiative has built in today, declared so Initiative can build it from this
manifest instead. It is free.

It is a tool plug-in, so nothing of it runs anywhere: no service, no image, no
code. `src/plugin.ts` declares the tool, and Initiative creates its tables in
each community that installs it. Sharing, trash, archive, comments, tags,
links, search, export, the switch in each initiative and the permission to
create a group come with every tool and are not declared here.

## What it declares

| | |
|---|---|
| **The tool** | `counter_group`, a *Counter group*, with a description. Shown in the sidebar as *Counters*, with the gauge icon. |
| **Its item** | `counter`, a *Counter* in a group, with seven fields: the count, its min and max, its step (1 to start), its initial value (0 to start), its color and its view mode (number, progress bar or segmented clock). |
| **The count** | A counter field, stepped by the counter's own step, never past its own min or max, and reset to its own initial value. |
| **Blocking** | A counter linked to a task holds the task up until its count reaches its max. One with no max holds nothing up. |
| **Two actions** | *Reset* on a counter, and *Reset All* on a group, which asks first. Each puts the count back to the initial value, held within the min and max. |
| **Layouts** | A grid of groups, each its name, description and tags. A group's page with its name, menu, description, tags and properties across the top, then its counters, links and comments. A grid of counters, each its name and count. A counter's page with its name and menu across the top, its count and links in the middle, and how it counts and its properties beside them. |

Every name is in English, German, Spanish and French, in the words Initiative
uses for its built-in Counters.

## Building it

```sh
npm install
npm run typecheck
npm test                 # the actions' writes, run on sample counters
npm run manifest         # writes manifest.json from src/plugin.ts
npm run manifest:check   # fails when manifest.json is out of date or invalid
```

It is built on initiative-plugin-sdk's main branch, the first with tool
plug-ins, and needs an Initiative serving plug-in API 11.1 (Initiative 0.80.0).
`npm run listing` writes its registry source under
`registry/sources/beyonders-studio/TSJVTCM0S7GV2X/`, which publishes it once
merged.

MIT licensed.
