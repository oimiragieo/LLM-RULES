# agent-updater Rules

1. Only update existing agents; route missing targets to `agent-creator`.
2. Compute and report risk level before edits.
3. Use research-synthesis before recommending behavioral prompt changes.
4. Produce an exact patch plan (prompt files, workflow files, hook enforcement points, validation commands).
5. Validate integration and regenerate agent registry after changes.
