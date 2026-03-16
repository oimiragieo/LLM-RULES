# Token Usage Summary

Show today's token usage and cost by running the ccusage-adapter.

## Instructions

1. Use Bash to run the ccusage adapter and display token usage:

```bash
node -e "const w=s=>process.stdout.write(s+'\n');const{getTodayTotals}=require('./.claude/lib/utils/ccusage-adapter.cjs');const d=getTodayTotals();if(!d){w('ccusage unavailable. Install: npm i -g ccusage');process.exit(0)}const{inputTokens:i,outputTokens:o,cacheCreationTokens:cc,cacheReadTokens:cr,totalCost:c}=d;const t=i+o+cc+cr;w('');w('Token Usage - Today');w('-----------------------------------');w('  Input:   '+i.toLocaleString());w('  Output:  '+o.toLocaleString());w('  Cache:   '+(cc+cr).toLocaleString());w('-----------------------------------');w('  Total:   '+t.toLocaleString());w('  Cost:    $'+c.toFixed(4));w('')"
```

2. Display the output to the user. If ccusage is unavailable, tell the user to install it globally: `npm install -g ccusage`
