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

# 7. Inicializacao: sincroniza schema no MySQL e inicia a API
CMD ["sh", "-c", "echo '[AZUN BACKEND] Aguardando MySQL iniciar...' && sleep 10 && npx prisma db push --schema=./src/prisma/schema.prisma && node src/server.js"]
