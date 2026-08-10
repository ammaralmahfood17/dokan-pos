# VLY Integrations

First-order integrations for AI and email with automatic usage billing through VLY integration keys.

## Environment Variables

The following environment variables are automatically set during project creation:

- `VLY_INTEGRATION_KEY`: Your unique integration key (format: `sk_*`)
- `VLY_INTEGRATION_BASE_URL`: The base URL for the integration gateway (default: `https://integrations.freebuff.com/`)

## Installation

The `@vly-ai/integrations` package is already included in package.json.

## Usage (server / edge runtime only)

`VLY_INTEGRATION_KEY` is a server-side deployment token — never import `vly`
from browser code. Dokan is a client-only Vite app with no Node server, so VLY
is reserved for any future server/edge layer (e.g. server-side AI calls or
email).

```typescript
// Node/edge runtime only — do NOT import from client components.
import { vly } from './lib/vly-integrations';

const completion = await vly.ai.completion({
  model: 'gpt-4o-mini', // or 'gpt-4o', 'claude-3-haiku', etc.
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' }
  ],
  temperature: 0.7,
  maxTokens: 150
});
```

## Available Features

### AI Integration
```typescript
// Create completion
const completion = await vly.ai.completion({
  model: 'gpt-4o-mini', // or 'gpt-4o', 'claude-3-haiku', etc.
  messages: [...],
  temperature: 0.7,
  maxTokens: 150
});

// Stream completion
await vly.ai.streamCompletion(
  request,
  (chunk: string) => console.log(chunk)
);

// Generate embeddings
const embeddings = await vly.ai.embeddings("Your text here");
```

### Email Integration
```typescript
// Send email
const emailResult = await vly.email.send({
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Welcome to our service!</h1>',
  text: 'Welcome to our service!'
});

// Send batch emails
const batchResult = await vly.email.sendBatch([...emails]);
```

## Error Handling

All methods return an ApiResponse object:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  usage?: {
    credits: number;
    operation: string;
  };
}
```

Example error handling:

```typescript
const result = await vly.ai.completion({ ... });

if (result.success) {
  console.log('Response:', result.data);
  console.log('Credits used:', result.usage?.credits);
} else {
  console.error('Error:', result.error);
}
```

## Important Notes

1. The integration key (`VLY_INTEGRATION_KEY`) is automatically injected during project creation
2. All API calls are automatically billed to your deployment based on usage
3. Never call VLY integrations from browser code — `VLY_INTEGRATION_KEY` is a server-side deployment token and must never be exposed to the client
4. The integration key should never be exposed to the client

## Checking Integration Status

To verify the integration is properly configured:

```typescript
const hasIntegration = !!process.env.VLY_INTEGRATION_KEY;
if (!hasIntegration) {
  console.error("VLY integration key not found");
}
```
