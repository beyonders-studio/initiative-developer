import { defineEndpoint } from "initiative-plugin-sdk/manifest";

import {
  ACCOUNT,
  COUNT_OUT,
  many,
  out,
  OWNER_OUT,
  param,
  READ,
  REPO,
  REPO_OUT,
  TASK_PREFIX,
  text,
  TOTAL_OUT,
  UNAVAILABLE,
  URL_OUT,
  WORKSPACE,
} from "../vocabulary.js";
import {
  branchUrl,
  GITHUB_ERRORS,
  graphql,
  needs,
  NEEDS_REPO,
  PAGE,
  PUBLIC_READ,
  REPO_NAME,
  REPO_PATH,
  REPO_VARIABLES,
  repositoryList,
  rest,
} from "./support.js";

export const listRepositories = defineEndpoint({
  direction: "read",
  label: text("Repositories", "Repositories", "Repositorios", "Dépôts"),
  description: text(
    "The repositories the organization's installation covers.",
    "Die Repositories, die die Installation der Organisation umfasst.",
    "Los repositorios que cubre la instalación de la organización.",
    "Les dépôts couverts par l'installation de l'organisation."
  ),
  group: "repositories",
  ...PUBLIC_READ,
  cache_ttl_seconds: 300,
  returns: {
    names: many(out("string", { label: text("Repositories", "Repositories", "Repositorios", "Dépôts") })),
    ...OWNER_OUT,
    ...COUNT_OUT,
    ...UNAVAILABLE,
  },
  request: rest("GET", `"/installation/repositories"`, {
    paging: {
      kind: "page_number",
      page_param: "page",
      per_page_param: "per_page",
      per_page: PAGE,
      items: "response.body.repositories",
      max_pages: 5,
      on_limit: "truncate",
    },
  }),
  errors: GITHUB_ERRORS,
  map: `(
    $names := [response.body.name];
    {"names": $names, "owner": connections.workspace.owner, "count": $count($names)}
  )`,
});

export const listAssignees = defineEndpoint({
  direction: "read",
  label: text("Who can be assigned", "Wer zuständig sein kann", "Quién puede ser asignado", "Qui peut être assigné"),
  description: text(
    "The people a repository's issues and pull requests can be given to.",
    "Die Personen, denen Issues und Pull Requests eines Repositories zugewiesen werden können.",
    "Las personas a las que se pueden asignar las incidencias y pull requests de un repositorio.",
    "Les personnes à qui les tickets et pull requests d'un dépôt peuvent être confiés."
  ),
  group: "repositories",
  ...PUBLIC_READ,
  cache_ttl_seconds: 300,
  params: { ...REPO },
  returns: {
    logins: many(out("string", { label: text("People", "Personen", "Personas", "Personnes") })),
    ...COUNT_OUT,
    ...TOTAL_OUT,
    ...UNAVAILABLE,
  },
  request: graphql(
    `query Assignees($owner: String!, $repo: String!, $first: Int!) {
       repository(owner: $owner, name: $repo) { assignableUsers(first: $first) { totalCount nodes { login } } }
     }`,
    `{${REPO_VARIABLES}, "first": ${PAGE}}`
  ),
  ...needs(NEEDS_REPO),
  map: repositoryList("assignableUsers", "logins", "login"),
});

export const listBranches = defineEndpoint({
  direction: "read",
  label: text("Branches", "Branches", "Ramas", "Branches"),
  description: text(
    "The branches a repository has.",
    "Die Branches, die ein Repository hat.",
    "Las ramas que tiene un repositorio.",
    "Les branches d'un dépôt."
  ),
  group: "repositories",
  ...PUBLIC_READ,
  cache_ttl_seconds: 300,
  params: { ...REPO },
  returns: {
    names: many(out("string", { label: text("Branches", "Branches", "Ramas", "Branches") })),
    ...COUNT_OUT,
    ...TOTAL_OUT,
    ...UNAVAILABLE,
  },
  // Alphabetical, so a menu of them keeps its order as people push.
  request: graphql(
    `query Branches($owner: String!, $repo: String!, $first: Int!) {
       repository(owner: $owner, name: $repo) {
         refs(refPrefix: "refs/heads/", first: $first, orderBy: { field: ALPHABETICAL, direction: ASC }) {
           totalCount
           nodes { name }
         }
       }
     }`,
    `{${REPO_VARIABLES}, "first": ${PAGE}}`
  ),
  ...needs(NEEDS_REPO),
  map: repositoryList("refs", "names", "name"),
});

/**
 * The branch a new one starts from, when `base` is a name git gives a branch
 * in letters, digits, '.', '_', '-' and '/': no part of it empty or starting
 * with '.', no '..', and no part ending '.lock' or '.'. Anything else is no
 * branch at all, so the address names a branch of the repository or none.
 */
const BASE_NAME = `(
  $base := params.base;
  $type($base) = "string" and $length($base) <= 255
    and $contains($base, /^[A-Za-z0-9._-]+(\\/[A-Za-z0-9._-]+)*$/)
    and $not($contains($base, /(^|\\/)\\.|\\.\\.|\\.lock(\\/|$)|\\.$/))
    ? $base : ""
)`;

/**
 * The branch Start a branch makes for the task it is run on: the task's
 * reference, then its title's letters and digits in lowercase, each run of
 * anything else one '-', cut at 50 characters: `acme-42-fix-sign-in`.
 */
const NEW_BRANCH = `(
  $slug := $lowercase($replace($replace(item.title, /[^A-Za-z0-9]+/, "-"), /^-+|-+$/, ""));
  $slug := $replace($substring($slug, 0, 50), /-+$/, "");
  settings.${TASK_PREFIX} & "-" & item.id & ($slug ? "-" & $slug : "")
)`;

const START_REFUSALS = needs(
  NEEDS_REPO,
  [`${BASE_NAME} = ""`, "branch-required"],
  // A task's reference needs the install's prefix and the task.
  [`$not($type(settings.${TASK_PREFIX}) = "string" and settings.${TASK_PREFIX} != "" and $type(item.id) = "number")`, "reference-required"]
);

/**
 * A branch for the task one of the plug-in's actions is run on, named after
 * it, so it links to the task when GitHub announces it. The member's own
 * account reads the base branch and makes the new one: GitHub lets them only
 * where both they and the GitHub App may write.
 */
export const startBranch = defineEndpoint({
  direction: "write",
  label: text("Start a branch", "Branch anlegen", "Crear una rama", "Créer une branche"),
  description: text(
    "Creates a branch named after the task, from a base branch, as the member.",
    "Legt als das Mitglied einen nach der Aufgabe benannten Branch an, ab einem Basis-Branch.",
    "Crea una rama con el nombre de la tarea, a partir de una rama base, como el miembro.",
    "Crée une branche au nom de la tâche, depuis une branche de base, en tant que le membre."
  ),
  group: "repositories",
  actors: ["member"],
  requires: { all_of: [WORKSPACE, ACCOUNT] },
  params: {
    ...REPO,
    base: param("string", text("Base branch", "Basis-Branch", "Rama base", "Branche de base"), {
      required: true,
      options_from: { endpoint: READ.listBranches, key: "names", needs: { repo: "repo" } },
    }),
  },
  returns: {
    ...REPO_OUT,
    ...OWNER_OUT,
    name: out("string", { label: text("Branch", "Branch", "Rama", "Branche") }),
    ...URL_OUT,
  },
  steps: [
    { name: "base", request: rest("GET", `${REPO_PATH} & "/git/ref/heads/" & ${BASE_NAME}`, { connection: ACCOUNT }) },
    {
      name: "branch",
      request: rest("POST", `${REPO_PATH} & "/git/refs"`, {
        connection: ACCOUNT,
        body: `{"ref": "refs/heads/" & ${NEW_BRANCH}, "sha": steps.base.body.object.sha}`,
      }),
    },
  ],
  unavailable: [...START_REFUSALS.unavailable, "branch-exists"],
  errors: [
    ...START_REFUSALS.errors,
    { status: 422, when: `$contains(response.body.message, /already exists/i)`, code: "branch-exists" },
  ],
  map: `(
    $name := $substringAfter(response.body.ref, "refs/heads/");
    {
      "repository": ${REPO_NAME},
      "owner": connections.workspace.owner,
      "name": $name,
      "url": ${branchUrl(`connections.workspace.owner & "/" & ${REPO_NAME}`, "$name")}
    }
  )`,
});
