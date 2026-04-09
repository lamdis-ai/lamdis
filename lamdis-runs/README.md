# lamdis-runs 🚦🤖

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)

**lamdis-runs** is a test runner for **AI assistants and agents**. It executes test suites, gates CI/CD pipelines, and uses AWS Bedrock (Claude) for semantic evaluation.

> ⚠️ **Proprietary Software** - See [LICENSE](LICENSE) for terms.

---

## What it does ⚙️

- Runs test suites against your assistant via **HTTP chat** or **AWS Bedrock**
- Uses **Claude Haiku** as an LLM judge for semantic checks
- Asserts **keywords/regex**, **semantic rubrics**, and **HTTP request** expectations
- Exposes a **CLI** (`npm run run-file`) and internal endpoints for CI/CD integration

---

## Requirements 📦

- **Node.js** 20+
- **MongoDB Atlas** (or MongoDB instance)
- **AWS credentials** with Bedrock access

---

## Quick Start

### 1) Install and configure

```bash
cd lamdis-runs
npm install
```

Create a `.env` file:

```bash
# MongoDB
MONGO_URL=mongodb+srv://user:pass@cluster.mongodb.net/lamdis

# Server
PORT=3101

# Security
LAMDIS_API_TOKEN=your-secure-token
LAMDIS_HMAC_SECRET=your-hmac-secret

# AWS Bedrock (required)
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
```

### 2) Start the server

```bash
npm run dev
```

### 3) Run tests via CLI

```bash
export LAMDIS_API_TOKEN="your-token"
export LAMDIS_RUNS_URL="http://127.0.0.1:3101"

npm run run-file -- configs/tests/example.json
```

---

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGO_URL` | MongoDB connection string | Yes |
| `PORT` | HTTP port | No (default: 3101) |
| `LAMDIS_API_TOKEN` | Token to protect `/internal` endpoints | Yes |
| `LAMDIS_HMAC_SECRET` | HMAC secret for request signing | Yes |
| `AWS_ACCESS_KEY_ID` | AWS credentials | Yes |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials | Yes |
| `AWS_REGION` | AWS region for Bedrock | Yes (default: us-east-1) |
| `BEDROCK_MODEL_ID` | Bedrock model for conversations | No (default: claude-3-haiku) |
| `BEDROCK_JUDGE_MODEL_ID` | Bedrock model for judging | No (uses BEDROCK_MODEL_ID) |
| `BEDROCK_TEMPERATURE` | Temperature for Bedrock calls | No (default: 0.3) |

---

## Test Configuration

Tests are defined as JSON files under `configs/`:

```
configs/
├── assistants/    # Assistant endpoint configurations
├── auth/          # Authentication configurations  
├── personas/      # User persona definitions
├── requests/      # Reusable HTTP request definitions
├── suites/        # Test suite groupings
└── tests/         # Individual test definitions
```

### Example Test File

```json
{
  "tests": [
    {
      "name": "greeting-test",
      "assistantRef": "assistants/dev/v1",
      "steps": [
        {
          "type": "user",
          "content": "Hello!"
        },
        {
          "type": "assistant_check",
          "rubric": "Assistant responds with a friendly greeting",
          "threshold": 0.7
        }
      ]
    }
  ]
}
```

### Step Types

| Step Type | Description |
|-----------|-------------|
| `user` | Send a user message to the assistant |
| `assistant_check` | Validate assistant response with semantic rubric |
| `assert_contains` | Check for keyword/regex in response |
| `http_request` | Make an HTTP request and validate response |

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/internal/runs/start` | POST | Start a test run |
| `/internal/run-file` | POST | Run tests from JSON file |
| `/orgs/:orgId/judge` | POST | Evaluate assistant response |

All `/internal` endpoints require `LAMDIS_API_TOKEN` authentication.

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: AI Tests
on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run AI Tests
        env:
          LAMDIS_API_TOKEN: ${{ secrets.LAMDIS_API_TOKEN }}
          LAMDIS_RUNS_URL: ${{ secrets.LAMDIS_RUNS_URL }}
        run: |
          npm run run-file -- configs/tests/smoke.json
```

The CLI exits with code 1 if any test fails, making it ideal for CI gates.

---

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build
```

---

## License

**Proprietary** - Copyright © 2024-2026 Lamdis AI. All rights reserved.

See [LICENSE](LICENSE) for full terms.

