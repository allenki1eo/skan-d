FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json yarn.lock* package-lock.json* ./
RUN npm install --frozen-lockfile

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache python3 make g++ cairo-dev pango-dev libjpeg-turbo-dev giflib-dev librsvg-dev
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
CMD ["node", "dist/index.js"]
