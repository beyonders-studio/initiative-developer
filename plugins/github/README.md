# GitHub for Initiative

Brings a GitHub organization's issues, pull requests and Dependabot alerts into
an [Initiative](https://github.com/beyonders-studio/initiative) community, as dashboard
tiles and as steps an automation can call, and links tasks to the branches and
pull requests that name them.

It runs inside Initiative: the plug-in is a manifest that says which GitHub calls
each endpoint makes and how to read the answers, and Initiative makes them.
There is no service to run beside it.

## What it offers

| | |
|---|---|
| **Nineteen reads** | Repositories · who can be assigned · branches · labels · milestones · one issue · find issues · one pull request · find pull requests · pull requests waiting on your review · your review requests · your pull requests · Dependabot alerts · project boards · a board's fields · a field's values · an issue's card · pull requests changed since a time · open pull requests that name a task |
| **Eight writes** | Open an issue · comment · close · reopen · change labels · request a review · move a Projects card · start a branch |
| **Six announcements** | An issue was opened · an issue was closed · a review was requested · a release was published · a pre-release was published · a tag was pushed |
| **Seven widgets** | Open issues · pull requests waiting on your review · your review requests · your pull requests · linked pull requests · Dependabot alerts by severity · a fortnight of opened against closed |
| **A dashboard** | *GitHub overview*, arranging four of the widgets. Point each tile at a repository where you place it. |
| **Task links** | A task's pull requests, with each one's status, review and checks, and its branches; a *GitHub* section for tasks with **Start a branch**, **Link a pull request** and **Unlink**. See [Linking tasks](#linking-tasks). |

Every endpoint, widget and connection, and everything it adds to tasks, is
named in English, German, Spanish and French.

**Two credentials, two jobs.**

- **Reads run on the organization's installation**, so a tile answers the same
  for everyone in the community, whether or not they have connected anything.
  They reach exactly the repositories the organization ticked on GitHub's
  install page, and only to read: Initiative asks GitHub for each of the
  installation's tokens with read access alone. The re-read that keeps tasks'
  links current runs there too.
- **Writes run on the member's own GitHub account**, so an issue opened by an
  automation is opened by the person whose automation it is, and a branch
  started from a task by the person who pressed the button. A write never
  falls back to the plug-in: a member who has not connected is told to.
  *Waiting on your review* (`review-queue`), *Your review requests*
  (`my-review-requests`) and *Your pull requests* (`my-pull-requests`) also
  run on your own account, because they are about you. The last two name no
  organization, so you see your own in any community with the plug-in,
  whether or not it has connected one.

**Initiative runs everything.** Initiative sends people to GitHub, takes them
back, keeps the organization's installation in the plug-in's configuration and
each member's GitHub authorization in their own connection, renews member
tokens, and mints the organization's installation tokens from the GitHub App's
key. It makes each endpoint's calls to `api.github.com` with the right token,
turns GitHub's webhook deliveries into the six announcements and the links
tasks hold, and checks every 15 minutes that GitHub still has each
organization's installation.

**Other plug-ins use it through Initiative.** Every read and write but Start a
branch is public: a plug-in the community has let use GitHub
(`plugins:beyonders-studio.github`) calls it through Initiative, as the community
or as one of its members. A read takes either and answers on the organization's
installation, except the three about a member, the review queue and their own
review requests and pull requests, which take a member and ask GitHub as them.
A write takes only a member and runs on that member's own GitHub account,
so an automation's "comment on the issue" is theirs. Writes are reachable only
this way. Start a branch names the branch after the task it is run on, so it is
run from that task alone.

**Removing it.** When a member disconnects, leaves or is blocked, or the plug-in is
removed, Initiative ends the member's GitHub authorization at GitHub (the
grant, so its refresh token goes too). Turning the plug-in off, or a community
being put on hold, only pauses it: everything is kept, and nobody has to
authorize again when it is turned back on.

## Installing it

### 1. Set it up for the deployment

Once per deployment, in Initiative under **Settings → Platform → Integrations →
Plug-in services**, on the GitHub plug-in's registration, press **Create the GitHub
App**. GitHub shows the GitHub App it is about to create, with the permissions and
events in the table below and Initiative's addresses already set. Confirm it
there, and GitHub sends you back to Initiative with the GitHub App's six values
entered for you.

#### By hand

An Initiative that shows no **Create the GitHub App** takes the same step by
hand. Register the GitHub App on GitHub under *Settings → Developer settings →
GitHub Apps → New GitHub App*. `{APP_URL}` stands for Initiative's own public
address:

| Setting | Value |
|---|---|
| Callback URL | `{APP_URL}/api/v1/plugin-connections/callback` |
| Expire user authorization tokens | on |
| Request user authorization (OAuth) during installation | off |
| Setup URL | `{APP_URL}/api/v1/plugin-connections/setup` |
| Webhook URL | `{APP_URL}/api/v1/plugin-hooks/beyonders-studio.github` |
| Webhook secret | a long random value |
| Repository permissions | Issues: read and write · Pull requests: read and write · Contents: read and write · Checks: read · Commit statuses: read · Dependabot alerts: read · Metadata: read |
| Organization permissions | Projects: read and write |
| Events | Issues · Pull request · Release · Create · Delete · Pull request review · Check suite |

Then generate a private key and a client secret on the GitHub App's page, and enter
the GitHub App's client ID, client secret, slug (the name in its address,
`github.com/apps/<slug>`), app ID, private key and webhook secret on the
GitHub plug-in's registration in Initiative. The plug-in is not live until all
six are set.

### 2. In a community

1. A community superadmin installs **GitHub** from the marketplace and
   confirms what it may reach.
2. In the plug-in's settings, they press **Connect** on *GitHub organization*.

### 3. On GitHub

3. GitHub's install page opens. Choose the account and the repositories the
   plug-in may see. Only an owner of that account can finish; anyone else sends a
   request for an owner to approve, and Initiative says it is waiting.
4. GitHub asks you to authorize once, and Initiative checks that you control
   the account the installation is on: an admin of the organization, or the
   user it is installed for. You are sent back to Initiative, connected.
5. Each member who wants their review queue, their own review requests and pull
   requests, who starts branches from tasks, or whose automations write to
   GitHub, connects *Your GitHub account* in the plug-in's settings.

Adding or removing repositories later is done at GitHub, on the GitHub App's
*Configure* page, and needs nothing here.

A community that connects no organization of its own still installs the
plug-in for step 5: its members see their own review requests and pull
requests, wherever the GitHub App is installed on an account they can see.

## Linking tasks

Installing the plug-in gives the community a **task reference prefix**, made
from the community's name, such as `acme`. No other community on the server
holds it, and an admin may rename it in the plug-in's settings; references made
with an earlier prefix keep linking. A task's reference is the prefix and the
task's number: `acme-42`.

- **A branch** whose name holds a task's reference links to the task when it
  is pushed: `acme-42-fix-sign-in`, or `feature/ACME-42`. **Start a branch**,
  on the task, asks for a repository and a base branch and creates the branch
  in GitHub as the member, named after the task (`acme-42-fix-sign-in`).
- **A pull request** links when its branch, title or description holds the
  reference: when it opens, and on each push, merge or reopen after, so work
  begun before the plug-in links on its next change. An edit links what it
  adds. Renaming a pull request keeps its links. **Link a pull request** adds
  one by repository and number.
- **Unlink** takes a link off the task. While GitHub still names the task, a
  pull request links again on its next push, merge or reopen: remove the
  reference in GitHub to unlink it for good.
- **Where each stands.** A pull request shows its status (draft, open, merged
  or closed), its review (approved, changes requested, review required, or no
  review) and its checks (passing, failing, pending, or none). A branch deleted
  in GitHub shows as deleted. GitHub's deliveries move these at once; every 15
  minutes the plug-in also re-reads the organization's pull requests changed
  since its last look, as the installation, and gives each its review and
  checks as GitHub sums them up, so checks settle within about 15 minutes and
  a delivery lost on the way is made good.
- An automation can move a task when its linked pull request merges.
- **Linked pull requests**, a dashboard tile, lists the organization's open
  pull requests that name a task, with each task they name, read from GitHub
  as the installation when it is drawn. It looks at the fifty most recently
  updated that mention the prefix and the fifty from branches named with it,
  so a pull request that names a task only by an earlier prefix may be missing
  there, though it stays linked on the task.

A reference is a word of its own, in any case: `acme-42` is in
`feature/ACME-42-fix` and in `[acme-42]`, not in `xacme-42`, and `acme-420` is
task 420.

The links show where a project's managers place the plug-in's *GitHub* section
or its two fields, *Pull requests* and *Branches*, on its tasks. The section
says the task's reference, lists both, and holds Start a branch and Link a pull
request; its "?" opens the plug-in's help. Link a pull request reads GitHub as
the organization's installation; Start a branch needs the member's own GitHub
account.

A prefix is unique on one server. If another Initiative server registers its own
GitHub App on the same organization, each links references by its own prefixes.

## Upgrading to task linking

1. In the GitHub App's settings on GitHub, under *Permissions & events*, set
   Contents to *Read and write*, and Checks and Commit statuses to
   *Read-only*, and subscribe to the *Delete*, *Pull request review* and
   *Check suite* events. A GitHub App made with **Create the GitHub App** needs
   this too: it keeps the permissions it was created with.
2. Each organization owner accepts the new permissions in GitHub, which asks
   them when the GitHub App changes. Until they do, GitHub mints Initiative no
   token for the installation, since each asks to read checks and commit
   statuses: whatever reads as the organization is refused (its tiles, Link a
   pull request, the 15-minute re-read, and Change labels, which reads an
   issue's labels first), so is Start a branch, and GitHub sends no check
   suites. Its other deliveries still link work to tasks.
3. In each community, a superadmin accepts the update from the plug-in's
   **Update** button: it asks to read projects, where it keeps its links on
   tasks.
4. A community whose GitHub installation is on a personal account rather than
   an organization connects it once more, with **Connect** on *GitHub
   organization*, so the plug-in searches its pull requests as a user's.

## Upgrading from 2.x

The plug-in now runs inside Initiative, so this needs Initiative 0.75.0 or later.

1. Take this version's manifest. Initiative starts making the plug-in's calls
   itself, and the community connections, members' accounts and the GitHub App
   carry on as they were.
2. Stop and remove the old `github` service and its `github_data` volume from
   the `docker-compose.yml` that runs Initiative. The registration's base
   address and key are no longer used.
3. Dashboards and automations that asked `find-pull-requests` for
   `review_requested: "@me"` move to `review-queue`, which takes the same
   parameters without it. `find-pull-requests` still takes a reviewer's login.

From 2.1 or older, also set the GitHub App up as the table under *By hand*
says: its webhook, callback and setup addresses point at Initiative, and it has
the Contents permission and the Release and Create events.

## Working on it

The plug-in is built on [initiative-plugin-sdk](https://github.com/beyonders-studio/initiative-plugin-sdk):
`src/plugin.ts` declares everything it does. Each endpoint is a request to GitHub
and a [JSONata](https://jsonata.org) mapping of the answer; the tests run them
against GitHub's recorded answers in `test/fixtures/`.

```sh
npm install
npm run typecheck
npm test
npm run manifest         # rebuild manifest.json from src/plugin.ts, widgets bundled
npm run manifest:check   # CI: fail if manifest.json is stale
npm run listing          # at a release: manifest.json and the registry source
```

`npm run listing` writes the plug-in's registry source under
`registry/sources/beyonders-studio/<uid>/`: the listing, this version's manifest and
`assets/avatar.png`. It writes it only while the listing in `src/plugin.ts` names
the version in `package.json`, so run it once the release has bumped both.

MIT licensed.
