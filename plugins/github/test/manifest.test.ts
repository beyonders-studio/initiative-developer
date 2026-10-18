/**
 * The manifest `initiative-plugin build` wrote from the plug-in's definition, and the
 * registry listing.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateManifest, type Manifest, type PartNode } from "initiative-plugin-sdk/manifest";
import { describe, expect, it } from "vitest";

import { ACCOUNT, declare, LISTING_UID, READ, READ_IDS, WORKSPACE, WRITE } from "../src/vocabulary.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "..", "..", "registry", "sources", "beyonders-studio", LISTING_UID);
const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf-8")) as T;
const packageVersion = read<{ version: string }>(join(root, "package.json")).version;
const manifest = read<Manifest>(join(root, "manifest.json"));
/**
 * The last version that ran as a service beside Initiative, as published: its
 * ids start `app.` and its kind is `app_kind`, where this version says `plugin.`
 * and `plugin_kind`.
 */
const service = read<Manifest>(join(source, "2.6.0", "manifest.json"));

/** A value with every endpoint id reduced to its bare name, so 2.6.0's and this version's compare. */
function unprefixed<T>(value: T): T {
  if (typeof value === "string") return value.replace(/^(app|plugin)\.beyonders-studio\.github\./, "") as T;
  if (Array.isArray(value)) return value.map(unprefixed) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, unprefixed(inner)])) as T;
  }
  return value;
}

/** Whether one dotted version is later than another. */
function later(a: string, b: string): boolean {
  const [x, y] = [a, b].map((version) => version.split(".").map(Number));
  for (let index = 0; index < 3; index += 1) {
    if (x[index] !== y[index]) return x[index] > y[index];
  }
  return false;
}

const connection = (id: string) => manifest.connections!.find((one) => one.id === id)!;

/** The words a part's tree draws: its sections' titles and its texts. */
const words = (node: PartNode): unknown[] => [
  ...(node.type === "section" && node.props?.title ? [node.props.title] : []),
  ...(node.type === "text" ? [node.props.text] : []),
  ...("children" in node ? (node.children ?? []).flatMap(words) : []),
];

describe("manifest", () => {
  it("passes the SDK's validation", () => {
    expect(validateManifest(manifest)).toEqual([]);
  });

  it("declares nineteen reads, eight writes and six announcements", () => {
    const counts: Record<string, number> = {};
    for (const endpoint of manifest.endpoints ?? []) counts[endpoint.direction] = (counts[endpoint.direction] ?? 0) + 1;
    expect(counts).toEqual({ read: 19, write: 8, emit: 6 });
  });

  it("is declarative: Initiative calls GitHub itself, runs no service, and keeps links on the tasks it may read", () => {
    expect(manifest.hosts).toEqual(["api.github.com"]);
    expect(manifest.scopes).toEqual(["projects:read"]);
    expect(Object.keys(manifest).sort()).toEqual(
      [
        ...Object.keys(service)
          .filter((key) => key !== "service")
          .map((key) => (key === "app_kind" ? "plugin_kind" : key)),
        "hosts",
        "min_plugin_api",
        "scopes",
        "fields",
        "parts",
        "actions",
        "settings",
        "help",
      ].sort()
    );
  });

  it("needs plug-in API contract 6.0, the SDK it is built against", () => {
    expect(manifest.min_plugin_api).toBe("6.0");
  });

  it("keeps every endpoint 2.6.0 had, a pull request's adding its review and checks, and adds the review queue", () => {
    const terms = ({ id, direction, params, returns, public: open, actors, identity }: NonNullable<Manifest["endpoints"]>[number]) =>
      ({ id, direction, params, returns, public: open, actors, identity });
    const before = unprefixed(service.endpoints!.map(terms));
    const after = unprefixed(manifest.endpoints!.map(terms));
    const added = [
      READ.reviewQueue,
      READ.recentlyUpdated,
      READ.linkedWork,
      READ.myReviewRequests,
      READ.myPullRequests,
      WRITE.startBranch,
    ] as string[];
    const said = (value: { key: string }) => ["review", "checks"].includes(value.key);
    const kept = after
      .filter((endpoint) => !added.includes(endpoint.id))
      .map((endpoint) => (endpoint.id === READ.getPullRequest ? { ...endpoint, returns: endpoint.returns!.filter((value) => !said(value)) } : endpoint));
    expect(kept).toEqual(before);
    const pull = after.find((endpoint) => endpoint.id === READ.getPullRequest)!;
    expect(pull.returns!.filter(said).map(({ key, type }) => [key, type])).toEqual([
      ["review", "string"],
      ["checks", "string"],
    ]);
    expect(after.find((endpoint) => endpoint.id === READ.reviewQueue)).toEqual({
      ...before.find((endpoint) => endpoint.id === READ.findPullRequests),
      id: READ.reviewQueue,
      params: before
        .find((endpoint) => endpoint.id === READ.findPullRequests)!
        .params!.filter((param) => param.key !== "review_requested"),
      actors: ["member"],
    });
  });

  it("names every endpoint, widget, connection, field, part, action and setting in four languages", () => {
    // What a task's GitHub section draws, which Initiative cuts at 120 characters.
    const linking = [
      ...(manifest.fields ?? []).flatMap((field) => [
        field.name,
        field.description,
        ...Object.values(field.states ?? {}).flatMap((facet) => [facet.name, ...Object.values(facet.values).map((value) => value.label)]),
      ]),
      ...(manifest.parts ?? []).flatMap((part) => [part.name, part.description, ...words(part.tree)]),
      ...(manifest.actions ?? []).map((action) => action.name),
      ...(manifest.settings ?? []).flatMap((setting) => [setting.label, setting.description]),
    ];
    const texts = [
      ...(manifest.endpoints ?? []).flatMap((endpoint) => [endpoint.label, endpoint.description]),
      ...(manifest.widgets ?? []).flatMap((widget) => [
        (widget.meta as Record<string, unknown>).name,
        (widget.meta as Record<string, unknown>).description,
      ]),
      ...(manifest.connections ?? []).map((connection) => connection.label),
      manifest.vendor!.label,
      ...manifest.vendor!.fields.map((field) => field.label),
      ...linking,
      manifest.help,
    ];
    for (const localized of texts) expect(Object.keys(localized as object).sort()).toEqual(["de", "en", "es", "fr"]);
    for (const text of linking.flatMap((localized) => Object.values(localized as Record<string, string>))) {
      expect(text.length, text).toBeLessThanOrEqual(120);
    }
  });

  it("makes every write run as the member, never as the plug-in", () => {
    for (const endpoint of (manifest.endpoints ?? []).filter((one) => one.direction === "write")) {
      expect(endpoint.actors).toEqual(["member"]);
      expect(endpoint.requires).toEqual({ all_of: ["workspace", "account"] });
    }
  });

  it("offers every read and write to other plug-ins but the task's own Start a branch, and no announcement", () => {
    const members = [READ_IDS.reviewQueue, READ_IDS.myReviewRequests, READ_IDS.myPullRequests];
    for (const endpoint of manifest.endpoints ?? []) {
      // Start a branch names the branch after the task its action runs on.
      if (endpoint.direction === "emit" || endpoint.id === declare(WRITE.startBranch)) {
        expect(endpoint.public).toBeUndefined();
        continue;
      }
      expect(endpoint.public).toBe(true);
      expect(endpoint.admin_only).toBeUndefined();
      if (endpoint.direction === "read" && !members.includes(endpoint.id)) {
        expect(endpoint.actors).toEqual(["installation", "member"]);
        expect(endpoint.requires).toEqual({ all_of: ["workspace"] });
      }
    }
  });

  it("reads a member's own review requests and pull requests with their account alone, in any community", () => {
    for (const name of [READ.myReviewRequests, READ.myPullRequests]) {
      const endpoint = manifest.endpoints!.find((one) => one.id === declare(name))!;
      expect(endpoint).toMatchObject({ actors: ["member"], requires: { all_of: [ACCOUNT] }, request: { connection: ACCOUNT } });
      // Its widget is offered to whoever has connected their account, organization or not.
      expect(manifest.widgets!.find((widget) => widget.id === name)).toMatchObject({
        endpoints: [endpoint.id],
        requires: { all_of: [ACCOUNT] },
      });
    }
  });

  it("only reads as the organization's installation, which its tokens are asked for", () => {
    const requests = (manifest.endpoints ?? []).flatMap((endpoint) => endpoint.steps?.map((step) => step.request) ?? [endpoint.request!]);
    const installation = requests.filter((request) => request?.connection === WORKSPACE);
    expect(installation.length).toBeGreaterThan(0);
    for (const request of installation) {
      expect(request.method === "GET" || request.graphql?.query.startsWith("query "), request.url).toBe(true);
    }
  });

  it("has Initiative run both GitHub connections with the GitHub App's own values", () => {
    expect(manifest.vendor!.fields.map((field) => [field.key, field.type, field.required])).toEqual([
      ["client_id", "string", true],
      ["client_secret", "secret", true],
      ["app_slug", "string", true],
      ["app_id", "string", true],
      ["private_key", "secret", true],
      ["webhook_secret", "secret", true],
    ]);
    expect(manifest.webhooks).toEqual({
      verify: {
        scheme: "hmac_sha256",
        header: "X-Hub-Signature-256",
        prefix: "sha256=",
        encoding: "hex",
        secret: "{vendor.webhook_secret}",
      },
      dedup: "X-GitHub-Delivery",
      route: { path: "installation.id", connection: WORKSPACE, field: "installation_id" },
      events: expect.any(Array),
      status: expect.any(Array),
    });
    expect(manifest.webhooks!.events!.flatMap((event) => (event.emit ? [event.emit] : []))).toEqual(
      manifest.endpoints!.filter((endpoint) => endpoint.direction === "emit").map((endpoint) => endpoint.id)
    );

    const workspace = connection(WORKSPACE);
    expect(workspace.scope).toBe("static");
    expect(workspace.flow).toMatchObject({
      client_id: "{vendor.client_id}",
      client_secret: "{vendor.client_secret}",
      install_url: "https://github.com/apps/{vendor.app_slug}/installations/new",
      after_connect: { code: "installation-not-held" },
    });
    expect(workspace.flow!.revoke).toBeUndefined();
    // Every installation token is asked for reading alone: no call the plug-in
    // makes as the installation writes.
    expect(workspace.token).toEqual({
      type: "jwt_bearer",
      exchange_url: "https://api.github.com/app/installations/{installation_id}/access_tokens",
      exchange_body: {
        permissions: {
          issues: "read",
          pull_requests: "read",
          contents: "read",
          checks: "read",
          statuses: "read",
          vulnerability_alerts: "read",
          organization_projects: "read",
          metadata: "read",
        },
      },
      iss: "{vendor.app_id}",
      key: "{vendor.private_key}",
      alg: "RS256",
      lifetime: 540,
    });
    expect(workspace.fields.every((field) => field.managed)).toBe(true);
    expect(workspace.health).toMatchObject({ every: "15m" });

    const account = connection(ACCOUNT);
    expect(account.scope).toBe("interactive");
    // Initiative ends a member's authorization at GitHub with the GitHub App's own values.
    expect(account.flow).toMatchObject({
      after_connect: { map: expect.stringContaining("account_label") },
      revoke: "github_grant",
      revoke_url: "https://api.github.com/applications/{vendor.client_id}/grant",
    });
    expect(account.flow!.install_url).toBeUndefined();
    // The tokens Initiative keeps are never declared as fields.
    expect(account.fields).toEqual([]);
  });

  it("lets Initiative create the GitHub App the README registers, filling all six values", () => {
    expect(manifest.vendor!.setup).toEqual({
      kind: "github_app_manifest",
      app: {
        name: "Initiative",
        url: "https://github.com/beyonders-studio/initiative-developer/tree/main/plugins/github",
        public: false,
        default_permissions: {
          issues: "write",
          pull_requests: "write",
          contents: "write",
          checks: "read",
          statuses: "read",
          vulnerability_alerts: "read",
          organization_projects: "write",
          metadata: "read",
        },
        default_events: ["issues", "pull_request", "release", "create", "delete", "pull_request_review", "check_suite"],
      },
      values: {
        client_id: "client_id",
        client_secret: "client_secret",
        app_slug: "slug",
        app_id: "id",
        private_key: "pem",
        webhook_secret: "webhook_secret",
      },
    });
  });

  it("is listed in the registry, with a registration by declaration", () => {
    const listing = read<Record<string, any>>(join(source, "listing.json"));
    expect(listing).toMatchObject({ uid: LISTING_UID, public_id: "beyonders-studio.github", publisher: "beyonders-studio" });
    expect(listing.registration).toEqual({ kind: "declarative", scope_ceiling: [] });
    // Between releases the plug-in runs ahead of what the listing publishes, never behind it.
    expect(packageVersion === listing.versions[0].version || later(packageVersion, listing.versions[0].version)).toBe(true);
  });
});
