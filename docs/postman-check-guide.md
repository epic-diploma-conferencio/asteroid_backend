# Postman Check Guide

This guide helps you quickly verify that the API works end-to-end from Postman.

## 1. Prerequisites

1. Start the stack:
```bash
docker compose up -d
```
2. Ensure manager is reachable:
```bash
http://localhost:3000/api/health
```

Expected response:
```json
{
  "service": "manager",
  "status": "ok",
  "time": "..."
}
```

## 2. Create Postman Environment

Create environment `local-backend` with variables:

- `baseUrl` = `http://localhost:3000/api`
- `login` = `test.user.{{$timestamp}}`
- `password` = `Sup3rStrong!`
- `firstName` = `Ivan`
- `lastName` = `Petrov`
- `jobId` = (empty)
- `accessToken` = (empty)

## 3. Create Requests

## 3.1 Health

- Method: `GET`
- URL: `{{baseUrl}}/health`

Check:
- Status is `200`
- `status` field equals `ok`

## 3.2 Register (Happy Path)

- Method: `POST`
- URL: `{{baseUrl}}/v1/auth/register`
- Headers:
  - `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "login": "{{login}}",
  "password": "{{password}}",
  "firstName": "{{firstName}}",
  "lastName": "{{lastName}}"
}
```

Expected:
- Status `200`
- Body has `accessToken`, `expiresIn`, `user`
- `Set-Cookie` contains `refreshToken`

Postman Tests tab script:
```javascript
pm.test("Status is 200", function () {
  pm.response.to.have.status(200);
});

const data = pm.response.json();
pm.test("Has access token", function () {
  pm.expect(data.accessToken).to.be.a("string").and.not.empty;
});

pm.environment.set("accessToken", data.accessToken);
```

## 3.3 Register Duplicate Login (Conflict)

Send the same request from 3.2 one more time without changing `login`.

Expected:
- Status `409`
- Body:
```json
{
  "message": "User with this login already exists."
}
```

## 3.4 Register with Invalid Password (Validation)

- Method: `POST`
- URL: `{{baseUrl}}/v1/auth/register`
- Body:
```json
{
  "login": "bad.user.{{$timestamp}}",
  "password": "123",
  "firstName": "Ivan",
  "lastName": "Petrov"
}
```

Expected:
- Status `400`
- Body:
```json
{
  "message": "Field \"password\" must be between 8 and 72 characters."
}
```

## 3.5 Upload File

- Method: `POST`
- URL: `{{baseUrl}}/upload`
- Body: `form-data`
  - key: `file` (type `File`)
  - value: pick any `.js`, `.ts` or `.py` file

Expected:
- Status `202` (or `502` if worker is unavailable)
- Save `jobId` from response

Tests script:
```javascript
const data = pm.response.json();
if (data.jobId) {
  pm.environment.set("jobId", data.jobId);
}
```

## 3.6 Job Status by ID

- Method: `GET`
- URL: `{{baseUrl}}/jobs/{{jobId}}`

Repeat until `status` becomes `COMPLETED` or `FAILED`.

## 3.7 Graph

- Method: `GET`
- URL: `{{baseUrl}}/graph`

Expected:
- Status `200`
- Body contains arrays: `nodes`, `edges`, `modules`

## 4. Quick Troubleshooting

- `400` on register:
  - Check JSON body and field lengths.
- `409` on register:
  - Login already exists; use a different login.
- `500` on register:
  - Check manager logs:
```bash
docker compose logs manager --tail=100
```
- Upload issues:
  - Verify worker containers are running:
```bash
docker compose ps
```

## 5. Optional: Export for Frontend Teammate

1. Export Postman Collection (`.json`)
2. Export Environment (`.json`)
3. Share both files with frontend dev

This allows one-click import and immediate API checks.
