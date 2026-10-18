/**
 * The plug-in, declared once: the GitHub connections Initiative runs for it, the
 * calls Initiative makes to GitHub for each endpoint and how it reshapes the
 * answers, what GitHub's deliveries announce, its widgets and dashboard, and
 * its registry listing. `npm run manifest` builds `manifest.json` and the
 * registry source from it.
 *
 * Nothing of the plug-in runs anywhere: Initiative makes every call itself.
 */

import { definePlugin, type ConnectionFlow, type GithubPermissionLevel, type Paging } from "initiative-plugin-sdk/manifest";

import { EMIT_ENDPOINTS, EVENTS } from "./endpoints/emissions.js";
import { closeIssue, comment, findIssues, getIssue, label, listLabels, listMilestones, openIssue, reopenIssue } from "./endpoints/issues.js";
import { findProjectItem, listProjectFields, listProjectOptions, listProjects, moveProjectItem } from "./endpoints/projects.js";
import {
  findPullRequests,
  getPullRequest,
  linkedWork,
  myPullRequests,
  myReviewRequests,
  recentlyUpdated,
  requestReview,
  reviewQueue,
} from "./endpoints/pulls.js";
import { listAssignees, listBranches, listRepositories, startBranch } from "./endpoints/repositories.js";
import { listAlerts } from "./endpoints/security.js";
import { API, quote, rest, WEB } from "./endpoints/support.js";
import { ACTIONS, FIELDS, HELP, LINK_EVENTS, PARTS, SCHEDULES, SETTINGS } from "./linking.js";
import { ACCOUNT, DASHBOARD_UID, LISTING_UID, PUBLIC_ID, READ, text, WORKSPACE, WRITE } from "./vocabulary.js";

/**
 * The permissions the GitHub App registration asks for. Initiative shows them
 * to a member about to connect and creates the GitHub App with them, and the
 * README lists them for whoever registers the GitHub App by hand.
 */
const PERMISSIONS: Readonly<Record<string, GithubPermissionLevel>> = {
  issues: "write",
  pull_requests: "write",
  // Write, for Start a branch, which a member's own token makes.
  contents: "write",
  // A linked pull request's checks: check suites and runs, and commit
  // statuses, which GitHub sums up together.
  checks: "read",
  statuses: "read",
  vulnerability_alerts: "read",
  organization_projects: "write",
  metadata: "read",
};

/**
 * What each token Initiative mints for the organization's installation may do,
 * asked of GitHub every time: read, since every call the plug-in makes as the
 * installation reads. Writes, Start a branch's among them, run on a member's
 * own token, so no installation token can change a repository. GitHub mints
 * none until the installation's owner has accepted every one of these.
 */
const INSTALLATION_PERMISSIONS: Readonly<Record<string, GithubPermissionLevel>> = {
  issues: "read",
  pull_requests: "read",
  contents: "read",
  checks: "read",
  statuses: "read",
  vulnerability_alerts: "read",
  organization_projects: "read",
  metadata: "read",
};

/** The webhook events the GitHub App registration subscribes to. */
const WEBHOOK_EVENTS = ["issues", "pull_request", "release", "create", "delete", "pull_request_review", "check_suite"];

/** GitHub's user authorization for the GitHub App, which both connections run. */
const GITHUB_OAUTH: ConnectionFlow = {
  type: "oauth2",
  authorize_url: `${WEB}/login/oauth/authorize`,
  token_url: `${WEB}/login/oauth/access_token`,
  client_id: "{vendor.client_id}",
  client_secret: "{vendor.client_secret}",
  pkce: true,
};

/** Every page, up to ten of a hundred, of a list the person's own token reads. */
const pages = (items: string): Paging => ({
  kind: "page_number",
  page_param: "page",
  per_page_param: "per_page",
  per_page: 100,
  items,
  max_pages: 10,
  on_limit: "truncate",
});

/** A delivery about the GitHub App's installation itself. */
const installation = (action: string) =>
  `headers."x-github-event" = "installation" and payload.action = ${quote(action)}`;

export default definePlugin({
  publicId: PUBLIC_ID,
  uid: LISTING_UID,
  name: "GitHub",
  // The oldest plug-in API contract this runs on: the SDK release it is built
  // against. A deployment serving another major, or an older minor, refuses it.
  minPluginApi: "6.0",
  hosts: ["api.github.com"],
  // The plug-in keeps its links on tasks, which Initiative allows on the
  // tasks the install can read.
  scopes: ["projects:read"],
  settings: SETTINGS,

  // What the operator supplies once per deployment for the GitHub App: the
  // flows, the installation token and the webhooks below name them as
  // {vendor.<key>}.
  vendor: {
    label: text("GitHub App", "GitHub-App", "GitHub App", "GitHub App"),
    fields: [
      {
        key: "client_id",
        type: "string",
        required: true,
        label: text("Client ID", "Client-ID", "ID de cliente", "ID client"),
      },
      {
        key: "client_secret",
        type: "secret",
        required: true,
        label: text("Client secret", "Client-Secret", "Secreto de cliente", "Secret client"),
      },
      {
        key: "app_slug",
        type: "string",
        required: true,
        label: text(
          "App name in its GitHub address",
          "App-Name in der GitHub-Adresse",
          "Nombre de la app en su dirección de GitHub",
          "Nom de l'app dans son adresse GitHub"
        ),
      },
      {
        key: "app_id",
        type: "string",
        required: true,
        label: text("App ID", "App-ID", "ID de la app", "ID de l'app"),
      },
      {
        key: "private_key",
        type: "secret",
        required: true,
        label: text("Private key", "Privater Schlüssel", "Clave privada", "Clé privée"),
      },
      {
        key: "webhook_secret",
        type: "secret",
        required: true,
        label: text("Webhook secret", "Webhook-Secret", "Secreto del webhook", "Secret du webhook"),
      },
    ],
    // Initiative can create the GitHub App from the operator's browser, with
    // the permissions and events the README's registration table lists, and
    // write GitHub's answer into the six fields above.
    setup: {
      kind: "github_app_manifest",
      app: {
        name: "Initiative",
        url: "https://github.com/beyonders-studio/initiative-developer/tree/main/plugins/github",
        public: false,
        default_permissions: { ...PERMISSIONS },
        default_events: [...WEBHOOK_EVENTS],
      },
      values: {
        client_id: "client_id",
        client_secret: "client_secret",
        app_slug: "slug",
        app_id: "id",
        private_key: "pem",
        webhook_secret: "webhook_secret",
      },
    },
  },

  connections: {
    // The community's GitHub installation. An admin connects it once:
    // Initiative sends them to GitHub's install page, then through one
    // authorization, and keeps the installation they came back with only if
    // it is one of theirs and they control the account it is on: an admin of
    // the organization, or the user it is installed for. Initiative mints its
    // tokens from the GitHub App's key, and checks every 15 minutes that
    // GitHub still has it.
    [WORKSPACE]: {
      scope: "static",
      label: text("GitHub organization", "GitHub-Organisation", "Organización de GitHub", "Organisation GitHub"),
      fields: [
        {
          key: "owner",
          type: "string",
          required: true,
          managed: true,
          label: text("Owner or organization", "Inhaber oder Organisation", "Propietario u organización", "Propriétaire ou organisation"),
        },
        {
          key: "installation_id",
          type: "int",
          required: true,
          managed: true,
          label: text("Installation", "Installation", "Instalación", "Installation"),
        },
        // GitHub's word for the account, "Organization" or "User", which
        // GitHub's search names differently. An installation connected before
        // it was kept has none, and is searched as an organization's.
        {
          key: "owner_type",
          type: "string",
          managed: true,
          label: text("Account type", "Kontotyp", "Tipo de cuenta", "Type de compte"),
        },
      ],
      flow: {
        ...GITHUB_OAUTH,
        install_url: `${WEB}/apps/{vendor.app_slug}/installations/new`,
        after_connect: {
          steps: [
            {
              name: "installations",
              request: rest("GET", `"/user/installations"`, { connection: null, paging: pages("response.body.installations") }),
            },
            {
              name: "memberships",
              request: rest("GET", `"/user/memberships/orgs"`, {
                connection: null,
                query: { state: quote("active") },
                paging: pages("response.body"),
              }),
            },
            { name: "user", request: rest("GET", `"/user"`, { connection: null }) },
          ],
          map: `(
            $claimed := params.installation_id;
            $held := steps.installations.body[$string(id) = $claimed][0];
            $account := $held.account;
            $controls := $account.type = "Organization"
              ? $exists(steps.memberships.body[organization.id = $account.id and state = "active" and role = "admin"])
              : $account.type = "User" and $account.id = steps.user.body.id;
            $controls
              ? {"values": {"owner": $account.login, "installation_id": $held.id, "owner_type": $account.type}, "account_label": $account.login}
              : {}
          )`,
          refuse_when: "$not($exists(result.values.owner) and $exists(result.values.installation_id))",
          code: "installation-not-held",
        },
      },
      token: {
        type: "jwt_bearer",
        exchange_url: `${API}/app/installations/{installation_id}/access_tokens`,
        exchange_body: { permissions: { ...INSTALLATION_PERMISSIONS } },
        iss: "{vendor.app_id}",
        key: "{vendor.private_key}",
        alg: "RS256",
        lifetime: 540,
      },
      // GitHub stops honouring the installation's token once it is removed,
      // and says so when it is suspended.
      health: {
        request: rest("GET", `"/installation/repositories"`, { connection: null, query: { per_page: quote("1") } }),
        every: "15m",
        states: [
          { status: 401, state: "removed" },
          { status: 403, when: "$contains(response.body.message, /suspended/i)", state: "suspended" },
        ],
      },
    },
    // Each member's own GitHub authorization, for what the plug-in does
    // as them. Initiative holds it, renews it and ends it at GitHub, and names
    // the connection by the account's login.
    [ACCOUNT]: {
      scope: "interactive",
      label: text("Your GitHub account", "Dein GitHub-Konto", "Tu cuenta de GitHub", "Votre compte GitHub"),
      fields: [],
      flow: {
        ...GITHUB_OAUTH,
        after_connect: { request: rest("GET", `"/user"`, { connection: null }), map: `{"account_label": response.body.login}` },
        revoke: "github_grant",
        revoke_url: `${API}/applications/{vendor.client_id}/grant`,
      },
      access_hint: {
        api: "GitHub",
        scopes: Object.entries(PERMISSIONS).map(([permission, level]) => `${permission}:${level}`),
      },
    },
  },

  // Initiative receives the GitHub App's webhook deliveries, checks them, and
  // for every community whose organization connection holds the installation
  // a delivery came from, announces what it says, keeps the links tasks hold
  // current, and notes the installation being removed, suspended or restored.
  webhooks: {
    verify: {
      scheme: "hmac_sha256",
      header: "X-Hub-Signature-256",
      prefix: "sha256=",
      encoding: "hex",
      secret: "{vendor.webhook_secret}",
    },
    dedup: "X-GitHub-Delivery",
    route: { path: "installation.id", connection: WORKSPACE, field: "installation_id" },
    // The announcements first: the first row whose `when` holds is the only
    // one that applies, and a review request's row refreshes links itself.
    events: [...EVENTS, ...LINK_EVENTS],
    status: [
      { when: installation("deleted"), connection: WORKSPACE, state: "removed" },
      { when: installation("suspend"), connection: WORKSPACE, state: "suspended" },
      { when: installation("unsuspend"), connection: WORKSPACE, state: "ok" },
    ],
  },

  endpoints: {
    [READ.listRepositories]: listRepositories,
    [READ.listAssignees]: listAssignees,
    [READ.listBranches]: listBranches,
    [READ.listLabels]: listLabels,
    [READ.listMilestones]: listMilestones,
    [READ.getIssue]: getIssue,
    [READ.findIssues]: findIssues,
    [READ.getPullRequest]: getPullRequest,
    [READ.findPullRequests]: findPullRequests,
    [READ.reviewQueue]: reviewQueue,
    [READ.listAlerts]: listAlerts,
    [READ.listProjects]: listProjects,
    [READ.listProjectFields]: listProjectFields,
    [READ.listProjectOptions]: listProjectOptions,
    [READ.findProjectItem]: findProjectItem,
    [READ.recentlyUpdated]: recentlyUpdated,
    [READ.linkedWork]: linkedWork,
    [READ.myReviewRequests]: myReviewRequests,
    [READ.myPullRequests]: myPullRequests,
    [WRITE.openIssue]: openIssue,
    [WRITE.comment]: comment,
    [WRITE.closeIssue]: closeIssue,
    [WRITE.reopenIssue]: reopenIssue,
    [WRITE.label]: label,
    [WRITE.requestReview]: requestReview,
    [WRITE.moveProjectItem]: moveProjectItem,
    [WRITE.startBranch]: startBranch,
    ...EMIT_ENDPOINTS,
  },

  // Linking branches and pull requests to the tasks that name them.
  schedules: SCHEDULES,
  fields: FIELDS,
  parts: PARTS,
  actions: ACTIONS,
  help: HELP,

  // The dashboard tiles. Each module runs in Initiative's sandbox with one
  // data source, the endpoint its tile is bound to, and returns a scene. A
  // member's own tiles need only their own GitHub account.
  widgets: {
    "open-issues": {
      meta: {
        name: { en: "Open issues", de: "Offene Issues", es: "Incidencias abiertas", fr: "Tickets ouverts" },
        description: {
          en: "How many issues are open.",
          de: "Wie viele Issues offen sind.",
          es: "Cuántas incidencias están abiertas.",
          fr: "Combien de tickets sont ouverts.",
        },
      },
      endpoints: [READ.findIssues],
      module: "src/widgets/open-issues.ts",
      sample_data: {
        [READ.findIssues]: { numbers: [812], titles: ["Cache the issue counts"], count: 1, total: 42 },
      },
      requires: { all_of: [WORKSPACE] },
    },
    "review-queue": {
      meta: {
        name: { en: "Waiting on you", de: "Wartet auf dich", es: "Esperando por ti", fr: "En attente de vous" },
        description: {
          en: "Pull requests that asked for your review.",
          de: "Pull Requests, die deine Review angefragt haben.",
          es: "Pull requests que pidieron tu revisión.",
          fr: "Pull requests qui ont demandé votre revue.",
        },
      },
      endpoints: [READ.reviewQueue],
      module: "src/widgets/review-queue.ts",
      sample_data: {
        [READ.reviewQueue]: {
          numbers: [812, 809],
          titles: ["Cache the issue counts", "Drop the unused index"],
          urls: ["#", "#"],
          count: 2,
          total: 2,
        },
      },
      requires: { all_of: [WORKSPACE, ACCOUNT] },
    },
    "my-review-requests": {
      meta: {
        name: { en: "Your review requests", de: "Deine Review-Anfragen", es: "Tus solicitudes de revisión", fr: "Vos demandes de revue" },
        description: {
          en: "Open pull requests that asked for your review, across repositories, from your own GitHub account.",
          de: "Offene Pull Requests, die deine Review angefragt haben, über Repositories hinweg, aus deinem eigenen GitHub-Konto.",
          es: "Pull requests abiertas que pidieron tu revisión, en todos los repositorios, desde tu propia cuenta de GitHub.",
          fr: "Pull requests ouvertes qui ont demandé votre revue, dans tous les dépôts, depuis votre propre compte GitHub.",
        },
      },
      endpoints: [READ.myReviewRequests],
      module: "src/widgets/my-review-requests.ts",
      sample_data: {
        [READ.myReviewRequests]: {
          numbers: [812, 57],
          titles: ["Cache the issue counts", "Retry a webhook delivery"],
          urls: ["https://github.com/acme/widgets/pull/812", "https://github.com/acme/gadgets/pull/57"],
          count: 2,
          total: 2,
        },
      },
      requires: { all_of: [ACCOUNT] },
    },
    "my-pull-requests": {
      meta: {
        name: { en: "Your pull requests", de: "Deine Pull Requests", es: "Tus pull requests", fr: "Vos pull requests" },
        description: {
          en: "Your open pull requests, across repositories, from your own GitHub account.",
          de: "Deine offenen Pull Requests, über Repositories hinweg, aus deinem eigenen GitHub-Konto.",
          es: "Tus pull requests abiertas, en todos los repositorios, desde tu propia cuenta de GitHub.",
          fr: "Vos pull requests ouvertes, dans tous les dépôts, depuis votre propre compte GitHub.",
        },
      },
      endpoints: [READ.myPullRequests],
      module: "src/widgets/my-pull-requests.ts",
      sample_data: {
        [READ.myPullRequests]: {
          numbers: [815],
          titles: ["Draw the review load"],
          urls: ["https://github.com/acme/widgets/pull/815"],
          count: 1,
          total: 1,
        },
      },
      requires: { all_of: [ACCOUNT] },
    },
    "linked-pull-requests": {
      meta: {
        name: { en: "Linked pull requests", de: "Verknüpfte Pull Requests", es: "Pull requests vinculadas", fr: "Pull requests liées" },
        description: {
          en: "The organization's open pull requests that name a task, with the task each names.",
          de: "Die offenen Pull Requests der Organisation, die eine Aufgabe nennen, mit der Aufgabe, die jeder nennt.",
          es: "Las pull requests abiertas de la organización que nombran una tarea, con la tarea que nombra cada una.",
          fr: "Les pull requests ouvertes de l'organisation qui nomment une tâche, avec la tâche que chacune nomme.",
        },
      },
      endpoints: [READ.linkedWork],
      module: "src/widgets/linked-pull-requests.ts",
      sample_data: {
        [READ.linkedWork]: {
          tasks: [42, 57],
          references: ["acme-42", "acme-57"],
          repositories: ["acme/widgets", "acme/gadgets"],
          numbers: [812, 77],
          titles: ["Fix sign-in on the mobile app", "Cache the issue counts"],
          urls: ["#", "#"],
          count: 2,
        },
      },
      requires: { all_of: [WORKSPACE] },
    },
    "dependabot-alerts": {
      meta: {
        name: { en: "Dependabot alerts", de: "Dependabot-Warnungen", es: "Alertas de Dependabot", fr: "Alertes Dependabot" },
        description: {
          en: "Open dependency alerts by severity, worst first.",
          de: "Offene Abhängigkeitswarnungen nach Schwere, die schlimmsten zuerst.",
          es: "Alertas de dependencias abiertas por severidad, las peores primero.",
          fr: "Alertes de dépendances ouvertes par gravité, les pires d'abord.",
        },
      },
      endpoints: [READ.listAlerts],
      module: "src/widgets/dependabot-alerts.ts",
      sample_data: {
        [READ.listAlerts]: {
          severities: ["critical", "high", "high", "medium", "medium", "medium", "medium"],
          packages: ["left-pad", "lodash", "lodash", "minimist", "minimist", "qs", "qs"],
          count: 7,
          total: 7,
          url: "#",
        },
      },
      requires: { all_of: [WORKSPACE] },
    },
    "issue-throughput": {
      meta: {
        name: {
          en: "Issues opened and closed",
          de: "Geöffnete und geschlossene Issues",
          es: "Incidencias abiertas y cerradas",
          fr: "Tickets ouverts et fermés",
        },
        description: {
          en: "A fortnight of opens against closes.",
          de: "Zwei Wochen Öffnungen gegen Schließungen.",
          es: "Dos semanas de aperturas frente a cierres.",
          fr: "Deux semaines d'ouvertures contre fermetures.",
        },
      },
      endpoints: [READ.findIssues],
      module: "src/widgets/issue-throughput.ts",
      sample_data: {
        [READ.findIssues]: {
          created_at: ["2026-08-17T09:00:00Z", "2026-08-17T11:00:00Z", "2026-08-18T09:00:00Z", "2026-08-19T09:00:00Z"],
          closed_at: ["2026-08-17T15:00:00Z", "2026-08-19T15:00:00Z", "", ""],
          count: 4,
          total: 4,
        },
      },
      requires: { all_of: [WORKSPACE] },
    },
  },

  // Every tile is pointed at a repository where it sits: a repository is one
  // community's, so none is named here.
  dashboards: [
    {
      uid: DASHBOARD_UID,
      public_id: "beyonders-studio.github-overview",
      name: "GitHub overview",
      description: "A repository at a glance: open issues, reviews, alerts and throughput.",
      layout: { columns: 12 },
      widgets: [
        {
          id: "open",
          type: "open-issues",
          title: "Open issues",
          grid: { x: 0, y: 0, w: 3, h: 3 },
          binding: { endpoint_id: READ.findIssues, params: { state: "open", limit: 1 } },
        },
        {
          id: "reviews",
          type: "review-queue",
          title: "Waiting on your review",
          grid: { x: 3, y: 0, w: 6, h: 3 },
          binding: { endpoint_id: READ.reviewQueue, params: { state: "open", limit: 10 } },
        },
        {
          id: "alerts",
          type: "dependabot-alerts",
          title: "Dependabot alerts",
          grid: { x: 9, y: 0, w: 3, h: 3 },
          binding: { endpoint_id: READ.listAlerts },
        },
        {
          id: "throughput",
          type: "issue-throughput",
          title: "Opened and closed",
          grid: { x: 0, y: 3, w: 12, h: 4 },
          binding: {
            endpoint_id: READ.findIssues,
            params: { state: "all", since_days: 14, limit: 100, sort: "updated" },
          },
        },
      ],
    },
  ],

  // The registry listing. The "GitHub overview" dashboard is not a listing
  // of its own: it is bundled in the manifest, and a deployment publishes it
  // from there.
  listing: {
    publisher: "beyonders-studio",
    summary: "Your organization's issues, reviews and dependency alerts, on a dashboard and in your automations.",
    description: [
      "Bring a GitHub organization into your community.",
      "",
      "An admin connects the organization once, on GitHub's own install page, and picks the repositories the plug-in may see. Dashboards then show open issues, pull requests waiting on review, Dependabot alerts and a fortnight of throughput for everyone, with nobody pasting a token.",
      "",
      "Members who connect their own GitHub account get their own review queue, and automations can open, comment on, close, label and move issues as them. Their own review requests and pull requests show in any community with the plug-in, whether or not it has connected an organization.",
      "",
      "Tasks link to the branches and pull requests that name them, such as acme-42, and show whether each is open, reviewed and passing its checks. A task can start its own branch in GitHub, and a dashboard can list the open pull requests that name a task.",
    ].join("\n"),
    avatar: "assets/avatar.png",
    version: "6.0.0",
    // The oldest Initiative that runs a plug-in's calls to GitHub itself, and an
    // after_connect in steps; an older one refuses this manifest.
    minAppVersion: "0.75.0",
    releaseNotes:
      "Built on initiative-plugin-sdk 6.0. Needs an Initiative serving plug-in API 6.0; an older one refuses to install it.",
  },
});
