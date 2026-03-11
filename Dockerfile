FROM oven/bun:1.1.13-alpine

WORKDIR /app

# Install concurrently globally for build/start scripts
RUN npm install -g concurrently

COPY package.json bun.lock ./
RUN bun install --production --ignore-scripts

COPY . .

# Generate Prisma client
RUN bunx prisma generate

# Build the app
RUN bun run build

EXPOSE 8001

CMD ["bun", "run", "start"]
