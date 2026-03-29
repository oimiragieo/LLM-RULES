# TokenAccountant Usage

`TokenAccountant` (located in `.claude/lib/metrics/token-accountant.cjs`) is currently defined and tested, but it is **not instantiated or used anywhere in the production codebase**. 

Any modifications to this class will not affect production behavior unless it is properly wired into a hook or service (e.g., as a singleton exported instance or instantiated inside `post-pipeline-token-report.cjs`).
