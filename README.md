# clean-fastify-prisma

A production-ready Fastify application built with clean architecture principles, featuring Bun runtime, Prisma ORM, Redis caching, and BullMQ job queues.

## Features

- **Fastify Framework** - High-performance web framework
- **Bun Runtime** - Fast JavaScript runtime with built-in bundler
- **Prisma ORM** - Type-safe ORM with PostgreSQL
- **Redis** - In-memory caching and session storage
- **BullMQ** - Robust queue system for background jobs
- **JWT Authentication** - Secure token-based authentication
- **Role-Based Access Control (RBAC)** - Permission management system
- **TypeScript** - Full type safety
- **Clean Architecture** - Organized, maintainable codebase

## Prerequisites

- [Bun](https://bun.sh) >= 1.0
- PostgreSQL >= 14
- Redis >= 7

## Getting Started

### Installation

```bash
bun install
```

### Environment Configuration

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/your_database"
REDIS_HOST="localhost"
REDIS_PORT=6379
APP_SECRET="your-secret-key"
APP_JWT_SECRET="your-jwt-secret"
```

### Database Setup

```bash
# Generate Prisma client
make db-generate

# Run migrations
make db-migrate

# Or push schema directly (development only)
make db-push

# Run seeders
make db-seed
```

### Development

Start the development server:

```bash
# Start both server and worker
make dev

# Start API server only
make dev-server

# Start worker only
make dev-worker
```

The API will be available at `http://localhost:8001`

## Project Structure

```
src/
├── app.ts                 # Fastify app initialization
├── serve.ts              # Server entry point
├── bull/                 # Queue jobs and workers
│   ├── queue/           # Job queue definitions
│   └── worker/          # Job processors
├── libs/                # Shared libraries
│   ├── cache/          # Redis cache utilities
│   ├── config/         # Configuration files
│   ├── database/       # Database setup
│   │   ├── postgres/   # PostgreSQL with Prisma
│   │   └── redis/      # Redis client
│   ├── fastify/        # Fastify plugins and utilities
│   │   ├── plugins/    # Custom plugins
│   │   ├── error/      # Error handlers
│   │   └── di/         # Dependency injection
│   ├── mail/           # Email service
│   ├── types/          # TypeScript types
│   └── utils/          # Utility functions
└── modules/            # Feature modules (co-located routes, schemas, services)
    ├── auth/           # Authentication module
    ├── health/         # Health check module
    ├── profile/        # User profile module
    └── settings/       # Settings module
prisma/
├── schema.prisma       # Data models
├── migrations/         # Migration history
└── seed/               # Database seeders
```

## Available Commands

### Development

```bash
make dev            # Start server and worker with hot reload
make dev-server     # Start server only with hot reload
make dev-worker     # Start worker only with hot reload
```

### Production Build

```bash
make build          # Build the application
make start          # Start server and worker
make start-server   # Start production server only
make start-worker   # Start production worker only
```

### Code Quality

```bash
make lint           # Run ESLint
make lint-fix       # Fix ESLint issues
make format         # Format code with Prettier
bun run typecheck   # Run TypeScript type checking
```

### Database (PostgreSQL/Prisma)

```bash
make db-generate    # Generate Prisma client
make db-migrate     # Run pending migrations
make db-push        # Push schema to database (dev only)
make db-pull        # Pull schema from database
make db-studio      # Open Prisma Studio UI
make db-reset       # Reset database
make db-seed        # Run database seeders
```

### Quick Workflows

```bash
make fresh          # Reset, push schema, and seed
make reset          # Generate, migrate, and seed
```

## API Documentation

Once the server is running, visit:

- Swagger UI: `http://localhost:8001/documentation`
- Scalar API Reference: `http://localhost:8001/reference`

## Authentication

The application uses JWT-based authentication:

1. Register: `POST /auth/register`
2. Login: `POST /auth/login`
3. Use returned token in Authorization header: `Bearer <token>`

## Environment Variables

| Variable         | Description                  | Default     |
| ---------------- | ---------------------------- | ----------- |
| `APP_PORT`       | Server port                  | 8001        |
| `APP_HOST`       | Server host                  | localhost   |
| `NODE_ENV`       | Environment                  | development |
| `DATABASE_URL`   | PostgreSQL connection string | -           |
| `REDIS_HOST`     | Redis host                   | localhost   |
| `REDIS_PORT`     | Redis port                   | 6379        |
| `APP_JWT_SECRET` | JWT signing secret           | -           |
| `APP_SECRET`     | Application secret key       | -           |

## Testing

Run the test suite:

```bash
bun test
```

## CI/CD

The project includes GitHub Actions workflow for:

- Linting
- Building server and worker
- Running database migrations
- Running seeders

## Contributing

1. Follow the existing code structure
2. Use TypeScript strict mode
3. Write meaningful commit messages
4. Ensure all tests pass before submitting PR

## License

See [LICENSE](LICENSE) file for details.
