---
name: slack-expert
description: Expert-level Slack platform development using Bolt SDK — build Slack apps with slash commands, interactive components (buttons, modals, shortcuts), home tabs, event subscriptions, workflows, Socket Mode, and Block Kit. Use for building Slack bots, workflow automation, and rich interactive Slack experiences.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Bash, Read, Write, Edit, WebFetch]
best_practices:
  - Always use Bolt SDK (not raw HTTP) for new Slack apps
  - Prefer Socket Mode for internal tools; HTTP for public apps
  - Validate request signatures before processing payloads
  - Use lazy listeners for long-running operations
  - Store OAuth tokens in a secure database, never env-vars for multi-workspace apps
error_handling: graceful
streaming: supported
verified: false
lastVerifiedAt: 2026-03-14T00:00:00.000Z
---

# Slack Expert Skill

## Overview

Full-platform Slack development using the Bolt SDK. Covers interactive app development beyond basic messaging — slash commands, modals, shortcuts, home tabs, event subscriptions, workflow steps, and multi-workspace OAuth.

**Related skill:** `slack-notifications` — use that skill for simple one-way messaging/alerts. Use `slack-expert` when building interactive Slack apps or bots.

## Requirements

| Variable               | Purpose                                  | Required               |
| ---------------------- | ---------------------------------------- | ---------------------- |
| `SLACK_BOT_TOKEN`      | Bot OAuth token (`xoxb-...`)             | Yes (single workspace) |
| `SLACK_SIGNING_SECRET` | Request signature verification           | Yes                    |
| `SLACK_APP_TOKEN`      | Socket Mode app-level token (`xapp-...`) | Socket Mode only       |
| `SLACK_CLIENT_ID`      | OAuth client ID                          | Multi-workspace only   |
| `SLACK_CLIENT_SECRET`  | OAuth client secret                      | Multi-workspace only   |
| `SLACK_STATE_SECRET`   | OAuth state token                        | Multi-workspace only   |

## Quick Start — Bolt App (Node.js)

```javascript
const { App } = require('@slack/bolt');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  // For Socket Mode, add:
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// Slash command
app.command('/hello', async ({ command, ack, respond }) => {
  await ack();
  await respond(`Hello <@${command.user_id}>!`);
});

// Button click
app.action('approve_button', async ({ body, ack, client }) => {
  await ack();
  await client.views.open({
    trigger_id: body.trigger_id,
    view: confirmationModal,
  });
});

// Event subscription
app.event('app_mention', async ({ event, say }) => {
  await say({ text: `Hello <@${event.user}>!`, thread_ts: event.ts });
});

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('Bolt app running');
})();
```

## Core Concepts

### Listeners

```javascript
// Message listener with regex
app.message(/deploy/, async ({ message, say }) => {
  await say('Triggering deployment...');
});

// Slash command — MUST ack() within 3 seconds
app.command('/status', async ({ ack, respond, command }) => {
  await ack();
  // Long-running: defer actual work
  respond({ text: 'Checking status...', response_type: 'ephemeral' });
  const status = await fetchStatus(); // async work after ack
  await respond({ text: `Status: ${status}` });
});

// Shortcut (global or message)
app.shortcut('create_ticket', async ({ shortcut, ack, client }) => {
  await ack();
  await client.views.open({
    trigger_id: shortcut.trigger_id,
    view: ticketModal,
  });
});
```

### Modals (Views)

```javascript
const modal = {
  type: 'modal',
  callback_id: 'ticket_submission',
  title: { type: 'plain_text', text: 'Create Ticket' },
  submit: { type: 'plain_text', text: 'Submit' },
  close: { type: 'plain_text', text: 'Cancel' },
  blocks: [
    {
      type: 'input',
      block_id: 'title_block',
      element: {
        type: 'plain_text_input',
        action_id: 'title_input',
        placeholder: { type: 'plain_text', text: 'Ticket title' },
      },
      label: { type: 'plain_text', text: 'Title' },
    },
    {
      type: 'input',
      block_id: 'priority_block',
      element: {
        type: 'static_select',
        action_id: 'priority_select',
        options: [
          { text: { type: 'plain_text', text: 'High' }, value: 'high' },
          { text: { type: 'plain_text', text: 'Medium' }, value: 'medium' },
          { text: { type: 'plain_text', text: 'Low' }, value: 'low' },
        ],
      },
      label: { type: 'plain_text', text: 'Priority' },
    },
  ],
};

// Handle modal submission
app.view('ticket_submission', async ({ ack, view, client, body }) => {
  await ack();
  const title = view.state.values.title_block.title_input.value;
  const priority = view.state.values.priority_block.priority_select.selected_option.value;
  await createTicket({ title, priority, userId: body.user.id });
});
```

### Block Kit — Rich Messages

```javascript
const richMessage = {
  blocks: [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Deployment Ready' },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: '*Service:*\napi-gateway' },
        { type: 'mrkdwn', text: '*Version:*\nv1.2.3' },
        { type: 'mrkdwn', text: '*Environment:*\nProduction' },
        { type: 'mrkdwn', text: '*Requested by:*\n<@U1234567>' },
      ],
    },
    { type: 'divider' },
    {
      type: 'actions',
      block_id: 'deploy_actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve' },
          style: 'primary',
          action_id: 'approve_deploy',
          value: 'v1.2.3',
          confirm: {
            title: { type: 'plain_text', text: 'Confirm Deploy' },
            text: { type: 'mrkdwn', text: 'Deploy *v1.2.3* to production?' },
            confirm: { type: 'plain_text', text: 'Deploy' },
            deny: { type: 'plain_text', text: 'Cancel' },
          },
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Reject' },
          style: 'danger',
          action_id: 'reject_deploy',
          value: 'v1.2.3',
        },
      ],
    },
  ],
};
```

### App Home Tab

```javascript
// Publish home tab when user opens it
app.event('app_home_opened', async ({ event, client }) => {
  if (event.tab !== 'home') return;

  await client.views.publish({
    user_id: event.user,
    view: {
      type: 'home',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'My App Dashboard' },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: 'Welcome to your app home!' },
          accessory: {
            type: 'button',
            text: { type: 'plain_text', text: 'Refresh' },
            action_id: 'refresh_home',
          },
        },
      ],
    },
  });
});
```

### Lazy Listeners (Long-Running Operations)

```javascript
// Use lazy: for operations that take >3s
app.command(
  '/report',
  async ({ command, ack, respond, say }) => {
    await ack(); // Must ack in <3s
  },
  async ({ command, respond }) => {
    // lazy: runs asynchronously, can take minutes
    const report = await generateReport(command.text);
    await respond({ text: report, response_type: 'in_channel' });
  }
);
```

### Socket Mode (Internal Tools)

```javascript
// Socket Mode — no public URL required, ideal for internal tools
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN, // xapp- token
});
```

### OAuth (Multi-Workspace Apps)

```javascript
const { App, ExpressReceiver } = require('@slack/bolt');
const { FileInstallationStore } = require('@slack/oauth');

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
  stateSecret: process.env.SLACK_STATE_SECRET,
  scopes: ['chat:write', 'channels:read', 'commands'],
  installationStore: new FileInstallationStore(),
});

const app = new App({ receiver });
```

## Workflow Steps (Deprecated → Automations)

```javascript
// Legacy workflow steps (still used in some workspaces)
const ws = new WorkflowStep('copy_review', {
  edit: async ({ ack, step, configure }) => {
    await ack();
    await configure({ blocks: editBlocks });
  },
  save: async ({ ack, step, view, update }) => {
    await ack();
    const { values } = view.state;
    await update({ inputs: {}, outputs: [] });
  },
  execute: async ({ step, complete, fail }) => {
    try {
      // do work
      await complete({ outputs: {} });
    } catch (err) {
      await fail({ error: { message: err.message } });
    }
  },
});
app.step(ws);
```

## Scopes Reference

| Capability         | Required Scopes                      |
| ------------------ | ------------------------------------ |
| Post messages      | `chat:write`                         |
| Read channels      | `channels:read`, `groups:read`       |
| Read messages      | `channels:history`, `groups:history` |
| Slash commands     | `commands`                           |
| React to messages  | `reactions:write`                    |
| Upload files       | `files:write`                        |
| Read user profiles | `users:read`, `users:read.email`     |
| Home tab           | `im:history`                         |
| Bot mentions       | `app_mentions:read`                  |
| DMs                | `im:write`, `mpim:write`             |

## Common Patterns

### Approval Workflow

```javascript
app.command('/approve-request', async ({ command, ack, client }) => {
  await ack();
  // Post approval request to manager channel
  await client.chat.postMessage({
    channel: '#approvals',
    text: `<@${command.user_id}> requests approval`,
    blocks: buildApprovalBlocks(command),
  });
});

app.action('approve_action', async ({ action, body, ack, client }) => {
  await ack();
  const requestId = action.value;
  await markApproved(requestId, body.user.id);
  // Update original message
  await client.chat.update({
    channel: body.channel.id,
    ts: body.message.ts,
    text: `Approved by <@${body.user.id}>`,
    blocks: buildApprovedBlocks(requestId),
  });
});
```

### User Lookup

```javascript
async function lookupUser(client, email) {
  const result = await client.users.lookupByEmail({ email });
  return result.user.id;
}
```

## Error Handling

```javascript
app.error(async error => {
  console.error('Global error handler', error);
  // Notify admin channel
  await app.client.chat.postMessage({
    channel: process.env.ADMIN_CHANNEL,
    text: `App error: ${error.message}`,
  });
});
```

## Security

- Always verify `SLACK_SIGNING_SECRET` to authenticate requests from Slack
- Never log raw payloads (may contain user PII)
- Use `response_type: 'ephemeral'` for sensitive command responses
- Store tokens in encrypted secrets manager, not `.env` in production
- Scope bot tokens to minimum required permissions
- Rotate signing secrets if compromised — requires reinstalling the app

## Debugging

```bash
# Enable Bolt debug logging
DEBUG=bolt:* node app.js

# Test with Slack CLI (requires Slack CLI installed)
slack run
slack triggers create --trigger-def "triggers/trigger.json"

# Replay events locally
slack events replay
```

## Related

- `slack-notifications` skill — Simple one-way messaging and alerts
- Bolt JS docs: <https://slack.dev/bolt-js/>
- Block Kit Builder: <https://app.slack.com/block-kit-builder>
- Slack API reference: <https://api.slack.com/methods>
