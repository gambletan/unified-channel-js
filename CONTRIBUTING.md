# Contributing to unified-channel

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
git clone https://github.com/gambletan/unified-channel-js.git
cd unified-channel-js
npm install
npm test
```

## Project Structure

```
src/
  types.ts          # Core types (UnifiedMessage, OutboundMessage, etc.)
  adapter.ts        # ChannelAdapter interface
  middleware.ts      # Middleware interface + built-in middleware
  manager.ts         # ChannelManager orchestrator
  adapters/          # One file per channel adapter
tests/               # Vitest test files
```

## Adding a New Channel Adapter

1. Create `src/adapters/<channel>.ts` implementing `ChannelAdapter`
2. Add tests in `tests/<channel>.test.ts`
3. Update the channels table in `README.md`
4. Add peer dependency entry in `package.json` (if an SDK is required)

## Code Style

- TypeScript strict mode
- ESM imports only (`import`/`export`, no `require`)
- Avoid `any` — use `unknown` or proper types
- Keep adapters self-contained (one file per channel)

## Testing

```bash
npm test            # Run all tests
npm run test:watch  # Watch mode
npm run build       # Type-check + compile
```

All PRs must pass tests and type-check before merge.

## Commit Messages

Use conventional commits:

```
feat: add WeChat adapter
fix: handle reconnection in MattermostAdapter
docs: update quick start example
```

## Pull Requests

- Fork the repo and create a feature branch
- Keep PRs focused — one feature or fix per PR
- Fill out the PR template
- Ensure CI passes

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
