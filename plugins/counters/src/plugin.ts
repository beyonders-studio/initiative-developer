/**
 * Counters, as a tool plug-in: the tool Initiative has built in today, declared
 * so Initiative can build it from this manifest instead. `npm run manifest`
 * builds `manifest.json` from it, and `npm run listing` the registry source.
 *
 * Nothing of the plug-in runs anywhere. It declares a counter group's rows and
 * the counters under them, with the columns Initiative's own `counter_groups`
 * and `counters` tables hold, what each one draws, and what a reader can run on
 * them. Initiative creates the tables in each community that installs it.
 */

import { definePlugin, type LayoutCardField, type LayoutDetailField, type LayoutDetailPart, type Tool } from "initiative-plugin-sdk/manifest";

/** A layout's part drawing one field. */
const field = (key: string): LayoutCardField => ({ type: "field", props: { field: key } });

/** A field a person fills in to add a row, and cannot empty: one of the
 *  counter's numbers or its look, which today's table holds as not null. */
const required = (key: string): LayoutDetailField => ({ type: "field", props: { field: key, required: true } });

/** A row's name with the menu of what else can be done with it, across the top
 *  of its page. */
const titleBar: LayoutDetailPart = { type: "stack", props: { direction: "row", gap: "sm", align: "start" }, children: [field("name"), { type: "actions" }] };

/** The value a reset puts a counter back to: its starting count, held within
 *  its bounds, as Initiative's own reset does. JSONata, run on one counter. */
const STARTING_COUNT =
  "($start := initial_count; (min != null and $start < min) ? min : (max != null and $start > max) ? max : $start)";

export const tool: Tool = {
  key: "counter_group",
  name: { en: "Counters", de: "Zähler", es: "Contadores", fr: "Compteurs" },
  instance_name: { en: "Counter group", de: "Zählergruppe", es: "Grupo de contadores", fr: "Groupe de compteurs" },
  icon: "gauge",
  fields: [{ key: "description", name: { en: "Description", de: "Beschreibung", es: "Descripción", fr: "Description" }, kind: "text" }],
  layouts: {
    // An initiative's counter groups, as cards: each its name over its
    // description, then its tags.
    list: {
      kind: "grid",
      card: {
        type: "card",
        children: [field("name"), { type: "stack", props: { tone: "muted" }, children: [field("description")] }, field("tags")],
      },
    },
    // A group's page: its name and menu, its description, then its tags and
    // properties, across the top; Initiative lists its counters, and what it
    // links to and its comments follow.
    detail: {
      header: [
        titleBar,
        { type: "stack", props: { tone: "muted" }, children: [field("description")] },
        { type: "stack", props: { direction: "row", gap: "sm", wrap: true }, children: [field("tags"), { type: "properties" }] },
      ],
      main: [{ type: "relations" }, { type: "comments" }],
    },
  },
  items: [
    {
      key: "counter",
      name: { en: "Counter", de: "Zähler", es: "Contador", fr: "Compteur" },
      fields: [
        {
          key: "count",
          name: { en: "Count", de: "Stand", es: "Valor", fr: "Valeur" },
          kind: "counter",
          counter: { min: "min", max: "max", step: "step", initial: "initial_count" },
        },
        { key: "min", name: { en: "Min", de: "Min.", es: "Mínimo", fr: "Min" }, kind: "number" },
        { key: "max", name: { en: "Max", de: "Max.", es: "Máximo", fr: "Max" }, kind: "number" },
        { key: "step", name: { en: "Step", de: "Schrittweite", es: "Incremento", fr: "Pas" }, kind: "number", default: 1 },
        {
          key: "initial_count",
          name: { en: "Initial value", de: "Anfangswert", es: "Valor inicial", fr: "Valeur initiale" },
          kind: "number",
          default: 0,
        },
        { key: "color", name: { en: "Color", de: "Farbe", es: "Color", fr: "Couleur" }, kind: "color" },
        {
          key: "view_mode",
          name: { en: "View mode", de: "Ansichtsmodus", es: "Modo de visualización", fr: "Mode d’affichage" },
          kind: "select",
          default: "number",
          options: [
            { value: "number", label: { en: "Number", de: "Zahl", es: "Número", fr: "Nombre" } },
            {
              value: "progress_bar",
              label: { en: "Progress bar", de: "Fortschrittsbalken", es: "Barra de progreso", fr: "Barre de progression" },
            },
            {
              value: "segmented_clock",
              label: { en: "Segmented clock", de: "Kreis (Uhr)", es: "Reloj segmentado", fr: "Horloge segmentée" },
            },
          ],
        },
      ],
      layouts: {
        // A group's counters, as cards: each its name over its count, drawn as
        // a number, the look a counter starts with.
        list: {
          kind: "grid",
          card: { type: "card", children: [field("name"), field("count")] },
          displays: { count: "number" },
        },
        // A counter's page, as Initiative ships it today: its name and menu
        // across the top, its count and what it links to in the middle, and
        // how it counts and its properties beside them.
        detail: {
          header: [titleBar],
          main: [field("count"), { type: "relations" }],
          side: [
            {
              type: "section",
              children: [field("color"), field("min"), field("max"), required("step"), required("initial_count"), required("view_mode")],
            },
            { type: "section", children: [{ type: "properties" }] },
          ],
        },
      },
      // A counter holds up what it is linked to until it reaches its max. One
      // with no max never finishes, so it holds nothing up.
      open_while: { field: "count", below: { field: "max" } },
    },
  ],
  actions: [
    {
      id: "reset",
      name: { en: "Reset", de: "Zurücksetzen", es: "Restablecer", fr: "Réinitialiser" },
      on: "counter",
      write: `{"set": {"count": item.${STARTING_COUNT}}}`,
    },
    {
      id: "reset_all",
      name: { en: "Reset All", de: "Alle zurücksetzen", es: "Restablecer todo", fr: "Tout réinitialiser" },
      on: "counter_group",
      confirm: {
        en: "Reset every counter in this group to its initial value?",
        de: "Jeden Zähler in dieser Gruppe auf seinen Anfangswert zurücksetzen?",
        es: "¿Restablecer cada contador de este grupo a su valor inicial?",
        fr: "Réinitialiser chaque compteur de ce groupe à sa valeur initiale ?",
      },
      write: `{"items": {"counter": [items.counter.{"id": id, "set": {"count": ${STARTING_COUNT}}}]}}`,
    },
  ],
};

export default definePlugin({
  publicId: "beyonders-studio.counters",
  // The uid Initiative's design and its tests name Counters by, so the tables
  // it converts today's counters into are the ones it has documented.
  uid: "TSJVTCM0S7GV2X",
  name: "Counters",
  // The tool block is plug-in API 11.1's.
  minPluginApi: "11.1",
  tool,
  listing: {
    publisher: "beyonders-studio",
    summary: "Numbers that move: tallies, totals, scores, seats left, hit points.",
    description: [
      "Groups of named numbers that people in an initiative step up and down.",
      "",
      "Each counter keeps its own step, its own floor and ceiling, its color, and the value a reset puts it back to. Counters show as a number, a progress bar or a segmented clock. Reset one counter, or the whole group at once.",
      "",
      "A counter linked to a task holds the task up until it reaches its max. Counter groups are shared, tagged, linked, commented on, archived and exported like every other tool.",
    ].join("\n"),
    avatar: "assets/avatar.png",
    version: "1.0.0",
    // The first Initiative that builds a tool from a tool plug-in.
    minAppVersion: "0.80.0",
    releaseNotes: "Counters as a tool plug-in, with the fields, looks and resets of the built-in tool. Needs an Initiative serving plug-in API 11.1.",
  },
});
