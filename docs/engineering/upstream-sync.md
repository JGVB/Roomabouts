# Upstream synchronization

Roomabouts is a GitHub fork of Radar Map Manager. Keep the fork relationship and upstream history visible.

The user has explicitly prohibited sending Roomabouts work back to the original owner. Do not open upstream pull requests, issues, discussions, or other contributions. Upstream remains a fetch-only source for reviewed synchronization; Roomabouts work stays in `JGVB/Roomabouts`.

## Remotes

```text
origin        git@github.com:JGVB/Roomabouts.git
rmm-upstream  git@github.com:Moe8383/radar_map_manager.git
```

The local `rmm-upstream` push URL is intentionally `DISABLED`, and `remote.pushDefault` is `origin`.

Verify before beginning work:

```bash
git remote -v
git status --short --branch
git fetch origin
git fetch rmm-upstream
git log --oneline --left-right --cherry-pick origin/main...rmm-upstream/main
```

## Update procedure

1. Finish or safely park all Roomabouts work; never merge upstream over unrelated uncommitted changes.
2. Create a dedicated upstream-integration branch from the current Roomabouts `main`.
3. Fetch `rmm-upstream` and inspect the commit list and diff before merging.
4. Merge the upstream branch without rewriting published Roomabouts history.
5. Resolve conflicts at the compatibility boundary. Do not silently restore credential exposure, coordinate persistence, default-open transports, or upstream visual code over Roomabouts modules.
6. Run the complete quality gate, replay suite, browser checks when present, and the Home Assistant smoke protocol.
7. Obtain independent diff review before merging the integration branch.
8. Push only with explicit user direction.

## Protected compatibility boundary

The first personal proof deliberately retains:

- `custom_components/radar_map_manager`;
- Home Assistant domain and storage key `radar_map_manager`;
- existing service and WebSocket type names;
- static resource path `/radar_map_manager/`;
- custom element `radar-map-card`;
- release archive `radar_map_manager.zip`.

Changing one of these requires a migration decision, upgrade/rollback procedure, and tests against an existing configuration.

The MIT license and upstream copyright notice must remain in every substantial copy or distribution.
