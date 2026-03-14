---
name: google-workspace
description: Google Workspace integration skill for Gmail, Calendar, Drive, Docs, and Sheets via Python client libraries and MCP servers
version: 1.0.0
category: integrations
tools:
  - Bash
  - Read
  - Write
  - Edit
---

# Google Workspace Integration Skill

## When to Invoke

```javascript
Skill({ skill: 'google-workspace' });
```

Use when:

- Integrating with Gmail (send/read/search emails)
- Working with Google Calendar (create/list/update events)
- Managing Google Drive (upload/download/share files)
- Reading or writing Google Docs or Sheets
- Automating any Google Workspace workflow via API

---

## Setup: OAuth 2.0 Authentication

Google Workspace APIs require OAuth 2.0. Use a service account for server-side automation or user OAuth for delegated access.

### Service Account (Recommended for Automation)

```bash
pip install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client
```

```python
from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/drive',
]

credentials = service_account.Credentials.from_service_account_file(
    'service-account.json',
    scopes=SCOPES,
)
# For delegated access (act as a user):
delegated_credentials = credentials.with_subject('user@yourdomain.com')
```

### User OAuth Flow

```python
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
import os, pickle

def get_credentials(scopes, token_file='token.pkl', creds_file='credentials.json'):
    creds = None
    if os.path.exists(token_file):
        with open(token_file, 'rb') as f:
            creds = pickle.load(f)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(creds_file, scopes)
            creds = flow.run_local_server(port=0)
        with open(token_file, 'wb') as f:
            pickle.dump(creds, f)
    return creds
```

---

## Gmail API

```python
service = build('gmail', 'v1', credentials=credentials)

# List messages
results = service.users().messages().list(userId='me', q='is:unread').execute()
messages = results.get('messages', [])

# Read a message
msg = service.users().messages().get(userId='me', id=messages[0]['id'], format='full').execute()
subject = next(h['value'] for h in msg['payload']['headers'] if h['name'] == 'Subject')

# Send an email
import base64
from email.mime.text import MIMEText

def create_message(to, subject, body):
    message = MIMEText(body)
    message['to'] = to
    message['subject'] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    return {'raw': raw}

msg_body = create_message('recipient@example.com', 'Hello', 'Body text here')
service.users().messages().send(userId='me', body=msg_body).execute()
```

---

## Google Calendar API

```python
service = build('calendar', 'v3', credentials=credentials)

# List upcoming events
from datetime import datetime, timezone
now = datetime.now(timezone.utc).isoformat()
events_result = service.events().list(
    calendarId='primary',
    timeMin=now,
    maxResults=10,
    singleEvents=True,
    orderBy='startTime',
).execute()
events = events_result.get('items', [])

# Create an event
event = {
    'summary': 'Team Standup',
    'start': {'dateTime': '2026-03-15T09:00:00-07:00', 'timeZone': 'America/Los_Angeles'},
    'end':   {'dateTime': '2026-03-15T09:30:00-07:00', 'timeZone': 'America/Los_Angeles'},
    'attendees': [{'email': 'colleague@example.com'}],
}
created = service.events().insert(calendarId='primary', body=event).execute()
```

---

## Google Drive API

```python
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload
import io

service = build('drive', 'v3', credentials=credentials)

# List files
results = service.files().list(
    pageSize=10,
    fields='files(id, name, mimeType)',
    q="'root' in parents and trashed = false",
).execute()
files = results.get('files', [])

# Upload a file
file_metadata = {'name': 'report.pdf', 'parents': ['<folder_id>']}
media = MediaFileUpload('report.pdf', mimetype='application/pdf')
file = service.files().create(body=file_metadata, media_body=media, fields='id').execute()

# Download a file
request = service.files().get_media(fileId='<file_id>')
fh = io.FileIO('downloaded.pdf', 'wb')
downloader = MediaIoBaseDownload(fh, request)
done = False
while not done:
    status, done = downloader.next_chunk()

# Share a file
service.permissions().create(
    fileId='<file_id>',
    body={'type': 'user', 'role': 'reader', 'emailAddress': 'user@example.com'},
).execute()
```

---

## Google Sheets API

```python
service = build('sheets', 'v4', credentials=credentials)
sheet = service.spreadsheets()

SPREADSHEET_ID = '<your-spreadsheet-id>'

# Read values
result = sheet.values().get(spreadsheetId=SPREADSHEET_ID, range='Sheet1!A1:D10').execute()
rows = result.get('values', [])

# Write values
body = {'values': [['Name', 'Score'], ['Alice', 95], ['Bob', 87]]}
sheet.values().update(
    spreadsheetId=SPREADSHEET_ID,
    range='Sheet1!A1',
    valueInputOption='RAW',
    body=body,
).execute()

# Append rows
sheet.values().append(
    spreadsheetId=SPREADSHEET_ID,
    range='Sheet1!A1',
    valueInputOption='USER_ENTERED',
    body={'values': [['Charlie', 92]]},
).execute()
```

---

## Google Docs API

```python
service = build('docs', 'v1', credentials=credentials)

# Read document
doc = service.documents().get(documentId='<doc_id>').execute()
title = doc.get('title')
# Extract text from body content
content = doc.get('body', {}).get('content', [])

# Insert text at end of document
requests = [{
    'insertText': {
        'location': {'index': 1},
        'text': 'New paragraph content.\n',
    }
}]
service.documents().batchUpdate(
    documentId='<doc_id>',
    body={'requests': requests},
).execute()
```

---

## MCP Server Integration

If a Google Workspace MCP server is available, prefer it over direct API calls:

```javascript
// In Claude Code agent context
mcp__google_workspace__gmail_send({
  to: 'user@example.com',
  subject: 'Hello',
  body: 'Message body',
});

mcp__google_workspace__calendar_create_event({
  title: 'Meeting',
  start: '2026-03-15T09:00:00Z',
  end: '2026-03-15T10:00:00Z',
});

mcp__google_workspace__drive_upload({
  name: 'file.pdf',
  path: '/local/path/file.pdf',
});
```

---

## Security Notes

- Store credentials in environment variables or secret managers, never in source code
- Use service accounts with minimum required scopes
- Enable domain-wide delegation only when necessary
- Rotate service account keys regularly
- Use `credentials.json` from Google Cloud Console; add to `.gitignore`
- For production, use Google Secret Manager: `pip install google-cloud-secret-manager`

---

## Common Scopes Reference

| Service  | Scope                   | Access Level |
| -------- | ----------------------- | ------------ |
| Gmail    | `gmail.readonly`        | Read-only    |
| Gmail    | `gmail.send`            | Send only    |
| Gmail    | `gmail.modify`          | Read/write   |
| Calendar | `calendar.readonly`     | Read-only    |
| Calendar | `calendar`              | Full access  |
| Drive    | `drive.readonly`        | Read-only    |
| Drive    | `drive.file`            | App-created  |
| Drive    | `drive`                 | Full access  |
| Sheets   | `spreadsheets.readonly` | Read-only    |
| Sheets   | `spreadsheets`          | Full access  |
| Docs     | `documents.readonly`    | Read-only    |
| Docs     | `documents`             | Full access  |

Always use the most restrictive scope that meets your requirements.
