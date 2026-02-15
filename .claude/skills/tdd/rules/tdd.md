# tdd Rules

1. Follow Canon sequence:
   - scenario backlog
   - one runnable test
   - prove RED
   - minimal GREEN
   - optional refactor
2. No production code without a failing test first.
3. Keep one behavior per cycle and one patch objective per cycle.
4. Record RED and GREEN evidence in outputs.
5. Use bounded repair loops (max 3 retries per scenario before redesign).
6. Block completion when anti-test-hacking checks fail.
