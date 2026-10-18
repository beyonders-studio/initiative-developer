import { defineEndpoint } from "initiative-plugin-sdk/manifest";

import {
  ACCOUNT,
  ASSIGNEES_OUT,
  AUTHOR_OUT,
  CHECKS_LABEL,
  CLOSED_OUT,
  COMMENTS_OUT,
  COUNT_OUT,
  CREATED_OUT,
  DIRECTION_IN,
  ISSUE_IDENTITY,
  LABELS_IN,
  LABELS_OUT,
  LIMIT_IN,
  LINK_OUT,
  many,
  MILESTONE_OUT,
  NUMBER,
  NUMBER_OUT,
  out,
  OWNER_OUT,
  param,
  PEOPLE_OF,
  REPO,
  REPO_OUT,
  REVIEW_LABEL,
  ROWS_OUT,
  SINCE_IN,
  SORT_IN,
  STATE_OUT,
  STATUS_LABEL,
  text,
  TITLE_OUT,
  TOTAL_OUT,
  UNAVAILABLE,
  UPDATED_OUT,
  URL_OUT,
  WORKSPACE,
} from "../vocabulary.js";
import {
  GITHUB_ERRORS,
  graphql,
  LIMIT,
  needs,
  NEEDS_NUMBER,
  NEEDS_REPO,
  PAGE,
  PUBLIC_READ,
  PUBLIC_WRITE,
  REPO_NAME,
  REPO_PATH,
  REPO_VARIABLES,
  rest,
  ROLLUP_REFUSED,
  ROW_FIELDS,
  rows,
  STATUS,
  subject,
  SUBJECT_FIELDS,
} from "./support.js";

const PULL_STATES = ["open", "closed", "merged", "all"] as const;

/** What both searches for pull requests take: everything but whose review is wanted. */
const PULL_PARAMS = {
  ...REPO,
  state: param("select", text("State", "Status", "Estado", "État"), { options: [...PULL_STATES] }),
  ...LABELS_IN,
  base_ref: param("string", text("Into branch", "Nach Branch", "Hacia la rama", "Vers la branche")),
  head_ref: param("string", text("From branch", "Von Branch", "Desde la rama", "Depuis la branche")),
};

const ORDER_IN = { ...SORT_IN, ...DIRECTION_IN, ...LIMIT_IN };

/** A GitHub login: letters, digits and single inner hyphens, at most 39. */
const LOGIN = `($login := params.review_requested; $length($login) <= 39 and $contains($login, /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/))`;

/**
 * Pull requests in the repository a call names, through GitHub's search:
 * `reviewer` is the search term for whose review is wanted.
 * Closed means closed without merging, as GitHub's own lists of pull requests
 * mean it. Values are quoted, so a parameter names one value.
 */
function search(reviewer: string, connection: string) {
  return graphql(
    `query Search($query: String!, $first: Int!) {
       search(query: $query, type: ISSUE, first: $first) {
         issueCount
         nodes { ... on PullRequest { ${ROW_FIELDS} } }
       }
     }`,
    `(
      $quoted := function($value) { '"' & $replace($value, '"', '') & '"' };
      {
        "query": $join([
          "repo:" & connections.workspace.owner & "/" & ${REPO_NAME},
          "is:pr",
          params.state = "closed" ? "is:closed is:unmerged" : params.state = "merged" ? "is:merged" : $not(params.state = "all") ? "is:open",
          params.labels.("label:" & $quoted($)),
          params.base_ref ? "base:" & $quoted(params.base_ref),
          params.head_ref ? "head:" & $quoted(params.head_ref),
          ${reviewer},
          "sort:" & (params.sort ? params.sort : "created") & "-" & (params.direction = "asc" ? "asc" : "desc")
        ], " "),
        "first": ${LIMIT}
      }
    )`,
    connection
  );
}

const FOUND = `(
  $search := response.body.data.search;
  ${rows("$search.nodes", "$search.issueCount")}
)`;

/** What a pull request's review and checks are asked for: GitHub's own combined answers. */
const REVIEW_FIELDS = "reviewDecision statusCheckRollup { state }";

/**
 * `$review(decision)` and `$checks(rollup)`: a pull request's review and its
 * checks in the words its links show, from GitHub's `reviewDecision` and
 * `statusCheckRollup`. No decision is no review and no rollup no checks, but a
 * rollup GitHub would not show is not known, and neither is a word GitHub has
 * added since: both are "".
 */
const REVIEW_AND_CHECKS = `
  $refused := ${ROLLUP_REFUSED};
  $review := function($decision) {
    $decision = null ? "unreviewed"
    : $decision = "APPROVED" ? "approved"
    : $decision = "CHANGES_REQUESTED" ? "changes_requested"
    : $decision = "REVIEW_REQUIRED" ? "review_required"
    : ""
  };
  $checks := function($rollup) {
    $rollup = null ? ($refused ? "" : "none")
    : $rollup.state = "SUCCESS" ? "passing"
    : $rollup.state in ["FAILURE", "ERROR"] ? "failing"
    : $rollup.state in ["PENDING", "EXPECTED"] ? "pending"
    : ""
  }`;

/** A time as GitHub's search takes it. */
const SEARCH_TIME = "[Y0001]-[M01]-[D01]T[H01]:[m01]:[s01]+00:00";

export const findPullRequests = defineEndpoint({
  direction: "read",
  label: text("Find pull requests", "Pull Requests suchen", "Buscar pull requests", "Rechercher des pull requests"),
  description: text(
    "The pull requests matching a question, including the ones waiting on a review.",
    "Die Pull Requests, die zu einer Frage passen, auch die, die auf eine Review warten.",
    "Las pull requests que coinciden con una consulta, incluidas las que esperan revisión.",
    "Les pull requests correspondant à une question, y compris celles en attente de revue."
  ),
  group: "reviews",
  ...PUBLIC_READ,
  cache_ttl_seconds: 60,
  params: {
    ...PULL_PARAMS,
    review_requested: param("string", text("Waiting on", "Wartet auf", "Esperando a", "En attente de"), {
      options_from: PEOPLE_OF,
    }),
    ...ORDER_IN,
  },
  returns: ROWS_OUT,
  request: search(`params.review_requested and ${LOGIN} ? "review-requested:" & params.review_requested`, WORKSPACE),
  ...needs(NEEDS_REPO, [`params.review_requested and $not(${LOGIN})`, "bad-login"]),
  map: FOUND,
});

export const reviewQueue = defineEndpoint({
  direction: "read",
  label: text("Waiting on your review", "Wartet auf deine Review", "Esperando tu revisión", "En attente de votre revue"),
  description: text(
    "The pull requests in a repository that asked for the member's review.",
    "Die Pull Requests eines Repositories, die die Review des Mitglieds angefragt haben.",
    "Las pull requests de un repositorio que pidieron la revisión del miembro.",
    "Les pull requests d'un dépôt qui ont demandé la revue du membre."
  ),
  group: "reviews",
  public: true,
  actors: ["member"],
  requires: { all_of: [WORKSPACE, ACCOUNT] },
  cache_ttl_seconds: 60,
  params: { ...PULL_PARAMS, ...ORDER_IN },
  returns: ROWS_OUT,
  // GitHub's search as the member, for whom `@me` stands.
  request: search(`"review-requested:@me"`, ACCOUNT),
  ...needs(NEEDS_REPO),
  map: FOUND,
});

export const getPullRequest = defineEndpoint({
  direction: "read",
  label: text("Get a pull request", "Pull Request abrufen", "Obtener una pull request", "Récupérer une pull request"),
  description: text(
    "One pull request by number: whether it is a draft, whether it merged, its review and its checks.",
    "Ein Pull Request nach Nummer: ob er ein Entwurf ist, ob er gemergt wurde, seine Review und seine Checks.",
    "Una pull request por número: si es un borrador, si se fusionó, su revisión y sus comprobaciones.",
    "Une pull request par numéro : brouillon ou non, fusionnée ou non, sa revue et ses vérifications."
  ),
  group: "reviews",
  ...PUBLIC_READ,
  cache_ttl_seconds: 0,
  params: { ...REPO, ...NUMBER },
  returns: {
    ...REPO_OUT,
    ...OWNER_OUT,
    ...NUMBER_OUT,
    ...TITLE_OUT,
    ...STATE_OUT,
    merged: out("bool"),
    draft: out("bool"),
    ...URL_OUT,
    ...AUTHOR_OUT,
    ...LABELS_OUT,
    ...ASSIGNEES_OUT,
    ...MILESTONE_OUT,
    ...COMMENTS_OUT,
    head_ref: out("string", { label: text("From branch", "Von Branch", "Desde la rama", "Depuis la branche") }),
    base_ref: out("string", { label: text("Into branch", "Nach Branch", "Hacia la rama", "Vers la branche") }),
    commits: out("int"),
    changed_files: out("int"),
    ...CREATED_OUT,
    ...UPDATED_OUT,
    ...CLOSED_OUT,
    merged_at: out("string"),
    // In the words of the review and the checks a linked pull request shows;
    // null when GitHub would not say.
    review: out("string", { label: REVIEW_LABEL }),
    checks: out("string", { label: CHECKS_LABEL }),
    ...UNAVAILABLE,
  },
  request: graphql(
    `query Pull($owner: String!, $repo: String!, $number: Int!) {
       repository(owner: $owner, name: $repo) {
         name
         owner { login }
         pullRequest(number: $number) {
           ${SUBJECT_FIELDS}
           isDraft merged mergedAt headRefName baseRefName changedFiles
           commits { totalCount }
           ${REVIEW_FIELDS}
         }
       }
     }`,
    `{${REPO_VARIABLES}, "number": params.number}`
  ),
  ...needs(NEEDS_REPO, NEEDS_NUMBER),
  map: subject(
    "pullRequest",
    `(
      ${REVIEW_AND_CHECKS};
      $known := function($word) { $word ? $word : null };
      {
        "merged": $node.merged = true,
        "draft": $node.isDraft = true,
        "head_ref": $text($node.headRefName),
        "base_ref": $text($node.baseRefName),
        "commits": $node.commits.totalCount ? $node.commits.totalCount : 0,
        "changed_files": $node.changedFiles ? $node.changedFiles : 0,
        "merged_at": $text($node.mergedAt),
        "review": $known($review($node.reviewDecision)),
        "checks": $known($checks($node.statusCheckRollup))
      }
    )`
  ),
});

/**
 * The organization's pull requests that changed since a time, newest first and
 * at most a hundred, with where each stands: what the schedule reads to keep
 * every task's links current when a delivery went astray. One search names
 * the installation's account from its connection, as GitHub searches an
 * organization's or a user's, and the time, and nothing else.
 */
export const recentlyUpdated = defineEndpoint({
  direction: "read",
  label: text(
    "Recently updated pull requests",
    "Kürzlich geänderte Pull Requests",
    "Pull requests actualizadas hace poco",
    "Pull requests mises à jour récemment"
  ),
  description: text(
    "The organization's pull requests changed since a time, with their status, review and checks.",
    "Die Pull Requests der Organisation, die sich seit einem Zeitpunkt geändert haben, mit Status, Review und Checks.",
    "Las pull requests de la organización que cambiaron desde un momento, con su estado, revisión y comprobaciones.",
    "Les pull requests de l'organisation modifiées depuis un moment, avec leur état, leur revue et leurs vérifications."
  ),
  group: "reviews",
  ...PUBLIC_READ,
  cache_ttl_seconds: 0,
  params: { ...SINCE_IN },
  returns: {
    // Each pull request's repository, as `owner/name`, beside its other columns.
    repositories: many(out("string")),
    numbers: many(out("int")),
    titles: many(out("string")),
    urls: many(out("url")),
    // In the words a linked pull request shows; "" where GitHub would not say.
    statuses: many(out("string", { label: STATUS_LABEL })),
    reviews: many(out("string", { label: REVIEW_LABEL })),
    checks: many(out("string", { label: CHECKS_LABEL })),
    ...COUNT_OUT,
    ...TOTAL_OUT,
    ...UNAVAILABLE,
  },
  request: graphql(
    `query Updated($query: String!, $first: Int!) {
       search(query: $query, type: ISSUE, first: $first) {
         issueCount
         nodes { ... on PullRequest { number title url state isDraft merged repository { nameWithOwner } ${REVIEW_FIELDS} } }
       }
     }`,
    `{
      "query": $join([
        "type:pr",
        (connections.workspace.owner_type = "User" ? "user:" : "org:") & connections.workspace.owner,
        "updated:>=" & $fromMillis(params.since ? $toMillis(params.since) : $millis() - 86400000, "${SEARCH_TIME}"),
        "sort:updated-desc"
      ], " "),
      "first": ${PAGE}
    }`
  ),
  errors: GITHUB_ERRORS,
  map: `(
    ${STATUS};
    ${REVIEW_AND_CHECKS};
    $search := response.body.data.search;
    $pulls := $search.nodes[$type(number) = "number" and $type(repository.nameWithOwner) = "string"];
    {
      "repositories": [$pulls.repository.nameWithOwner],
      "numbers": [$pulls.number],
      "titles": [$pulls.(title ? title : "")],
      "urls": [$pulls.(url ? url : "")],
      "statuses": [$pulls.$status(merged, state, isDraft)],
      "reviews": [$pulls.$review(reviewDecision)],
      "checks": [$pulls.$checks(statusCheckRollup)],
      "count": $count($pulls),
      "total": $search.issueCount
    }
  )`,
});

export const requestReview = defineEndpoint({
  direction: "write",
  label: text("Request a review", "Review anfragen", "Solicitar una revisión", "Demander une revue"),
  description: text(
    "Asks people or teams to review a pull request, as the member.",
    "Bittet Personen oder Teams, einen Pull Request zu prüfen, als das Mitglied.",
    "Pide a personas o equipos que revisen una pull request, como el miembro.",
    "Demande à des personnes ou des équipes de relire une pull request, en tant que le membre."
  ),
  group: "reviews",
  ...PUBLIC_WRITE,
  params: {
    ...REPO,
    ...NUMBER,
    reviewers: param("string", text("Reviewers", "Reviewer", "Revisores", "Relecteurs"), {
      list: true,
      options_from: PEOPLE_OF,
    }),
    team_reviewers: param("string", text("Team reviewers", "Team-Reviewer", "Equipos revisores", "Équipes relectrices"), {
      list: true,
    }),
  },
  returns: { ...REPO_OUT, ...NUMBER_OUT, ...LINK_OUT },
  identity: ISSUE_IDENTITY,
  request: rest("POST", `${REPO_PATH} & "/pulls/" & params.number & "/requested_reviewers"`, {
    connection: ACCOUNT,
    body: `$merge([
      $count(params.reviewers) ? {"reviewers": [params.reviewers]},
      $count(params.team_reviewers) ? {"team_reviewers": [params.team_reviewers]}
    ])`,
  }),
  errors: GITHUB_ERRORS,
  map: `{"repository": response.body.base.repo.name, "number": params.number, "html_url": response.body.html_url}`,
});
