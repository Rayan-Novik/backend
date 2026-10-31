FROM node:20

# 1. Instalacao do PHP CLI e extensoes necessarias para o SPED-NFE / PHP-ADAPTER
RUN apt-get update && apt-get install -y \
    php-cli \
    php-soap \
    php-xml \
    php-mbstring \
    php-curl \
    php-zip \
    php-bcmath \
    php-intl \
    git \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# 2. Instalacao Global do Composer para gerenciar dependencias PHP
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

WORKDIR /app

# 3. Cache e instalacao das dependencias Node.js
COPY package*.json ./
RUN npm install

# 4. Copia todo o codigo-fonte
COPY . .

# 5. Instalacao de pacotes Composer no php-adapter (se o composer.json existir)
RUN if [ -f php-adapter/composer.json ]; then \
      cd php-adapter && composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction || true; \
    fi

# 6. Geracao dos clientes Prisma ORM
RUN npx prisma generate --schema=./src/prisma/schema.prisma

EXPOSE 5000

# 7. Inicializacao: aguarda o MySQL ficar pronto na porta 3306, sincroniza schema e inicia o servidor
CMD ["sh", "-c", "sed -i 's|@localhost:[0-9]*|@mysql:3306|g' .env 2>/dev/null || true; sed -i 's|@127.0.0.1:[0-9]*|@mysql:3306|g' .env 2>/dev/null || true; echo '[AZUN BACKEND] Aguardando MySQL (mysql:3306) iniciar...'; until node -e \"const net=require('net');const s=net.connect(3306,'mysql',()=>{s.destroy();process.exit(0)});s.on('error',()=>process.exit(1));\"; do sleep 2; done; echo '[AZUN BACKEND] Conexao com MySQL estabelecida! Sincronizando tabelas com Prisma...'; npx prisma db push --schema=./src/prisma/schema.prisma --accept-data-loss && echo '[AZUN BACKEND] Banco sincronizado com sucesso! Iniciando API...' && node src/server.js"]
