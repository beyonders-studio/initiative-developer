/**
 * GitHub's deliveries, as Initiative maps them once it has checked and routed
 * one to a community: the six announcements, the links tasks hold, and the
 * organization's installation being removed, suspended or restored.
 */

import { runWebhook } from "initiative-plugin-sdk/testing";
import { describe, expect, it } from "vitest";

import plugin from "../src/plugin.js";
import { EMIT, FIELD } from "../src/vocabulary.js";
import { recorded } from "./fixtures.js";

/** What a delivery reads of the install. */
type Install = { settings?: Record<string, string>; aliases?: Record<string, string[]> };

/** The install's prefix, `acme`, and the one it had before, `old`. */
const PREFIXES: Install = { settings: { task_prefix: "acme" }, aliases: { task_prefix: ["old"] } };

function deliver(event: string, payload: unknown, install = PREFIXES) {
  return runWebhook(plugin, {
    headers: { "X-GitHub-Event": event, "X-GitHub-Delivery": "delivery-1" },
    payload,
    connection: { owner: "acme", installation_id: 42 },
    ...install,
  });
}

/** A recorded delivery with some of its fields changed. */
const changed = (name: string, change: (payload: any) => void) => {
  const payload = recorded(name);
  change(payload);
  return payload;
};

describe("announcements", () => {
  it("announces an opened issue", async () => {
    expect(await deliver("issues", recorded("deliveries/issues"))).toEqual({
      event: {
        emit: EMIT.issueOpened,
        payload: {
          repository: "widgets",
          owner: "acme",
          number: 7,
          title: "Broken build",
          url: "https://github.com/acme/widgets/issues/7",
          author: "bob",
          labels: ["bug"],
        },
      },
    });
  });

  it("announces a closed issue", async () => {
    const closed = changed("deliveries/issues", (payload) => {
      payload.action = "closed";
      payload.issue.labels = [];
    });
    expect(await deliver("issues", closed)).toMatchObject({
      event: { emit: EMIT.issueClosed, payload: { repository: "widgets", number: 7, labels: [] } },
    });
  });

  it("announces a review request, naming the reviewer or the team", async () => {
    expect((await deliver("pull_request", recorded("deliveries/pull_request"))).event).toEqual({
      emit: EMIT.reviewRequested,
      payload: {
        repository: "widgets",
        owner: "acme",
        number: 9,
        title: "Fix",
        url: "https://github.com/acme/widgets/pull/9",
        author: "carol",
        reviewer: "dave",
      },
    });
    const team = changed("deliveries/pull_request", (payload) => {
      delete payload.requested_reviewer;
      payload.requested_team = { slug: "core" };
    });
    expect(await deliver("pull_request", team)).toMatchObject({ event: { payload: { reviewer: "core" } } });
  });

  it("announces a full release", async () => {
    expect(await deliver("release", recorded("deliveries/release"))).toEqual({
      event: {
        emit: EMIT.releasePublished,
        payload: {
          repository: "widgets",
          owner: "acme",
          tag: "v1.2.0",
          name: "Spring",
          branch: "main",
          url: "https://github.com/acme/widgets/releases/tag/v1.2.0",
          author: "erin",
        },
      },
    });
  });

  it("announces a pre-release as one, and its untitled name as null", async () => {
    const prerelease = changed("deliveries/release", (payload) => {
      payload.action = "prereleased";
      payload.release.name = null;
      payload.release.prerelease = true;
    });
    expect(await deliver("release", prerelease)).toMatchObject({
      event: { emit: EMIT.prereleasePublished, payload: { tag: "v1.2.0", name: null } },
    });
  });

  it("announces a tag, with its page and who pushed it", async () => {
    expect(await deliver("create", recorded("deliveries/create"))).toEqual({
      event: {
        emit: EMIT.tagCreated,
        payload: {
          repository: "widgets",
          owner: "acme",
          tag: "release/1.0",
          url: "https://github.com/acme/widgets/tree/release/1.0",
          author: "frank",
        },
      },
    });
    const spaced = changed("deliveries/create", (payload) => {
      payload.ref = "v1 beta";
    });
    expect(await deliver("create", spaced)).toMatchObject({
      event: { payload: { url: "https://github.com/acme/widgets/tree/v1%20beta" } },
    });
  });

  it("says nothing of a delivery whose subject GitHub did not name, and changes nothing", async () => {
    const quiet = [
      ["issues", changed("deliveries/issues", (payload) => (payload.issue.pull_request = { url: "x" }))],
      ["issues", changed("deliveries/issues", (payload) => delete payload.issue.number)],
      ["issues", changed("deliveries/issues", (payload) => (payload.repository.name = ""))],
      ["pull_request", changed("deliveries/pull_request", (payload) => delete payload.repository)],
      ["release", changed("deliveries/release", (payload) => (payload.release.tag_name = ""))],
      ["create", changed("deliveries/create", (payload) => delete payload.ref)],
    ] as const;
    for (const [event, payload] of quiet) {
      const run = await deliver(event, payload);
      expect(run.event, event).toBeUndefined();
      expect(run.writes ?? [], event).toEqual([]);
    }
  });

  it("says nothing of other actions and events", async () => {
    for (const action of ["edited", "labeled", "reopened"]) {
      expect(await deliver("issues", changed("deliveries/issues", (payload) => (payload.action = action)))).toEqual({});
    }
    for (const action of ["published", "created", "edited", "deleted"]) {
      expect(await deliver("release", changed("deliveries/release", (payload) => (payload.action = action)))).toEqual({});
    }
    expect(await deliver("push", { ref: "refs/heads/main", installation: { id: 42 }, repository: recorded("deliveries/issues").repository })).toEqual({});
  });
});

describe("links", () => {
  const BRANCH = "feature/ACME-42-fix";
  const PULL = "pr:acme/widgets#9";

  /** A branch being pushed or deleted. */
  const branch = (event: "create" | "delete", ref: string, install = PREFIXES) =>
    deliver(event, changed("deliveries/create", (payload) => Object.assign(payload, { ref, ref_type: "branch" })), install);

  /** The tasks a delivery's changes name by id. */
  const named = (run: Awaited<ReturnType<typeof deliver>>) =>
    (run.writes ?? []).flatMap(({ target }) => ("id" in target ? [target.id] : []));

  /** A pull request delivery, `action`, whose pull request has `change` made to it. */
  const pull = (action: string, change: Record<string, unknown> = {}, more: Record<string, unknown> = {}) =>
    deliver(
      "pull_request",
      changed("deliveries/pull_request", (payload) => {
        Object.assign(payload, { action }, more);
        Object.assign(payload.pull_request, { head: { ref: BRANCH }, title: "[acme-43] Fix the build", body: "Also old-7 and acme-420, not xacme-44." }, change);
      })
    );

  /** The pull request's link, as every change a delivery about it makes gives it. */
  const link = (status: string, text = "#9 [acme-43] Fix the build") => ({
    [FIELD.pullRequests]: [{ ref: PULL, url: "https://github.com/acme/widgets/pull/9", text, state: { status } }],
  });

  /** The changes a delivery makes to every task holding the pull request's link. */
  const held = (upsert: Record<string, unknown>) => ({ target: { holding: { key: FIELD.pullRequests, value: PULL } }, upsert });

  it("links a pushed branch to each task its name names, as a word of its own in any case", async () => {
    expect(await branch("create", BRANCH)).toEqual({
      writes: [
        {
          target: { kind: "task", id: 42 },
          upsert: {
            [FIELD.branches]: [
              {
                ref: `branch:acme/widgets:${BRANCH}`,
                url: `https://github.com/acme/widgets/tree/${BRANCH}`,
                text: BRANCH,
                state: { status: "present" },
              },
            ],
          },
        },
      ],
    });
    const names = {
      "acme-42-fix-sign-in": [42],
      "fix-acme-7": [7],
      "old-3_then_ACME-4": [3, 4],
      "acme-420": [420],
      "acme-5-acme-5": [5],
      "xacme-42": [],
      "acme-42a": [],
      "acme--42": [],
      "acme-042": [],
      main: [],
    };
    for (const [name, tasks] of Object.entries(names)) expect(named(await branch("create", name)), name).toEqual(tasks);
    // An install with no prefix has no references.
    expect(await branch("create", BRANCH, {})).toEqual({ writes: [] });
  });

  it("shows a deleted branch as deleted wherever it is linked", async () => {
    expect(await branch("delete", BRANCH)).toEqual({
      writes: [
        {
          target: { holding: { key: FIELD.branches, value: `branch:acme/widgets:${BRANCH}` } },
          upsert: { [FIELD.branches]: [{ ref: `branch:acme/widgets:${BRANCH}`, state: { status: "deleted" } }] },
        },
      ],
    });
    const tag = changed("deliveries/create", (payload) => Object.assign(payload, { ref: "v1" }));
    expect(await deliver("delete", tag)).toEqual({});
  });

  it("links an opened pull request to the tasks its branch, title and description name, and refreshes every task holding it", async () => {
    expect((await pull("opened")).writes).toEqual([
      ...[42, 43, 7, 420].map((id) => ({ target: { kind: "task", id }, upsert: link("open") })),
      held(link("open")),
    ]);
  });

  it("says where a pull request stands as it moves", async () => {
    const status = async (action: string, change: Record<string, unknown>) => (await pull(action, change)).writes!.at(-1)!.upsert;
    expect(await status("closed", { state: "closed", merged: true })).toEqual(link("merged"));
    expect(await status("closed", { state: "closed" })).toEqual(link("closed"));
    expect(await status("synchronize", { draft: true })).toEqual(link("draft"));
    expect(await status("reopened", {})).toEqual(link("open"));
    expect(named(await pull("ready_for_review", {}))).toEqual([42, 43, 7, 420]);
  });

  it("links only the tasks an edit names anew", async () => {
    const edited = (changes: Record<string, unknown>) => pull("edited", { title: "Fix acme-43 and acme-50", body: "Also old-7 and acme-51." }, { changes });
    const run = await edited({ title: { from: "Fix acme-43" }, body: { from: "Also old-7." } });
    expect(run.writes).toEqual([
      ...[50, 51].map((id) => ({ target: { kind: "task", id }, upsert: link("open", "#9 Fix acme-43 and acme-50") })),
      held(link("open", "#9 Fix acme-43 and acme-50")),
    ]);
    // An edit to the title alone links what the title adds.
    expect(named(await edited({ title: { from: "Fix it" } }))).toEqual([43, 50]);
  });

  it("refreshes every task holding a pull request on any other change, a review request among them", async () => {
    expect(await pull("labeled")).toEqual({ writes: [held(link("open"))] });
    const requested = await deliver("pull_request", recorded("deliveries/pull_request"));
    expect(requested).toMatchObject({ event: { emit: EMIT.reviewRequested }, writes: [held(link("open", "#9 Fix"))] });
  });

  it("moves a linked pull request's review as its reviews decide it", async () => {
    const review = async (action: string, state: string) =>
      (await deliver("pull_request_review", changed("deliveries/pull_request_review", (payload) => Object.assign(payload, { action, review: { state } })))).writes;
    const said = (decision: string) => [held({ [FIELD.pullRequests]: [{ ref: PULL, state: { review: decision } }] })];
    expect(await review("submitted", "approved")).toEqual(said("approved"));
    expect(await review("submitted", "CHANGES_REQUESTED")).toEqual(said("changes_requested"));
    expect(await review("submitted", "commented")).toEqual([]);
    expect(await review("dismissed", "dismissed")).toEqual(said("review_required"));
    expect(await review("edited", "approved")).toBeUndefined();
  });

  it("fails a linked pull request's checks when a suite fails, and leaves the rest to the schedule", async () => {
    const suite = async (action: string, conclusion: string | null) =>
      (await deliver("check_suite", changed("deliveries/check_suite", (payload) => Object.assign(payload, { action }, { check_suite: { ...payload.check_suite, conclusion } })))).writes;
    const checks = (value: string) =>
      [9, 11].map((number) => ({
        target: { holding: { key: FIELD.pullRequests, value: `pr:acme/widgets#${number}` } },
        upsert: { [FIELD.pullRequests]: [{ ref: `pr:acme/widgets#${number}`, state: { checks: value } }] },
      }));
    expect(await suite("completed", "failure")).toEqual(checks("failing"));
    expect(await suite("completed", "timed_out")).toEqual(checks("failing"));
    expect(await suite("completed", "success")).toEqual([]);
    expect(await suite("requested", null)).toBeUndefined();
  });

  it("makes at most a hundred changes for one delivery, the tasks first named first", async () => {
    const body = Array.from({ length: 150 }, (_, index) => `acme-${index + 1}`).join(" ");
    const run = await pull("opened", { head: { ref: "fix" }, title: "Fix", body });
    expect(run.writes).toHaveLength(100);
    expect(named(run)).toEqual(Array.from({ length: 99 }, (_, index) => index + 1));
    expect(run.writes!.at(-1)!.target).toEqual({ holding: { key: FIELD.pullRequests, value: PULL } });
  });
});

describe("the organization's installation", () => {
  const status = (action: string) => deliver("installation", changed("deliveries/installation", (payload) => (payload.action = action)));

  it("is removed, suspended and restored as GitHub says", async () => {
    expect(await status("deleted")).toEqual({ status: { connection: "workspace", state: "removed" } });
    expect(await status("suspend")).toEqual({ status: { connection: "workspace", state: "suspended" } });
    expect(await status("unsuspend")).toEqual({ status: { connection: "workspace", state: "ok" } });
  });

  it("is not changed by anything else", async () => {
    expect(await status("new_permissions_accepted")).toEqual({});
    expect(await deliver("installation_repositories", { action: "added", installation: { id: 42 } })).toEqual({});
  });
});
