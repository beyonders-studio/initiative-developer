/**
 * Every endpoint, as Initiative runs it: the requests it makes to GitHub, on
 * which connection, and what it makes of GitHub's recorded answers, refusals
 * included; and the actions and the schedule that keep a task's links.
 */

import { runAction, runEndpoint, runSchedule, type RecordedResponse } from "initiative-plugin-sdk/testing";
import { describe, expect, it } from "vitest";

import plugin from "../src/plugin.js";
import { ACTION, FIELD, READ, WRITE } from "../src/vocabulary.js";
import { recorded } from "./fixtures.js";

const NOW = "2026-10-01T12:00:00Z";
const CONNECTIONS = { workspace: { owner: "acme", installation_id: 42 }, account: {} };
const API = "https://api.github.com";
const HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "initiative-github",
};

/** The install's prefix, `acme`, and the one it had before, `old`. */
const INSTALL = { settings: { task_prefix: "acme" }, aliases: { task_prefix: ["old"] } };

/** One endpoint, called with `params`, answered in turn by each recorded body or answer. */
function call(name: string, params: Record<string, unknown>, ...answers: Array<string | RecordedResponse>) {
  return runEndpoint(plugin, name, {
    params,
    connections: CONNECTIONS,
    ...INSTALL,
    now: NOW,
    responses: answers.map((answer) => (typeof answer === "string" ? { body: recorded(answer) } : answer)),
  });
}

const variables = (run: { requests: Array<{ body?: unknown }> }) =>
  (run.requests[0].body as { variables: Record<string, unknown> }).variables;

interface ReadCase {
  name: string;
  params: Record<string, unknown>;
  answers: string[];
  result: Record<string, unknown>;
}

const ROW = {
  urls: ["https://github.com/acme/widgets/issues/7"],
  states: ["open"],
  created_at: ["2026-09-01T00:00:00Z"],
  updated_at: ["2026-09-02T00:00:00Z"],
  closed_at: [""],
};

/** The pull request GitHub's recorded search answers, as every search for pull requests answers it. */
const PULL_ROW = { ...ROW, numbers: [9], titles: ["Fix the build"], urls: ["https://github.com/acme/widgets/pull/9"], count: 1, total: 1 };

const READS: ReadCase[] = [
  {
    name: READ.listRepositories,
    params: {},
    answers: ["rest/installation-repositories"],
    result: { names: ["widgets", "gadgets"], owner: "acme", count: 2 },
  },
  {
    name: READ.listAssignees,
    params: { repo: "widgets" },
    answers: ["graphql/assignees"],
    result: { logins: ["alice", "bob"], count: 2, total: 3 },
  },
  {
    name: READ.listBranches,
    params: { repo: "widgets" },
    answers: ["graphql/branches"],
    result: { names: ["develop", "main"], count: 2, total: 2 },
  },
  {
    name: READ.listLabels,
    params: { repo: "widgets" },
    answers: ["graphql/labels"],
    result: { names: ["bug", "docs"], count: 2, total: 2 },
  },
  {
    name: READ.listMilestones,
    params: { repo: "widgets" },
    answers: ["graphql/milestones"],
    result: { numbers: [3, 5], titles: ["1.0", "1.1"], count: 2, total: 2 },
  },
  {
    name: READ.getIssue,
    params: { repo: "Widgets", number: 7 },
    answers: ["graphql/subject"],
    result: {
      repository: "widgets",
      owner: "acme",
      number: 7,
      title: "Broken build",
      state: "open",
      state_reason: null,
      url: "https://github.com/acme/widgets/issues/7",
      author: "bob",
      labels: ["bug"],
      assignees: ["alice"],
      milestone: "1.0",
      comments: 2,
      is_pull_request: false,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-02T00:00:00Z",
      closed_at: null,
    },
  },
  {
    name: READ.findIssues,
    params: { repo: "widgets", state: "all", labels: ["bug"], since_days: 14, limit: 5, sort: "updated" },
    answers: ["graphql/issues"],
    result: {
      numbers: [7, 8],
      titles: ["Broken build", "Slow tests"],
      urls: [...ROW.urls, ROW.urls[0]],
      states: ["open", "closed"],
      created_at: [...ROW.created_at, ...ROW.created_at],
      updated_at: [...ROW.updated_at, ...ROW.updated_at],
      closed_at: ["", "2026-09-03T00:00:00Z"],
      count: 2,
      total: 40,
    },
  },
  {
    name: READ.getPullRequest,
    params: { repo: "widgets", number: 9 },
    answers: ["graphql/pull"],
    result: {
      repository: "widgets",
      owner: "acme",
      number: 9,
      title: "Fix the build",
      state: "merged",
      merged: true,
      draft: false,
      url: "https://github.com/acme/widgets/pull/9",
      author: "bob",
      labels: ["bug"],
      assignees: ["alice"],
      milestone: "1.0",
      comments: 2,
      head_ref: "fix",
      base_ref: "main",
      commits: 2,
      changed_files: 3,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-02T00:00:00Z",
      closed_at: "2026-09-03T00:00:00Z",
      merged_at: "2026-09-03T00:00:00Z",
      review: "approved",
      checks: "passing",
    },
  },
  { name: READ.findPullRequests, params: { repo: "widgets" }, answers: ["graphql/search"], result: PULL_ROW },
  { name: READ.reviewQueue, params: { repo: "widgets" }, answers: ["graphql/search"], result: PULL_ROW },
  { name: READ.myReviewRequests, params: {}, answers: ["graphql/search"], result: PULL_ROW },
  { name: READ.myPullRequests, params: {}, answers: ["graphql/search"], result: PULL_ROW },
  {
    name: READ.listAlerts,
    params: { repo: "widgets" },
    answers: ["graphql/alerts"],
    result: {
      numbers: [1, 2],
      severities: ["critical", "medium"],
      packages: ["left-pad", "qs"],
      urls: [
        "https://github.com/acme/widgets/security/dependabot/1",
        "https://github.com/acme/widgets/security/dependabot/2",
      ],
      count: 2,
      total: 2,
      url: "https://github.com/acme/widgets/security/dependabot",
    },
  },
  {
    name: READ.listProjects,
    params: {},
    answers: ["graphql/boards"],
    result: {
      ids: ["PVT_1"],
      titles: ["Roadmap"],
      numbers: [1],
      urls: ["https://github.com/orgs/acme/projects/1"],
      count: 1,
      total: 1,
    },
  },
  {
    name: READ.listProjectFields,
    params: { project_id: "PVT_1" },
    answers: ["graphql/fields"],
    result: { ids: ["F_1"], names: ["Status"], count: 1 },
  },
  {
    name: READ.listProjectOptions,
    params: { project_id: "PVT_1", field: "status" },
    answers: ["graphql/fields"],
    result: { field_id: "F_1", field_name: "Status", option_ids: ["O_1", "O_2"], option_names: ["Todo", "Done"] },
  },
  {
    name: READ.findProjectItem,
    params: { project_id: "PVT_1", repo: "widgets", number: 7 },
    answers: ["graphql/card"],
    result: { item_id: "PVTI_7", repository: "widgets", owner: "acme", number: 7 },
  },
  {
    name: READ.recentlyUpdated,
    params: { since: "2026-10-01T11:00:00Z" },
    answers: ["graphql/recently-updated"],
    result: {
      repositories: ["acme/widgets", "acme/Gadgets", "acme/widgets", "acme/widgets"],
      numbers: [9, 12, 13, 14],
      titles: ["Fix the build", "Try the cache", "Drop the unused index", "Bump the parser"],
      urls: [
        "https://github.com/acme/widgets/pull/9",
        "https://github.com/acme/Gadgets/pull/12",
        "https://github.com/acme/widgets/pull/13",
        "https://github.com/acme/widgets/pull/14",
      ],
      statuses: ["merged", "draft", "open", "closed"],
      reviews: ["approved", "unreviewed", "changes_requested", "review_required"],
      checks: ["passing", "none", "failing", "pending"],
      count: 4,
      total: 4,
    },
  },
  {
    // #9 is found by both searches and listed once for each task it names;
    // old-7 names a task by the earlier prefix.
    name: READ.linkedWork,
    params: {},
    answers: ["graphql/linked-work"],
    result: {
      tasks: [42, 57, 7, 61],
      references: ["acme-42", "acme-57", "acme-7", "acme-61"],
      repositories: ["acme/widgets", "acme/widgets", "acme/Gadgets", "acme/widgets"],
      numbers: [9, 9, 12, 13],
      titles: ["Fix sign-in (acme-42)", "Fix sign-in (acme-42)", "Finish the acme migration", "Cache the issue counts"],
      urls: [
        "https://github.com/acme/widgets/pull/9",
        "https://github.com/acme/widgets/pull/9",
        "https://github.com/acme/Gadgets/pull/12",
        "https://github.com/acme/widgets/pull/13",
      ],
      count: 4,
    },
  },
];

/** GitHub's answer with a pull request's checks withheld: the field refused, the rest answered. */
function unchecked(name: string, nodes: (data: any) => any[]): any {
  const answer = recorded(name);
  const pulls = nodes(answer.data);
  for (const node of pulls) node.statusCheckRollup = null;
  answer.errors = pulls.map((_, index) => ({
    type: "FORBIDDEN",
    path: [...(pulls.length > 1 ? ["search", "nodes", index] : ["repository", "pullRequest"]), "statusCheckRollup"],
    message: "Resource not accessible by integration",
  }));
  return answer;
}

describe("reads", () => {
  it("covers all nineteen", () => {
    expect(READS.map((one) => one.name).sort()).toEqual(Object.values(READ).sort());
  });

  for (const one of READS) {
    it(`${one.name} answers from GitHub's answer`, async () => {
      const run = await call(one.name, one.params, ...one.answers);
      expect(run).toEqual({ requests: expect.any(Array), result: one.result });
      for (const request of run.requests) expect(request.headers).toEqual(HEADERS);
    });

    it(`${one.name} says so when GitHub refuses the installation`, async () => {
      const run = await call(one.name, one.params, { status: 403, body: recorded("rest/forbidden") });
      expect(run).toMatchObject({ unavailable: "not-authorized" });
    });

    it(`${one.name} is retried when GitHub is limiting requests`, async () => {
      const limited = { status: 403, headers: { "X-RateLimit-Remaining": "0" }, body: recorded("rest/rate-limited") };
      expect(await call(one.name, one.params, limited)).toMatchObject({ transient: true });
      expect(await call(one.name, one.params, { status: 429 })).toMatchObject({ transient: true });
    });
  }

  it("asks GitHub as the organization's installation, about the repository the call names", async () => {
    const run = await call(READ.listLabels, { repo: "widgets" }, "graphql/labels");
    expect(run.requests).toEqual([
      {
        method: "POST",
        url: `${API}/graphql`,
        headers: HEADERS,
        body: { query: expect.stringContaining("repository(owner: $owner, name: $repo)"), variables: { owner: "acme", repo: "widgets", first: 100 } },
        connection: "workspace",
      },
    ]);
  });

  it("reads every page of the installation's repositories, up to five", async () => {
    const page = (names: string[]) => ({ body: { repositories: names.map((name) => ({ name })) } });
    const full = Array.from({ length: 100 }, (_, index) => `repo-${index}`);
    const run = await call(READ.listRepositories, {}, page(full), page(["last"]));
    expect(run.requests.map((request) => request.url)).toEqual([
      `${API}/installation/repositories?page=1&per_page=100`,
      `${API}/installation/repositories?page=2&per_page=100`,
    ]);
    expect(run).toMatchObject({ result: { count: 101, owner: "acme" } });

    const capped = await call(READ.listRepositories, {}, ...Array.from({ length: 5 }, () => page(full)));
    expect(capped.requests).toHaveLength(5);
    expect(capped).toMatchObject({ result: { count: 500 } });
  });

  it("asks for issues by state, labels, order and how far back", async () => {
    const run = await call(
      READ.findIssues,
      { repo: "widgets", state: "all", labels: ["bug"], since_days: 14, limit: 5, sort: "updated" },
      "graphql/issues"
    );
    expect(variables(run)).toEqual({
      owner: "acme",
      repo: "widgets",
      first: 5,
      order: { field: "UPDATED_AT", direction: "DESC" },
      filter: { states: null, labels: ["bug"], since: "2026-09-17T12:00:00.000Z" },
    });

    const defaults = await call(READ.findIssues, { repo: "widgets", assignee: "alice", milestone: 3, limit: 500 }, "graphql/issues");
    expect(variables(defaults)).toEqual({
      owner: "acme",
      repo: "widgets",
      first: 100,
      order: { field: "CREATED_AT", direction: "DESC" },
      filter: { states: ["OPEN"], assignee: "alice", milestoneNumber: "3" },
    });
  });

  it("finds pull requests through GitHub's search, as the installation", async () => {
    const run = await call(
      READ.findPullRequests,
      {
        repo: "widgets",
        state: "closed",
        labels: ["needs review", "ui"],
        base_ref: "main",
        head_ref: "fix",
        review_requested: "dave",
        sort: "updated",
        direction: "asc",
        limit: 10,
      },
      "graphql/search"
    );
    expect(run.requests[0].connection).toBe("workspace");
    expect(variables(run)).toEqual({
      query:
        'repo:acme/widgets is:pr is:closed is:unmerged label:"needs review" label:"ui" base:"main" head:"fix" review-requested:dave sort:updated-asc',
      first: 10,
    });

    const all = await call(READ.findPullRequests, { repo: "widgets", state: "all" }, "graphql/search");
    expect(variables(all)).toEqual({ query: "repo:acme/widgets is:pr sort:created-desc", first: 30 });
  });

  it("refuses a reviewer that is not a GitHub login, and never searches for it", async () => {
    for (const login of ["a b", "@me", "-dave", "x".repeat(40)]) {
      const run = await call(READ.findPullRequests, { repo: "widgets", review_requested: login }, "graphql/search");
      expect(run).toMatchObject({ unavailable: "bad-login" });
      expect(variables(run).query).not.toContain("review-requested");
    }
  });

  it("asks for the member's review queue as the member, in the repository on the organization", async () => {
    const run = await call(READ.reviewQueue, { repo: "widgets", labels: ["ui"], limit: 10 }, "graphql/search");
    expect(run.requests.map((request) => [request.method, request.url, request.connection])).toEqual([
      ["POST", `${API}/graphql`, "account"],
    ]);
    expect(variables(run)).toEqual({
      query: 'repo:acme/widgets is:pr is:open label:"ui" review-requested:@me sort:created-desc',
      first: 10,
    });
  });

  it("asks for the member's own review requests and pull requests with their account alone, naming no organization", async () => {
    const mine = (name: string, params: Record<string, unknown>) =>
      runEndpoint(plugin, name, { params, connections: { account: {} }, now: NOW, responses: [{ body: recorded("graphql/search") }] });
    for (const [name, asked] of [
      [READ.myReviewRequests, "review-requested:@me"],
      [READ.myPullRequests, "author:@me"],
    ]) {
      const run = await mine(name, { limit: 10 });
      expect(run.requests.map((request) => [request.method, request.url, request.connection])).toEqual([["POST", `${API}/graphql`, "account"]]);
      expect(variables(run)).toEqual({ query: `is:pr is:open ${asked} archived:false sort:created-desc`, first: 10 });
      expect(run).toMatchObject({ result: PULL_ROW });
      expect(variables(await mine(name, {})).first).toBe(30);
    }
  });

  it("asks for the organization's pull requests changed since a time, a day back unless it says", async () => {
    const since = await call(READ.recentlyUpdated, { since: "2026-10-01T11:00:00Z" }, "graphql/recently-updated");
    expect(since.requests[0].connection).toBe("workspace");
    expect(variables(since)).toEqual({ query: "type:pr org:acme updated:>=2026-10-01T11:00:00+00:00 sort:updated-desc", first: 100 });
    const unsaid = await call(READ.recentlyUpdated, {}, "graphql/recently-updated");
    expect(variables(unsaid).query).toBe("type:pr org:acme updated:>=2026-09-30T12:00:00+00:00 sort:updated-desc");
  });

  it("searches the organization for the prefix as a word and for branches beginning with it, and lists nothing without one", async () => {
    const linked = (settings: Record<string, string>, workspace: Record<string, unknown> = CONNECTIONS.workspace) =>
      runEndpoint(plugin, READ.linkedWork, { connections: { workspace }, settings, now: NOW, responses: [{ body: recorded("graphql/linked-work") }] });
    const run = await linked(INSTALL.settings);
    expect(run.requests[0].connection).toBe("workspace");
    expect(variables(run)).toEqual({
      named: '"acme" type:pr is:open org:acme sort:updated-desc',
      branched: "head:acme type:pr is:open org:acme sort:updated-desc",
      first: 50,
    });
    const personal = await linked(INSTALL.settings, { owner: "alice", installation_id: 43, owner_type: "User" });
    expect(variables(personal).branched).toBe("head:acme type:pr is:open user:alice sort:updated-desc");
    // No prefix, or one Initiative could not hold: GitHub is asked for one pull request, and none is listed.
    for (const settings of [{}, { task_prefix: 'acme" org:other' }] as Array<Record<string, string>>) {
      const none = await linked(settings);
      expect(variables(none)).toEqual({
        named: "type:pr is:open org:acme sort:updated-desc",
        branched: "type:pr is:open org:acme sort:updated-desc",
        first: 1,
      });
      expect(none).toMatchObject({ result: { tasks: [], references: [], numbers: [], count: 0 } });
    }
  });

  it("lists no pull request that only nearly names a task", async () => {
    // acme-ui, xacme-42, acme-420x, acme-0, "acme 42" and a branch named acme-tools.
    const answer = recorded("graphql/linked-work");
    for (const search of [answer.data.named, answer.data.branched]) {
      search.nodes = search.nodes.filter((node: { number?: number }) => [10, 11, 14].includes(node.number!));
    }
    expect(await call(READ.linkedWork, {}, { body: answer })).toMatchObject({ result: { tasks: [], count: 0 } });
  });

  it("answers what it can of a pull request whose checks GitHub withholds", async () => {
    const one = await call(READ.getPullRequest, { repo: "widgets", number: 9 }, { body: unchecked("graphql/pull", (data) => [data.repository.pullRequest]) });
    expect(one).toMatchObject({ result: { number: 9, state: "merged", review: "approved", checks: null } });
    const many = await call(READ.recentlyUpdated, {}, { body: unchecked("graphql/recently-updated", (data) => data.search.nodes) });
    expect(many).toMatchObject({ result: { numbers: [9, 12, 13, 14], checks: ["", "", "", ""] } });
    // A refusal of the question itself is still one.
    expect(await call(READ.getPullRequest, { repo: "widgets", number: 9 }, "graphql/forbidden")).toMatchObject({ unavailable: "not-authorized" });
  });

  it("names a missing repository, number, board or field rather than guessing one", async () => {
    const refused = { body: recorded("graphql/invalid-variables") };
    expect(await call(READ.findIssues, {}, refused)).toMatchObject({ unavailable: "repository-required" });
    expect(await call(READ.getIssue, { repo: "widgets" }, refused)).toMatchObject({ unavailable: "number-required" });
    expect(await call(READ.listProjectFields, {}, refused)).toMatchObject({ unavailable: "project-required" });
    expect(await call(READ.listProjectOptions, { project_id: "PVT_1" }, refused)).toMatchObject({ unavailable: "field-required" });
    expect(await call(READ.reviewQueue, {}, refused)).toMatchObject({ unavailable: "repository-required" });
  });

  it("searches one repository of the organization, or none", async () => {
    for (const repo of ["widgets repo:other/secret", "other/secret", "..", "wid\"gets"]) {
      const run = await call(READ.findPullRequests, { repo }, "graphql/search");
      expect(variables(run).query, repo).toBe("repo:acme/ is:pr is:open sort:created-desc");
      expect(run).toMatchObject({ unavailable: "repository-required" });
    }
  });

  it("says a repository, issue or pull request is not there", async () => {
    for (const name of [READ.listLabels, READ.listAssignees, READ.findIssues, READ.getIssue, READ.listAlerts, READ.findProjectItem]) {
      const run = await call(name, { repo: "elsewhere", number: 7, project_id: "PVT_1" }, "graphql/not-found");
      expect(run).toMatchObject({ unavailable: "not-found" });
    }
  });

  it("reads GitHub's refusal inside a GraphQL answer", async () => {
    expect(await call(READ.listAlerts, { repo: "widgets" }, "graphql/forbidden")).toMatchObject({ unavailable: "not-authorized" });
    expect(await call(READ.listLabels, { repo: "widgets" }, "graphql/rate-limited")).toMatchObject({ transient: true });
    expect(await call(READ.listLabels, { repo: "widgets" }, "graphql/invalid-variables")).toMatchObject({ unavailable: "invalid" });
  });

  it("reads only boards on the organization's own account", async () => {
    const elsewhere = recorded("graphql/fields");
    elsewhere.data.node.owner.login = "other";
    expect(await call(READ.listProjectFields, { project_id: "PVT_9" }, { body: elsewhere })).toMatchObject({
      unavailable: "project-not-listed",
    });
    expect(await call(READ.listProjectOptions, { project_id: "PVT_gone", field: "Status" }, "graphql/no-such-node")).toMatchObject({
      unavailable: "no-such-project",
    });
    expect(await call(READ.listProjectOptions, { project_id: "PVT_1", field: "Priority" }, "graphql/fields")).toMatchObject({
      unavailable: "no-such-field",
    });
    expect(await call(READ.listProjectOptions, { project_id: "PVT_1", field: "F_1" }, "graphql/fields")).toMatchObject({
      result: { field_id: "F_1" },
    });
  });

  it("says when an issue has no card on the board", async () => {
    const run = await call(READ.findProjectItem, { project_id: "PVT_3", repo: "widgets", number: 7 }, "graphql/card");
    expect(run).toMatchObject({ unavailable: "not-on-that-board" });
  });
});

interface WriteCase {
  name: string;
  params: Record<string, unknown>;
  /** The change it makes as the member, and GitHub's answer. */
  change: [method: string, path: string, body: unknown];
  answer: string;
  result: Record<string, unknown>;
}

const WRITES: WriteCase[] = [
  {
    name: WRITE.openIssue,
    params: { repo: "widgets", title: "Broken", body: "It broke.", labels: ["bug"], assignees: ["alice"] },
    change: ["POST", "/repos/acme/widgets/issues", { title: "Broken", body: "It broke.", labels: ["bug"], assignees: ["alice"] }],
    answer: "rest/issue-created",
    result: { repository: "widgets", number: 12, html_url: "https://github.com/acme/widgets/issues/12", id: 1001 },
  },
  {
    name: WRITE.comment,
    params: { repo: "widgets", number: 7, body: "On it." },
    change: ["POST", "/repos/acme/widgets/issues/7/comments", { body: "On it." }],
    answer: "rest/comment",
    result: { repository: "widgets", number: 7, id: 5, html_url: "https://github.com/acme/widgets/issues/7#issuecomment-5" },
  },
  {
    name: WRITE.closeIssue,
    params: { repo: "widgets", number: 7, reason: "not_planned" },
    change: ["PATCH", "/repos/acme/widgets/issues/7", { state: "closed", state_reason: "not_planned" }],
    answer: "rest/issue-closed",
    result: { repository: "widgets", number: 7, state: "closed", html_url: "https://github.com/acme/widgets/issues/7" },
  },
  {
    name: WRITE.reopenIssue,
    params: { repo: "widgets", number: 7 },
    change: ["PATCH", "/repos/acme/widgets/issues/7", { state: "open" }],
    answer: "rest/issue",
    result: { repository: "widgets", number: 7, state: "open", html_url: "https://github.com/acme/widgets/issues/7" },
  },
  {
    name: WRITE.requestReview,
    params: { repo: "widgets", number: 9, reviewers: ["carol"], team_reviewers: ["core"] },
    change: ["POST", "/repos/acme/widgets/pulls/9/requested_reviewers", { reviewers: ["carol"], team_reviewers: ["core"] }],
    answer: "rest/review-requested",
    result: { repository: "widgets", number: 9, html_url: "https://github.com/acme/widgets/pull/9" },
  },
];

describe("writes", () => {
  it("covers all eight", () => {
    expect([...WRITES.map((one) => one.name), WRITE.label, WRITE.moveProjectItem, WRITE.startBranch].sort()).toEqual(
      Object.values(WRITE).sort()
    );
  });

  for (const one of WRITES) {
    it(`${one.name} writes as the member, in the repository on the organization`, async () => {
      const run = await call(one.name, one.params, one.answer);
      const [method, path, body] = one.change;
      expect(run.requests).toEqual([{ method, url: `${API}${path}`, headers: HEADERS, body, connection: "account" }]);
      expect(run).toMatchObject({ result: one.result });
    });
  }

  it("passes GitHub's refusal of the member through", async () => {
    const missing = await call(WRITE.openIssue, { repo: "elsewhere", title: "x" }, { status: 404, body: { message: "Not Found" } });
    expect(missing).toMatchObject({ unavailable: "not-found" });
    const run = await call(WRITE.comment, { repo: "widgets", number: 7, body: "x" }, {
      status: 403,
      body: { message: "Must have push access" },
    });
    expect(run).toMatchObject({ unavailable: "not-authorized" });
    const invalid = await call(WRITE.requestReview, { repo: "widgets", number: 9 }, { status: 422 });
    expect(invalid.requests[0].body).toEqual({});
    expect(invalid).toMatchObject({ unavailable: "invalid" });
  });

  it("writes to a repository of the organization, or to none", async () => {
    for (const repo of ["../other/secret", "other/secret", "..", ".", "wid gets", "widgets?x=1", "%2e%2e"]) {
      const run = await call(WRITE.comment, { repo, number: 7, body: "x" }, { status: 404, body: { message: "Not Found" } });
      expect(run.requests.map((request) => request.url), repo).toEqual([`${API}/repos/acme//issues/7/comments`]);
      expect(run).toMatchObject({ unavailable: "not-found" });
    }
  });

  it("label reads the issue's labels, then sets them as the member", async () => {
    const run = await call(
      WRITE.label,
      { repo: "widgets", number: 7, add: ["triage", "bug"], remove: ["wontfix"] },
      "rest/issue",
      "rest/labels"
    );
    expect(run.requests).toEqual([
      { method: "GET", url: `${API}/repos/acme/widgets/issues/7`, headers: HEADERS, connection: "workspace" },
      {
        method: "PUT",
        url: `${API}/repos/acme/widgets/issues/7/labels`,
        headers: HEADERS,
        body: { labels: ["triage", "bug"] },
        connection: "account",
      },
    ]);
    expect(run).toMatchObject({ result: { repository: "widgets", number: 7 } });
  });

  it("label keeps a label named both to add and to remove, and may remove every label", async () => {
    const both = await call(WRITE.label, { repo: "widgets", number: 7, add: ["ui"], remove: ["UI", "bug"] }, "rest/issue", "rest/labels");
    expect(both.requests[1].body).toEqual({ labels: ["Wontfix", "ui"] });
    const none = await call(WRITE.label, { repo: "widgets", number: 7, remove: ["bug", "wontfix"] }, "rest/issue", "rest/labels");
    expect(none.requests[1].body).toEqual({ labels: [] });
  });

  it("label asks for a label to add or remove", async () => {
    const run = await call(WRITE.label, { repo: "widgets", number: 7 }, "rest/issue");
    expect(run.requests).toHaveLength(1);
    expect(run).toMatchObject({ unavailable: "invalid" });
  });

  it("move-project-item sets the card's field as the member", async () => {
    const params = { project_id: "PVT_1", item_id: "PVTI_7", field_id: "F_1", option_id: "O_2" };
    const run = await call(WRITE.moveProjectItem, params, "graphql/moved");
    expect(run.requests).toHaveLength(1);
    expect(run.requests[0].connection).toBe("account");
    expect(variables(run)).toEqual({ project: "PVT_1", item: "PVTI_7", field: "F_1", option: "O_2" });
    expect(run).toMatchObject({ result: { item_id: "PVTI_7" } });
  });
});

describe("a task's links", () => {
  const TASK = { kind: "task" as const, id: 42, title: "Fix sign-in on the mobile app!" };
  const PREFIX = { task_prefix: "acme" };
  const SHA = "aa218f56b14c9653891f9e74264a383fa43fefbd";
  const NEW_BRANCH = "acme-42-fix-sign-in-on-the-mobile-app";

  /** The state each change gives a pull request's link. */
  const states = (changes: Array<{ upsert?: Record<string, Array<{ state?: unknown }>> }>) =>
    changes.map((change) => change.upsert![FIELD.pullRequests][0].state);

  /** One of the task's actions, run with what the reader answered and GitHub's recorded answers. */
  function act(name: string, call: { params?: Record<string, unknown>; element?: string; title?: string; settings?: Record<string, string> }, ...answers: Array<string | RecordedResponse>) {
    const { title = TASK.title, settings = PREFIX, ...rest } = call;
    return runAction(plugin, name, {
      item: { ...TASK, title },
      settings,
      connections: CONNECTIONS,
      now: NOW,
      responses: answers.map((answer) => (typeof answer === "string" ? { body: recorded(answer) } : answer)),
      ...rest,
    });
  }

  /** Start a branch from `base`, GitHub finding it and making the new one. */
  const start = (base: string, title?: string) =>
    act(ACTION.startBranch, { params: { repo: "widgets", base }, title }, "rest/git-ref", { status: 201, body: recorded("rest/git-ref-created") });

  it("Start a branch makes the task's branch from the base as the member, and links it", async () => {
    const run = await start("release/1.0");
    expect(run.requests).toEqual([
      { method: "GET", url: `${API}/repos/acme/widgets/git/ref/heads/release/1.0`, headers: HEADERS, connection: "account" },
      {
        method: "POST",
        url: `${API}/repos/acme/widgets/git/refs`,
        headers: HEADERS,
        body: { ref: `refs/heads/${NEW_BRANCH}`, sha: SHA },
        connection: "account",
      },
    ]);
    const url = `https://github.com/acme/widgets/tree/${NEW_BRANCH}`;
    expect(run).toEqual({
      requests: expect.any(Array),
      result: { repository: "widgets", owner: "acme", name: NEW_BRANCH, url },
      change: { upsert: { [FIELD.branches]: [{ ref: `branch:acme/widgets:${NEW_BRANCH}`, url, text: NEW_BRANCH, state: { status: "present" } }] } },
    });
  });

  it("names the branch after the task's reference and the first fifty characters of its title", async () => {
    const names = {
      "  A very long title that goes well past the fifty character cut-off point ": "acme-42-a-very-long-title-that-goes-well-past-the-fifty-ch",
      [`${"x".repeat(49)} y`]: `acme-42-${"x".repeat(49)}`,
      "Straße für Ärzte": "acme-42-stra-e-f-r-rzte",
      "!!!": "acme-42",
    };
    for (const [title, name] of Object.entries(names)) {
      expect((await start("main", title)).requests[1].body, title).toEqual({ ref: `refs/heads/${name}`, sha: SHA });
    }
  });

  it("Start a branch starts from a branch of the repository or from none, and says what stopped it", async () => {
    for (const base of ["../../../user", "main/../../x", "a//b", ".hidden", "main.lock", "main?x=1", "%2e%2e"]) {
      const run = await act(ACTION.startBranch, { params: { repo: "widgets", base } }, { status: 404, body: { message: "Not Found" } });
      expect(run.requests.map((request) => request.url), base).toEqual([`${API}/repos/acme/widgets/git/ref/heads/`]);
      expect(run).toMatchObject({ unavailable: "branch-required" });
    }
    const taken = await act(ACTION.startBranch, { params: { repo: "widgets", base: "main" } }, "rest/git-ref", {
      status: 422,
      body: { message: "Reference already exists" },
    });
    expect(taken).toMatchObject({ unavailable: "branch-exists" });
    const refused = await act(ACTION.startBranch, { params: { repo: "widgets", base: "main" } }, "rest/git-ref", { status: 403, body: recorded("rest/forbidden") });
    expect(refused).toMatchObject({ unavailable: "not-authorized" });
    // A task's reference needs the install's prefix: no branch is made without one.
    const unnamed = await act(ACTION.startBranch, { params: { repo: "widgets", base: "main" }, settings: {} }, "rest/git-ref");
    expect(unnamed).toMatchObject({ requests: [{ method: "GET" }], unavailable: "reference-required" });
  });

  it("Link a pull request keeps the pull request it reads, with its review and checks", async () => {
    const run = await act(ACTION.linkPullRequest, { params: { repo: "widgets", number: 9 } }, "graphql/pull");
    expect(run.requests).toHaveLength(1);
    expect(run).toMatchObject({
      change: {
        upsert: {
          [FIELD.pullRequests]: [
            {
              ref: "pr:acme/widgets#9",
              url: "https://github.com/acme/widgets/pull/9",
              text: "#9 Fix the build",
              state: { status: "merged", review: "approved", checks: "passing" },
            },
          ],
        },
      },
    });
    // What GitHub withholds stays as the link had it.
    const withheld = await act(ACTION.linkPullRequest, { params: { repo: "widgets", number: 9 } }, {
      body: unchecked("graphql/pull", (data) => [data.repository.pullRequest]),
    });
    expect(states("change" in withheld ? [withheld.change!] : [])).toEqual([{ status: "merged", review: "approved" }]);
  });

  it("Unlink takes a link off the list it is in", async () => {
    const unlink = (element: string) => runAction(plugin, ACTION.unlink, { item: TASK, element });
    expect(await unlink("pr:acme/widgets#9")).toEqual({
      requests: [],
      change: { remove: { [FIELD.pullRequests]: ["pr:acme/widgets#9"] } },
    });
    expect(await unlink(`branch:acme/widgets:${NEW_BRANCH}`)).toEqual({
      requests: [],
      change: { remove: { [FIELD.branches]: [`branch:acme/widgets:${NEW_BRANCH}`] } },
    });
  });

  it("the refresh re-reads what changed since a quarter of an hour before its last run, for every task holding it", async () => {
    const refresh = (since: string | null, answer = recorded("graphql/recently-updated"), connections: typeof CONNECTIONS = CONNECTIONS) =>
      runSchedule(plugin, "refresh", { since, connections, now: NOW, settings: PREFIX, responses: [{ body: answer }] });
    const run = await refresh("2026-10-01T11:00:00Z");
    expect(variables(run).query).toBe("type:pr org:acme updated:>=2026-10-01T10:45:00+00:00 sort:updated-desc");
    const held = (repository: string, number: number, title: string, state: Record<string, string>) => {
      const ref = `pr:${repository.toLowerCase()}#${number}`;
      return {
        target: { holding: { key: FIELD.pullRequests, value: ref } },
        upsert: { [FIELD.pullRequests]: [{ ref, url: `https://github.com/${repository}/pull/${number}`, text: `#${number} ${title}`, state }] },
      };
    };
    expect(run).toMatchObject({
      writes: [
        held("acme/widgets", 9, "Fix the build", { status: "merged", review: "approved", checks: "passing" }),
        held("acme/Gadgets", 12, "Try the cache", { status: "draft", review: "unreviewed", checks: "none" }),
        held("acme/widgets", 13, "Drop the unused index", { status: "open", review: "changes_requested", checks: "failing" }),
        held("acme/widgets", 14, "Bump the parser", { status: "closed", review: "review_required", checks: "pending" }),
      ],
    });
    // The first run reads a day back; checks GitHub withholds stay as each link had them.
    const first = await refresh(null, unchecked("graphql/recently-updated", (data) => data.search.nodes));
    expect(variables(first).query).toBe("type:pr org:acme updated:>=2026-09-30T12:00:00+00:00 sort:updated-desc");
    expect(states("writes" in first ? first.writes : [])).toEqual([
      { status: "merged", review: "approved" },
      { status: "draft", review: "unreviewed" },
      { status: "open", review: "changes_requested" },
      { status: "closed", review: "review_required" },
    ]);
    // An installation on a personal account is searched as a user's.
    const personal = { ...CONNECTIONS, workspace: { owner: "alice", installation_id: 43, owner_type: "User" } };
    const theirs = await refresh(null, recorded("graphql/recently-updated"), personal);
    expect(variables(theirs).query).toBe("type:pr user:alice updated:>=2026-09-30T12:00:00+00:00 sort:updated-desc");
  });
});
