# Build the React app, then serve it with the tiny Node host. No database here: everything is in Supabase.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/dist ./dist
COPY server.js ./
EXPOSE 3000
# Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY at runtime to point the same image at another project.
CMD ["node", "server.js"]
