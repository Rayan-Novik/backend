FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

# Prisma Client
RUN npx prisma generate --schema=src/prisma/schema.prisma

EXPOSE 5000
CMD ["npm", "start"]
