/**
 * Linking GitHub's branches and pull requests to tasks. A task's reference is
 * the install's prefix and the task's number, such as `acme-42`, and a branch
 * or pull request that names it links to the task. Initiative keeps the links
 * on the task as two of the plug-in's fields, lists of links whose elements
 * are found by their ref (`pr:<owner>/<repository>#<number>` and
 * `branch:<owner>/<repository>:<name>`, the repository in lowercase), and
 * keeps them current from GitHub's deliveries, a schedule, and the task's own
 * actions.
 *
 * Every expression here runs in Initiative, as the install. A delivery's or
 * the schedule's changes are targeted at the tasks a text names, by id, or at
 * every task holding a link; an action's change is made on its own task.
 */

import { CAPS, type Action, type Expression, type Field, type Part, type Setting } from "initiative-plugin-sdk/manifest";

import { branchUrl, delivery, quote, STATUS } from "./endpoints/support.js";
import { ACTION, CHECKS_LABEL, FIELD, READ, REVIEW_LABEL, STATUS_LABEL, TASK_PREFIX, text, WRITE } from "./vocabulary.js";

// --- references and links ------------------------------------------------------

/** How many places that could be a reference a text is read for, which bounds what a long description costs. */
const CANDIDATES = 1000;

/**
 * `$tasks(texts)`: the tasks a list of texts names, by id, each once, in the
 * order named. A reference is the install's prefix, or one it had before, then
 * '-' and the task's number, as a word of its own and in any case: `acme-42` is
 * named in `feature/ACME-42-fix` and `[acme-42]`, and not in `xacme-42`, and
 * `acme-420` names 420.
 */
const TASKS = `$tasks := function($texts) {(
  $prefixes := [settings.${TASK_PREFIX}, aliases.${TASK_PREFIX}];
  $distinct($match(
    $join($filter([$texts], function($text) { $type($text) = "string" }), " "),
    /[A-Za-z0-9]+-[0-9]+[A-Za-z0-9]*/,
    ${CANDIDATES}
  ).(
    $reference := $split($lowercase(match), "-");
    $reference[0] in $prefixes and $contains($reference[1], /^[1-9][0-9]{0,8}$/) ? $number($reference[1])
  ))
)}`;

/** A pull request's link's ref, from its repository's full name and its number. */
const pullRef = (repository: Expression, number: Expression): Expression => `"pr:" & $lowercase(${repository}) & "#" & ${number}`;

/** A branch's link's ref, from its repository's full name and its own. */
const branchRef = (repository: Expression, name: Expression): Expression => `"branch:" & $lowercase(${repository}) & ":" & ${name}`;

/** Every task on which the install holds `$ref` under `key`. */
const holders = (key: string): Expression => `{"holding": {"key": ${quote(key)}, "value": $ref}}`;

/** A link to a pull request, as its field keeps it: `$ref`, its page, its number and title, and its state. */
const pullLink = (url: Expression, number: Expression, title: Expression, state: Expression): Expression =>
  `{"ref": $ref, "url": ${url}, "text": "#" & ${number} & " " & ${title}, "state": ${state}}`;

/**
 * A pull request's links' state from what a read answered of it: its status,
 * and its review and checks where GitHub said.
 */
const pullState = (status: Expression, review: Expression, checks: Expression): Expression =>
  `$merge([{"status": ${status}}, ${review} ? {"review": ${review}}, ${checks} ? {"checks": ${checks}}])`;

// --- deliveries ----------------------------------------------------------------

/**
 * A pull request delivery's changes: its link, made afresh from the
 * delivery, on every task that holds it and on each of the tasks
 * `referenced` names, the first 99 of them, so the changes stay within what
 * one delivery may make.
 */
function pullRequestWrite(referenced?: Expression): Expression {
  const named = referenced
    ? `$filter(${referenced}, function($id, $i) { $i < ${CAPS.writeTargets - 1} }).{"target": {"kind": "task", "id": $}, "upsert": $change},`
    : "";
  return `(
    ${referenced ? `${TASKS};` : ""}
    ${STATUS};
    $pull := payload.pull_request;
    $repository := payload.repository.full_name;
    $type($pull.number) = "number" and $type($repository) = "string" ? (
      $ref := ${pullRef("$repository", "$pull.number")};
      $change := {${quote(FIELD.pullRequests)}: [
        ${pullLink("$pull.html_url", "$pull.number", "$pull.title", `{"status": $status($pull.merged, $pull.state, $pull.draft)}`)}
      ]};
      [${named} {"target": ${holders(FIELD.pullRequests)}, "upsert": $change}]
    )
  )`;
}

/**
 * Any other change to a pull request: its title and status, on every task
 * that holds it. A review request is one, and announces it as well.
 */
export const REFRESH_PULL_REQUEST = pullRequestWrite();

/** The facet of a pull request a delivery moves, on every task that holds it. */
function pullFacetWrite(facet: "review" | "checks", value: Expression, numbers: Expression): Expression {
  return `(
    $value := ${value};
    $repository := payload.repository.full_name;
    $value and $type($repository) = "string" ? [
      $filter(${numbers}[$type($) = "number"], function($number, $i) { $i < ${CAPS.writeTargets} }).(
        $ref := ${pullRef("$repository", "$")};
        {"target": ${holders(FIELD.pullRequests)}, "upsert": {${quote(FIELD.pullRequests)}: [{"ref": $ref, "state": {${quote(facet)}: $value}}]}}
      )
    ]
  )`;
}

/** A branch's link's changes, from a `create` or `delete` delivery naming it. */
function branchWrite(change: Expression): Expression {
  return `(
    $name := payload.ref;
    $repository := payload.repository.full_name;
    $type($name) = "string" and $name != "" and $type($repository) = "string" ? (
      $ref := ${branchRef("$repository", "$name")};
      $length($ref) <= 255 ? ${change}
    )
  )`;
}

/**
 * What GitHub's deliveries change of the links, in rows after the
 * announcements. Only the first row whose `when` holds applies, so a review
 * request, which its announcement's row takes, refreshes the links there
 * ({@link REFRESH_PULL_REQUEST}).
 *
 * Deliveries are quick and coarse, and the schedule's re-read is the last
 * word: a pull request's review and checks are moved here only in the
 * direction a delivery can be sure of.
 */
export const LINK_EVENTS = [
  // A pushed branch links to each task its name names.
  {
    when: `${delivery("create")} and payload.ref_type = "branch"`,
    write: branchWrite(`(
      ${TASKS};
      $change := {${quote(FIELD.branches)}: [{
        "ref": $ref, "url": ${branchUrl("$repository", "$name")}, "text": $name, "state": {"status": "present"}
      }]};
      [$filter($tasks($name), function($id, $i) { $i < ${CAPS.writeTargets} }).{"target": {"kind": "task", "id": $}, "upsert": $change}]
    )`),
  },
  // A deleted branch shows as deleted wherever it is linked.
  {
    when: `${delivery("delete")} and payload.ref_type = "branch"`,
    write: branchWrite(
      `[{"target": ${holders(FIELD.branches)}, "upsert": {${quote(FIELD.branches)}: [{"ref": $ref, "state": {"status": "deleted"}}]}}]`
    ),
  },
  // Work that names a task links to it as it moves: when it opens, is pushed
  // to, merges or reopens. A pull request opened before the plug-in links on
  // its next such change.
  {
    when: delivery("pull_request", "opened", "reopened", "ready_for_review", "synchronize", "closed"),
    write: pullRequestWrite(`$tasks([$pull.head.ref, $pull.title, $pull.body])`),
  },
  // An edit links the tasks its new words name and the old ones did not, so a
  // link unlinked by hand comes back only when the reference is written anew.
  {
    when: delivery("pull_request", "edited"),
    write: pullRequestWrite(`(
      $before := $tasks([
        $exists(payload.changes.title.from) ? payload.changes.title.from : $pull.title,
        $exists(payload.changes.body.from) ? payload.changes.body.from : $pull.body
      ]);
      $tasks([$pull.title, $pull.body])[$not($ in $before)]
    )`),
  },
  // Any other change: the pull request's title and status, where it is linked.
  { when: delivery("pull_request"), write: REFRESH_PULL_REQUEST },
  // A review that approves or asks for changes says so; a dismissed one leaves
  // a review wanted. A comment says nothing of the decision.
  {
    when: delivery("pull_request_review", "submitted", "dismissed"),
    write: pullFacetWrite(
      "review",
      `(
        $state := $lowercase($string(payload.review.state));
        payload.action = "dismissed" ? "review_required" : $state in ["approved", "changes_requested"] ? $state
      )`,
      "[payload.pull_request.number]"
    ),
  },
  // One suite failing fails the pull request's checks. One succeeding passes
  // nothing: other suites may not have, and only the schedule's re-read sees
  // GitHub's verdict on them all, pending included.
  {
    when: delivery("check_suite", "completed"),
    write: pullFacetWrite(
      "checks",
      `payload.check_suite.conclusion in ["failure", "timed_out", "startup_failure", "action_required", "cancelled"] ? "failing"`,
      "payload.check_suite.pull_requests.number"
    ),
  },
];

// --- the schedule -----------------------------------------------------------------

/** How often the links are re-read, and the overlap each read keeps with the last. */
const EVERY_MINUTES = 15;

/**
 * Every quarter of an hour, the pull requests changed since the last run are
 * re-read, and every task holding one is told where it stands, so a delivery
 * lost on the way is made good. Each read starts a quarter of an hour before
 * the last one succeeded, since GitHub's search takes a moment to show a
 * change; reading one twice changes nothing.
 */
export const SCHEDULES = {
  refresh: {
    every: `${EVERY_MINUTES}m`,
    endpoint: READ.recentlyUpdated,
    params: `since ? {"since": $fromMillis($toMillis(since) - ${EVERY_MINUTES * 60000})} : {}`,
    write: `[$map(result.numbers, function($number, $i) {(
      $ref := ${pullRef("result.repositories[$i]", "$number")};
      {
        "target": ${holders(FIELD.pullRequests)},
        "upsert": {${quote(FIELD.pullRequests)}: [
          ${pullLink("result.urls[$i]", "$number", "result.titles[$i]", pullState("result.statuses[$i]", "result.reviews[$i]", "result.checks[$i]"))}
        ]}
      }
    )})]`,
  },
} as const;

// --- on a task ---------------------------------------------------------------------

export const FIELDS = {
  [FIELD.pullRequests]: {
    name: text("Pull requests", "Pull Requests", "Pull requests", "Pull requests"),
    kind: "link",
    list: true,
    on: ["task"],
    description: text(
      "The pull requests that name this task, with their status, review and checks.",
      "Die Pull Requests, die diese Aufgabe nennen, mit Status, Review und Checks.",
      "Las pull requests que nombran esta tarea, con su estado, revisión y comprobaciones.",
      "Les pull requests qui nomment cette tâche, avec leur état, leur revue et leurs vérifications."
    ),
    states: {
      status: {
        name: STATUS_LABEL,
        values: {
          draft: { label: text("Draft", "Entwurf", "Borrador", "Brouillon"), tone: "muted" },
          open: { label: text("Open", "Offen", "Abierta", "Ouverte"), tone: "accent" },
          merged: { label: text("Merged", "Gemergt", "Fusionada", "Fusionnée"), tone: "positive" },
          closed: { label: text("Closed", "Geschlossen", "Cerrada", "Fermée"), tone: "muted" },
        },
      },
      review: {
        name: REVIEW_LABEL,
        values: {
          approved: { label: text("Approved", "Genehmigt", "Aprobada", "Approuvée"), tone: "positive" },
          changes_requested: {
            label: text("Changes requested", "Änderungen angefragt", "Cambios solicitados", "Modifications demandées"),
            tone: "negative",
          },
          review_required: {
            label: text("Review required", "Review erforderlich", "Revisión necesaria", "Revue requise"),
            tone: "warning",
          },
          unreviewed: { label: text("No review", "Keine Review", "Sin revisión", "Sans revue"), tone: "muted" },
        },
      },
      checks: {
        name: CHECKS_LABEL,
        values: {
          passing: { label: text("Passing", "Bestanden", "Correctas", "Réussies"), tone: "positive" },
          failing: { label: text("Failing", "Fehlgeschlagen", "Fallidas", "En échec"), tone: "negative" },
          pending: { label: text("Pending", "Ausstehend", "En curso", "En cours"), tone: "warning" },
          none: { label: text("No checks", "Keine Checks", "Sin comprobaciones", "Aucune vérification"), tone: "muted" },
        },
      },
    },
    actions: [ACTION.unlink],
  },
  [FIELD.branches]: {
    name: text("Branches", "Branches", "Ramas", "Branches"),
    kind: "link",
    list: true,
    on: ["task"],
    description: text(
      "The branches that name this task, and whether each is still in GitHub.",
      "Die Branches, die diese Aufgabe nennen, und ob es jeden noch in GitHub gibt.",
      "Las ramas que nombran esta tarea, y si cada una sigue en GitHub.",
      "Les branches qui nomment cette tâche, et si chacune est encore dans GitHub."
    ),
    states: {
      status: {
        name: STATUS_LABEL,
        values: {
          present: { label: text("Present", "Vorhanden", "Presente", "Présente"), tone: "accent" },
          deleted: { label: text("Deleted", "Gelöscht", "Eliminada", "Supprimée"), tone: "muted" },
        },
      },
    },
    actions: [ACTION.unlink],
  },
} satisfies Record<string, Omit<Field, "key">>;

export const SETTINGS = {
  [TASK_PREFIX]: {
    type: "string",
    label: text("Task reference prefix", "Präfix der Aufgabenreferenzen", "Prefijo de referencia de tareas", "Préfixe des références de tâches"),
    description: text(
      "A branch or pull request that names a task as this prefix and its number, such as acme-42, links to it.",
      "Branches und Pull Requests, die eine Aufgabe mit diesem Präfix und ihrer Nummer nennen (etwa acme-42), werden verknüpft.",
      "Una rama o pull request que nombra una tarea con este prefijo y su número, como acme-42, se vincula a ella.",
      "Une branche ou pull request qui nomme une tâche par ce préfixe et son numéro, comme acme-42, y est liée."
    ),
    unique: true,
    assigned: "community_name",
  },
} satisfies Record<string, Omit<Setting, "key">>;

/** A task's reference, as a part's text names it and Initiative fills it in. */
const REFERENCE = `{settings.${TASK_PREFIX}}-{item.id}`;

export const PARTS = {
  github: {
    name: text("GitHub", "GitHub", "GitHub", "GitHub"),
    on: ["task"],
    description: text(
      "The task's branches and pull requests, and how to link more.",
      "Die Branches und Pull Requests der Aufgabe, und wie man weitere verknüpft.",
      "Las ramas y pull requests de la tarea, y cómo vincular más.",
      "Les branches et pull requests de la tâche, et comment en lier d'autres."
    ),
    tree: {
      type: "section",
      props: { title: text("GitHub", "GitHub", "GitHub", "GitHub") },
      children: [
        {
          type: "text",
          props: {
            text: text(
              `Start a branch name with ${REFERENCE} to link it here.`,
              `Beginne einen Branch-Namen mit ${REFERENCE}, um ihn hier zu verknüpfen.`,
              `Empieza el nombre de una rama con ${REFERENCE} para vincularla aquí.`,
              `Commencez le nom d'une branche par ${REFERENCE} pour la lier ici.`
            ),
            tone: "muted",
          },
        },
        {
          type: "text",
          props: {
            text: text(
              `Or put ${REFERENCE} in a pull request's title or description.`,
              `Oder schreib ${REFERENCE} in den Titel oder die Beschreibung eines Pull Requests.`,
              `O pon ${REFERENCE} en el título o la descripción de una pull request.`,
              `Ou mettez ${REFERENCE} dans le titre ou la description d'une pull request.`
            ),
            tone: "muted",
          },
        },
        { type: "field", props: { field: FIELD.pullRequests } },
        { type: "field", props: { field: FIELD.branches } },
        {
          type: "stack",
          props: { direction: "row", gap: "small", wrap: true },
          children: [
            { type: "button", props: { action: ACTION.startBranch, variant: "secondary" } },
            { type: "button", props: { action: ACTION.linkPullRequest, variant: "ghost" } },
          ],
        },
      ],
    },
  },
} satisfies Record<string, Omit<Part, "id">>;

export const ACTIONS = {
  [ACTION.startBranch]: {
    name: text("Start a branch", "Branch anlegen", "Crear una rama", "Créer une branche"),
    endpoint: WRITE.startBranch,
    params: ["repo", "base"],
    on: ["task"],
    menu: true,
    write: `(
      $ref := ${branchRef(`result.owner & "/" & result.repository`, "result.name")};
      {"upsert": {${quote(FIELD.branches)}: [{"ref": $ref, "url": result.url, "text": result.name, "state": {"status": "present"}}]}}
    )`,
  },
  [ACTION.linkPullRequest]: {
    name: text("Link a pull request", "Pull Request verknüpfen", "Vincular una pull request", "Lier une pull request"),
    // A read: the action keeps what it fetches.
    endpoint: READ.getPullRequest,
    params: ["repo", "number"],
    on: ["task"],
    menu: true,
    write: `(
      ${STATUS};
      $ref := ${pullRef(`result.owner & "/" & result.repository`, "result.number")};
      {"upsert": {${quote(FIELD.pullRequests)}: [
        ${pullLink("result.url", "result.number", "result.title", pullState("$status(result.merged, result.state, result.draft)", "result.review", "result.checks"))}
      ]}}
    )`,
  },
  // Offered on each link. GitHub still naming the task links it again on the
  // pull request's next push, merge or reopen.
  [ACTION.unlink]: {
    name: text("Unlink", "Verknüpfung lösen", "Desvincular", "Délier"),
    on: ["task"],
    write: `$type(element) = "string" ? (
      $substring(element, 0, 3) = "pr:"
        ? {"remove": {${quote(FIELD.pullRequests)}: [element]}}
        : {"remove": {${quote(FIELD.branches)}: [element]}}
    )`,
  },
} satisfies Record<string, Omit<Action, "id">>;

// --- help --------------------------------------------------------------------------

export const HELP = text(
  [
    "**Linking work to tasks.** Every task has a reference: this community's prefix and the task's number, such as `acme-42`. A task's GitHub section shows its own.",
    "",
    "- A **branch** whose name holds the reference links to the task when it is pushed. **Start a branch** creates one in GitHub for you, as you.",
    "- A **pull request** links when its branch, title or description holds the reference, and stays linked when it is renamed. **Link a pull request** adds one by hand.",
    "- **Unlink** takes a link off the task. While GitHub still names the task, the link comes back on the pull request's next push, merge or reopen: remove the reference in GitHub to unlink it for good.",
    "- A branch deleted in GitHub shows as deleted.",
    "- Each pull request shows its status, its review and its checks. Checks settle within about 15 minutes.",
    "- An automation can move a task when its linked pull request merges.",
    "",
    "An admin can rename the prefix in the plug-in's settings; references made with an earlier one still link. A prefix is unique on this server only: if another server's own GitHub App also watches your organization, it links references by its own prefixes.",
  ].join("\n"),
  [
    "**Arbeit mit Aufgaben verknüpfen.** Jede Aufgabe hat eine Referenz: das Präfix dieser Community und die Nummer der Aufgabe, etwa `acme-42`. Der GitHub-Bereich einer Aufgabe zeigt ihre.",
    "",
    "- Ein **Branch**, dessen Name die Referenz enthält, wird beim Pushen mit der Aufgabe verknüpft. **Branch anlegen** legt ihn für dich in GitHub an, als du.",
    "- Ein **Pull Request** wird verknüpft, wenn sein Branch, sein Titel oder seine Beschreibung die Referenz enthält, und bleibt es, wenn er umbenannt wird. **Pull Request verknüpfen** fügt einen von Hand hinzu.",
    "- **Verknüpfung lösen** nimmt eine Verknüpfung von der Aufgabe. Solange GitHub die Aufgabe noch nennt, kommt sie beim nächsten Push, Merge oder Wiedereröffnen des Pull Requests zurück: Entferne die Referenz in GitHub, um sie dauerhaft zu lösen.",
    "- Ein in GitHub gelöschter Branch wird als gelöscht angezeigt.",
    "- Jeder Pull Request zeigt seinen Status, seine Review und seine Checks. Checks stehen nach etwa 15 Minuten fest.",
    "- Eine Automatisierung kann eine Aufgabe verschieben, wenn ihr verknüpfter Pull Request gemergt wird.",
    "",
    "Ein Admin kann das Präfix in den Einstellungen des Plug-ins umbenennen; Referenzen mit einem früheren verknüpfen weiter. Ein Präfix ist nur auf diesem Server eindeutig: Beobachtet die eigene GitHub-App eines anderen Servers deine Organisation ebenfalls, verknüpft sie Referenzen nach ihren eigenen Präfixen.",
  ].join("\n"),
  [
    "**Vincular el trabajo con las tareas.** Cada tarea tiene una referencia: el prefijo de esta comunidad y el número de la tarea, como `acme-42`. La sección de GitHub de una tarea muestra la suya.",
    "",
    "- Una **rama** cuyo nombre contiene la referencia se vincula con la tarea al subirla. **Crear una rama** la crea en GitHub por ti, como tú.",
    "- Una **pull request** se vincula cuando su rama, su título o su descripción contienen la referencia, y sigue vinculada si cambia de nombre. **Vincular una pull request** añade una a mano.",
    "- **Desvincular** quita un vínculo de la tarea. Mientras GitHub siga nombrando la tarea, el vínculo vuelve con el siguiente push, fusión o reapertura de la pull request: quita la referencia en GitHub para desvincularla del todo.",
    "- Una rama eliminada en GitHub aparece como eliminada.",
    "- Cada pull request muestra su estado, su revisión y sus comprobaciones. Las comprobaciones se asientan en unos 15 minutos.",
    "- Una automatización puede mover una tarea cuando su pull request vinculada se fusiona.",
    "",
    "Un administrador puede cambiar el prefijo en los ajustes del plug-in; las referencias con uno anterior siguen vinculando. Un prefijo es único solo en este servidor: si la propia GitHub App de otro servidor también observa tu organización, vincula las referencias según sus propios prefijos.",
  ].join("\n"),
  [
    "**Lier le travail aux tâches.** Chaque tâche a une référence : le préfixe de cette communauté et le numéro de la tâche, comme `acme-42`. La section GitHub d'une tâche affiche la sienne.",
    "",
    "- Une **branche** dont le nom contient la référence est liée à la tâche quand elle est poussée. **Créer une branche** la crée dans GitHub pour vous, en votre nom.",
    "- Une **pull request** est liée quand sa branche, son titre ou sa description contient la référence, et le reste si elle est renommée. **Lier une pull request** en ajoute une à la main.",
    "- **Délier** retire un lien de la tâche. Tant que GitHub nomme encore la tâche, le lien revient au prochain push, à la fusion ou à la réouverture de la pull request : retirez la référence dans GitHub pour la délier pour de bon.",
    "- Une branche supprimée dans GitHub apparaît comme supprimée.",
    "- Chaque pull request affiche son état, sa revue et ses vérifications. Les vérifications se stabilisent en 15 minutes environ.",
    "- Une automatisation peut déplacer une tâche quand sa pull request liée est fusionnée.",
    "",
    "Un admin peut renommer le préfixe dans les réglages du plug-in ; les références faites avec un ancien préfixe lient toujours. Un préfixe n'est unique que sur ce serveur : si la propre GitHub App d'un autre serveur observe aussi votre organisation, elle lie les références selon ses propres préfixes.",
  ].join("\n")
);
