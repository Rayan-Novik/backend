FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate --schema=./src/prisma/schema.prisma

EXPOSE 5000

# 🟢 ADICIONAMOS UM SLEEP DE 15 SEGUNDOS PARA GARANTIR
CMD ["sh", "-c", "echo 'Aguardando MySQL...' && sleep 15 && npx prisma db push --schema=./src/prisma/schema.prisma && node src/server.js"]