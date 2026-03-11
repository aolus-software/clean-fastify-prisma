# Clean Fastify Prisma - Improvement TODO List

## 🔴 High Priority

### ESLint Configuration

- [ ] **Add import sorting rules**
  - Missing: `eslint-plugin-simple-import-sort` (not installed)
  - Add import ordering rules (like clean-hono and clean-elysia)
  - Add `eslint-plugin-import` for duplicate detection

### Project Structure

- [ ] **Flatten utilities structure**
  - Current: `libs/utils/fastify/`, `libs/utils/security/`
  - Flatten utility helpers (date.ts, number.ts, string.ts) to `utils/` root
  - Update `utils/index.ts` to flat export style

## 🟡 Medium Priority

### OpenAPI Schema Enhancement

- [ ] **Improve OpenAPI schema definitions**
  - Add descriptions and examples to Zod schemas
  - Add `.openapi()` metadata for all request/response schemas
  - Improve error response schemas with validation examples

### Middleware & Plugins

- [ ] **Add performance monitoring middleware**
  - No performance logging middleware exists
  - Add request duration logging
  - Warn on slow requests (>1s threshold)

- [ ] **Add body size limit configuration**
  - No explicit body size limit configured
  - Add Fastify body limit via `bodyLimit` option in server configuration

### Service Layer

- [ ] **Add service interfaces**
  - Current: Services are plain objects without interfaces
  - Add TypeScript interfaces for all services
  - Benefits: Better type safety, documentation, and testability

### Error Handling

- [ ] **Add more error types**
  - Missing: `ServiceUnavailableError` (503), `RateLimitError` (429)
  - Add error codes constants

## 🟢 Low Priority

### Documentation

- [ ] **Enhance README.md**
  - Add architecture diagrams
  - Document API authentication flow
  - Add examples for common use cases
  - Document DI pattern with tsyringe
  - Add troubleshooting section

### Testing

- [ ] **Add test infrastructure**
  - No tests currently exist
  - Add testing framework (Bun test or Vitest)
  - Add unit tests for services
  - Add integration tests for API endpoints
  - Add E2E tests for critical flows

### Environment Files

- [ ] **Enhance .env.example**
  - Add more detailed comments for each variable
  - Document which variables are required vs optional

### Logging

- [ ] **Enhance logging configuration**
  - Add log correlation IDs
  - Ensure sensitive data redaction is consistent
  - Add structured logging improvements

### Configuration

- [ ] **Consolidate configuration exports**
  - Add a single config index with all configs
  - Ensure consistent naming across config files

## 📊 Comparison Notes (vs clean-fastify/Drizzle)

**What clean-fastify-prisma does differently:**

1. ✅ Prisma ORM instead of Drizzle (type-safe client, migrations, studio)
2. ✅ Co-located module structure (`modules/` with routes, schema, service together)
3. ✅ No ClickHouse dependency (simpler stack)
4. ✅ `db:reset` via Prisma migrate reset instead of manual drop

**Areas to align with clean-fastify:**

1. ⬜ Import sorting in ESLint
2. ⬜ Performance monitoring middleware
3. ⬜ More comprehensive error types
4. ⬜ OpenAPI schema descriptions and examples

## 🎯 Recommended Implementation Order

1. **Phase 1** (Quick wins):
   - Add import sorting to ESLint
   - Flatten utils structure

2. **Phase 2** (API improvements):
   - Add OpenAPI descriptions/examples to schemas
   - Add performance monitoring middleware
   - Add missing error types

3. **Phase 3** (Architecture):
   - Add service interfaces
   - Enhance configuration management

4. **Phase 4** (Quality):
   - Add testing infrastructure
   - Enhance documentation
