'use strict';

const DANGEROUS_PATTERN_CASES = [
  {
    name: 'ANSI-C quoting',
    match: "$'test'",
    message: "Pattern should match $'...'",
  },
  {
    name: 'Backtick command substitution',
    match: '`whoami`',
    message: 'Pattern should match `...`',
  },
  {
    name: 'Command substitution',
    match: '$(whoami)',
    message: 'Pattern should match $(...)',
  },
  {
    name: 'Here-document',
    matchMany: ['cat <<EOF', 'cat <<-EOF'],
    messageMany: ['Pattern should match <<WORD', 'Pattern should match <<-WORD'],
  },
  {
    name: 'Brace expansion with commands',
    match: '{a,b,c}',
    message: 'Pattern should match {a,b,c}',
  },
  {
    name: 'Here-string',
    matchMany: ['cat <<<EOF', 'bash<<<"input"'],
    messageMany: ['Pattern should match <<<', 'Pattern should match <<< without space'],
  },
];

const DANGEROUS_BUILTIN_CASES = [
  {
    name: 'eval builtin',
    matchMany: ['eval cmd', 'echo test; eval cmd'],
    messageMany: ['Pattern should match eval at start', 'Pattern should match eval after ;'],
  },
  {
    name: 'source builtin',
    matchMany: ['source file.sh', 'test && source file'],
    messageMany: ['Pattern should match source at start', 'Pattern should match source after &&'],
  },
  {
    name: 'dot (.) builtin',
    matchMany: ['. /etc/profile', 'test || . script.sh'],
    messageMany: ['Pattern should match dot at start', 'Pattern should match dot after ||'],
    nonMatchMany: ['./script.sh', '../script.sh'],
    nonMatchMessages: ['Should NOT match ./', 'Should NOT match ../'],
  },
];

module.exports = {
  DANGEROUS_PATTERN_CASES,
  DANGEROUS_BUILTIN_CASES,
};
