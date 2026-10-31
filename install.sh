#!/usr/bin/env bash
# ==============================================================================
# AZUN TECNOLOGIA & GESTAO - INSTALADOR E GERENCIADOR VPS LINUX
# Stack: Node.js 20, PHP CLI (NFePHP/Composer), MySQL 8.0, Proxy Nginx & Frontend
# Pasta Oficial: /var/www/azun ou /www/azun
# ==============================================================================

set -e

# Cores para o Terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # Sem Cor

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$BASE_DIR"

# 1. Se estiver dentro de backend/ ou www/, sobe para a raiz
if [ "$(basename "$BASE_DIR")" = "backend" ] || [ "$(basename "$BASE_DIR")" = "www" ]; then
    echo -e "${YELLOW}[i] Executando dentro de subpasta. Redirecionando para a pasta raiz...${NC}"
    cd "$BASE_DIR/.."
    BASE_DIR="$(pwd)"
fi

BACKEND_DIR="$BASE_DIR/backend"
PROXY_DIR="$BASE_DIR/proxy"
COMPOSE_FILE="$BASE_DIR/docker-compose.yml"

# 2. Garante arquivos essenciais de infraestrutura (docker-compose.yml e proxy/nginx.conf)
ensure_infrastructure() {
    # Se houver uma subpasta 'www/' na raiz, sincroniza arquivos para a raiz
    if [ -d "$BASE_DIR/www" ]; then
        if [ ! -f "$COMPOSE_FILE" ] && [ -f "$BASE_DIR/www/docker-compose.yml" ]; then
            echo -e "${YELLOW}[+] Copiando docker-compose.yml de www/ para a raiz...${NC}"
            cp "$BASE_DIR/www/docker-compose.yml" "$COMPOSE_FILE" 2>/dev/null || true
        fi
        if [ ! -d "$PROXY_DIR" ] && [ -d "$BASE_DIR/www/proxy" ]; then
            echo -e "${YELLOW}[+] Copiando proxy/ de www/ para a raiz...${NC}"
            cp -r "$BASE_DIR/www/proxy" "$PROXY_DIR" 2>/dev/null || true
        fi
    fi

    # Garante criacao do docker-compose.yml mestre caso ainda nao exista
    if [ ! -f "$COMPOSE_FILE" ]; then
        echo -e "${YELLOW}[+] Gerando docker-compose.yml mestre em $BASE_DIR...${NC}"
        cat << 'EOF' > "$COMPOSE_FILE"
services:
  mysql:
    image: mysql:8.0
    container_name: azun_mysql
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-Gd1700al@@}
      MYSQL_DATABASE: ${MYSQL_DATABASE:-ecommerce_db}
    ports:
      - "127.0.0.1:3307:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    networks:
      - azun_network
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${MYSQL_ROOT_PASSWORD:-Gd1700al@@}"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 20s

  phpmyadmin:
    image: phpmyadmin/phpmyadmin
    container_name: azun_phpmyadmin
    restart: always
    ports:
      - "127.0.0.1:8081:80"
    environment:
      PMA_HOST: mysql
      PMA_USER: root
      PMA_PASSWORD: ${MYSQL_ROOT_PASSWORD:-Gd1700al@@}
    depends_on:
      - mysql
    networks:
      - azun_network

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: azun_backend
    restart: always
    ports:
      - "127.0.0.1:5005:5000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=mysql://root:${MYSQL_ROOT_PASSWORD:-Gd1700al@@}@mysql:3306/${MYSQL_DATABASE:-ecommerce_db}
    env_file:
      - ./backend/.env
    depends_on:
      mysql:
        condition: service_healthy
    volumes:
      - ./backend/uploads:/app/uploads
      - ./backend/whatsapp_sessions:/app/whatsapp_sessions
    networks:
      - azun_network

  proxy:
    image: nginx:alpine
    container_name: azun_proxy
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./proxy/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./proxy/ssl:/etc/nginx/ssl:ro
      - /var/www/certbot:/var/www/certbot:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - ./proxy/certbot/www:/var/www/certbot-local:ro
      - ./proxy/certbot/conf:/etc/letsencrypt-local:ro
    depends_on:
      - backend
    networks:
      - azun_network

  admin-app:
    profiles: ["frontend", "full"]
    build:
      context: ./admin
      dockerfile: Dockerfile
    container_name: azun_admin_frontend
    restart: always
    expose:
      - "80"
    networks:
      - azun_network

  frontend-app:
    profiles: ["frontend", "full"]
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: azun_client_frontend
    restart: always
    expose:
      - "80"
    networks:
      - azun_network

networks:
  azun_network:
    name: azun_network
    driver: bridge

volumes:
  mysql_data:
    name: azun_mysql_data
EOF
        echo -e "${GREEN}[✓] Arquivo '$COMPOSE_FILE' criado com sucesso!${NC}"
    fi

    # Garante criacao do proxy/nginx.conf caso ainda nao exista
    if [ ! -f "$PROXY_DIR/nginx.conf" ]; then
        echo -e "${YELLOW}[+] Criando pasta '$PROXY_DIR' e gerando 'proxy/nginx.conf'...${NC}"
        mkdir -p "$PROXY_DIR/ssl"
        mkdir -p "$PROXY_DIR/certbot/www"
        mkdir -p "$PROXY_DIR/certbot/conf"
        cat << 'EOF' > "$PROXY_DIR/nginx.conf"
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    server_tokens off;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    client_max_body_size 50M;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;

    resolver 127.0.0.11 valid=15s ipv6=off;

    server {
        listen 80;
        server_name admin.azun.com.br admin.ararinhacloud.shop;

        location / {
            set $admin_upstream http://admin-app:80;
            proxy_pass $admin_upstream;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 10s;
            proxy_read_timeout 120s;
        }

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
    }

    server {
        listen 80;
        server_name back.ararinhacloud.shop api.azun.com.br;

        location / {
            set $backend_upstream http://backend:5000;
            proxy_pass $backend_upstream;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 15s;
            proxy_read_timeout 300s;
            proxy_send_timeout 300s;
        }

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
    }

    server {
        listen 80 default_server;
        server_name _;

        location /api/public/render-og {
            set $backend_upstream http://backend:5000;
            proxy_pass $backend_upstream;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location / {
            set $frontend_upstream http://frontend-app:80;
            proxy_pass $frontend_upstream;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 10s;
            proxy_read_timeout 120s;
        }

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
    }
}
EOF
        echo -e "${GREEN}[✓] Arquivo '$PROXY_DIR/nginx.conf' criado com sucesso!${NC}"
    fi
}

# Inicializa e valida a infraestrutura
ensure_infrastructure

# Funcao para imprimir cabecalhos
header() {
    clear
    echo -e "${CYAN}==============================================================================${NC}"
    echo -e "${WHITE}           AZUN TECNOLOGIA & GESTAO - GERENCIADOR E INSTALADOR VPS            ${NC}"
    echo -e "${CYAN}==============================================================================${NC}"
    echo -e "${BLUE} Diretorio Raiz:${NC} $BASE_DIR"
    echo -e "${BLUE} Pasta do Proxy:${NC} $PROXY_DIR"
    echo -e "${BLUE} Pasta Backend:${NC}  $BACKEND_DIR"
    echo -e "${BLUE} Compose File:${NC}   $COMPOSE_FILE"
    echo -e "${BLUE} Servidor:${NC}       $(hostname) | Kernel: $(uname -r)"
    echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
}

# Verifica se o comando docker compose existe (moderno ou plugin)
get_compose_cmd() {
    local cmd=""
    if docker compose version >/dev/null 2>&1; then
        cmd="docker compose"
    elif docker-compose version >/dev/null 2>&1; then
        cmd="docker-compose"
    fi

    if [ -n "$cmd" ] && [ -f "$COMPOSE_FILE" ]; then
        echo "$cmd -f $COMPOSE_FILE"
    else
        echo "$cmd"
    fi
}

# Checa e instala pre-requisitos essenciais no Linux (Docker, Compose, Git, Curl)
check_and_install_dependencies() {
    echo -e "\n${YELLOW}[+] Verificando dependencias do sistema...${NC}"
    
    # Verifica Git
    if ! command -v git &>/dev/null; then
        echo -e "${YELLOW}[!] Git nao encontrado. Instalando...${NC}"
        if [ -f /etc/debian_version ]; then
            apt-get update && apt-get install -y git curl wget unzip
        elif [ -f /etc/redhat-release ]; then
            yum install -y git curl wget unzip
        fi
    fi

    # Verifica Docker
    if ! command -v docker &>/dev/null; then
        echo -e "${YELLOW}[!] Docker nao encontrado. Instalando Docker oficial...${NC}"
        curl -fsSL https://get.docker.com | sh
        systemctl enable --now docker
        echo -e "${GREEN}[✓] Docker instalado com sucesso!${NC}"
    else
        echo -e "${GREEN}[✓] Docker ja instalado.${NC}"
    fi

    # Verifica Docker Compose
    COMPOSE_CMD=$(get_compose_cmd)
    if [ -z "$COMPOSE_CMD" ]; then
        echo -e "${YELLOW}[!] Docker Compose plugin nao encontrado. Instalando...${NC}"
        if [ -f /etc/debian_version ]; then
            apt-get update && apt-get install -y docker-compose-plugin
        elif [ -f /etc/redhat-release ]; then
            yum install -y docker-compose-plugin
        fi
        COMPOSE_CMD=$(get_compose_cmd)
    fi

    if [ -z "$COMPOSE_CMD" ]; then
        echo -e "${RED}[X] Erro critico: Nao foi possivel instalar o Docker Compose.${NC}"
        exit 1
    fi

    echo -e "${GREEN}[✓] Docker Compose pronto (${COMPOSE_CMD}).${NC}"
}

# 1. INSTALACAO DO BACKEND + BANCO + PROXY
install_backend() {
    header
    echo -e "${WHITE}--- [1] INSTALACAO DO BACKEND + BANCO DE DADOS + PROXY NGINX ---${NC}\n"
    check_and_install_dependencies

    COMPOSE_CMD=$(get_compose_cmd)

    # Cria pastas essenciais de persistencia no host
    mkdir -p "$BACKEND_DIR/uploads"
    mkdir -p "$BACKEND_DIR/whatsapp_sessions"
    mkdir -p "$PROXY_DIR/ssl"
    mkdir -p "$PROXY_DIR/certbot/www"
    mkdir -p "$PROXY_DIR/certbot/conf"
    mkdir -p /var/www/certbot 2>/dev/null || true
    mkdir -p /etc/letsencrypt 2>/dev/null || true
    mkdir -p "$BASE_DIR/backups"

    # Configuracao do .env do Backend
    if [ ! -f "$BACKEND_DIR/.env" ]; then
        echo -e "${YELLOW}[+] Criando arquivo de ambiente '$BACKEND_DIR/.env' a partir do modelo...${NC}"
        if [ -f "$BACKEND_DIR/.env.example" ]; then
            cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
        else
            echo -e "${RED}[X] '$BACKEND_DIR/.env.example' nao encontrado. Criando base padrao...${NC}"
            cat << 'EOF' > "$BACKEND_DIR/.env"
SERVER_PORT=5000
FRONTEND_URL=https://ararinhacloud.shop
ADMIN_URL=https://admin.azun.com.br
BACKEND_URL=https://back.ararinhacloud.shop
DATABASE_URL="mysql://root:Gd1700al%40%40@mysql:3306/ecommerce_db"
JWT_SECRET=8d7e4b2a3f9c1e6d5a7b8c2f4e9d1c6a3f7b2e9c5d4a1f8b6c3e7d2a9f4b1c8e
ENCRYPTION_KEY=3f9a7c2e5d8b1a6c4e7f2d9a3b5c8e1f
ENCRYPTION_IV=6a3f9c2e7d4b1a8c
EOF
        fi
        echo -e "${GREEN}[✓] Arquivo '$BACKEND_DIR/.env' configurado com sucesso!${NC}"
    fi

    echo -e "\n${YELLOW}[+] 1/3: Iniciando Banco de Dados MySQL 8.0...${NC}"
    $COMPOSE_CMD up -d mysql

    echo -e "${YELLOW}[+] Aguardando o MySQL ficar totalmente Saudavel (Healthcheck)...${NC}"
    RETRIES=30
    until [ $RETRIES -le 0 ] || [ "$($COMPOSE_CMD ps --format '{{.Health}}' mysql 2>/dev/null)" = "healthy" ]; do
        echo -ne "    Aguardando MySQL inicializar (${RETRIES}s)... \r"
        sleep 2
        RETRIES=$((RETRIES - 1))
    done
    echo -e "\n${GREEN}[✓] Banco de Dados MySQL ativo e pronto para conexoes!${NC}"

    echo -e "\n${YELLOW}[+] 2/3: Compilando e Construindo Imagem do Backend...${NC}"
    echo -e "${BLUE}    (Inclui: Node.js 20, PHP CLI, Composer para SPED-NFe e Prisma ORM)${NC}"
    $COMPOSE_CMD build backend

    echo -e "\n${YELLOW}[+] 3/3: Subindo Backend, PHPMyAdmin e Proxy Nginx...${NC}"
    $COMPOSE_CMD up -d backend phpmyadmin proxy

    echo -e "\n${GREEN}==============================================================================${NC}"
    echo -e "${GREEN}               [SUCESSO] BACKEND INSTALADO E OPERACIONAL!                    ${NC}"
    echo -e "${GREEN}==============================================================================${NC}"
    echo -e "${WHITE}  • API Backend:${NC}       http://127.0.0.1:5005 (e via proxy na porta 80/443)"
    echo -e "${WHITE}  • Banco de Dados:${NC}    MySQL 8.0 (Porta interna 3306, externa 3307)"
    echo -e "${WHITE}  • PHPMyAdmin:${NC}        http://SEU_IP:8081 (ou localhost:8081)"
    echo -e "${WHITE}  • Nginx Proxy:${NC}       Ativo nas portas 80 e 443 (Localizado em $PROXY_DIR)"
    echo -e "${WHITE}  • NFePHP/Composer:${NC}   Configurado e compilado no container backend"
    echo -e "${CYAN}------------------------------------------------------------------------------${NC}"

    echo -e "\n${YELLOW}[?] Deseja configurar os dominios no Nginx e instalar o Certificado SSL agora? [S/n]${NC}"
    read -p "Opcao: " CFG_NGINX_NOW
    CFG_NGINX_NOW=${CFG_NGINX_NOW:-S}
    if [[ "$CFG_NGINX_NOW" =~ ^[Ss]$ ]]; then
        configure_nginx_domains_ssl
    else
        echo -e "${BLUE}[i] Voce pode configurar dominios e SSL a qualquer momento pelo Menu (Opcao 7).${NC}"
        read -p "Pressione [Enter] para voltar ao menu principal..."
    fi
}

# 2. ATUALIZAR VERSAO DO BACKEND (GIT PULL + REBUILD + PRISMA DB PUSH)
update_backend() {
    header
    echo -e "${WHITE}--- [2] ATUALIZAR VERSAO DO BACKEND (GIT PULL + REBUILD) ---${NC}\n"
    COMPOSE_CMD=$(get_compose_cmd)

    if [ -z "$COMPOSE_CMD" ]; then
        echo -e "${RED}[X] Docker Compose nao encontrado.${NC}"
        read -p "Pressione [Enter] para continuar..."
        return
    fi

    # Backup de Seguranca Opcional
    read -p "Deseja gerar um backup automatico do banco de dados antes da atualizacao? [S/n]: " DO_BACKUP
    DO_BACKUP=${DO_BACKUP:-S}
    if [[ "$DO_BACKUP" =~ ^[Ss]$ ]]; then
        make_backup_silent
    fi

    # Git Pull no Backend
    if [ -d "$BACKEND_DIR/.git" ]; then
        echo -e "\n${YELLOW}[+] Puxando as ultimas alteracoes do Git no Backend...${NC}"
        cd "$BACKEND_DIR"
        git fetch --all
        git pull origin main || git pull
        cd "$BASE_DIR"
        echo -e "${GREEN}[✓] Codigo do Backend atualizado!${NC}"
    else
        echo -e "${YELLOW}[!] A pasta '$BACKEND_DIR' nao e um repositorio Git isolado. Pulando git pull.${NC}"
    fi

    echo -e "\n${YELLOW}[+] Reconstruindo imagem Docker do Backend com as novas atualizacoes...${NC}"
    $COMPOSE_CMD build backend

    echo -e "\n${YELLOW}[+] Reiniciando container do Backend...${NC}"
    $COMPOSE_CMD up -d --no-deps backend

    echo -e "\n${YELLOW}[+] Sincronizando schema do banco de dados com Prisma ORM...${NC}"
    docker exec azun_backend npx prisma db push --accept-data-loss || true

    echo -e "\n${GREEN}==============================================================================${NC}"
    echo -e "${GREEN}               [SUCESSO] BACKEND ATUALIZADO COM EXITO!                       ${NC}"
    echo -e "${GREEN}==============================================================================${NC}"
    echo -e "Logs recentes do backend:"
    docker logs --tail 25 azun_backend
    echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
    read -p "Pressione [Enter] para continuar..."
}

# 3. INSTALAR / ATIVAR FRONTEND E ADMIN
install_frontend() {
    header
    echo -e "${WHITE}--- [3] INSTALAR / ATIVAR FRONTEND E PAINEL ADMIN ---${NC}\n"
    COMPOSE_CMD=$(get_compose_cmd)

    # Clona repositorios se nao existirem
    ADMIN_PATH="$BASE_DIR/admin"
    FRONTEND_PATH="$BASE_DIR/frontend"

    if [ ! -d "$ADMIN_PATH" ]; then
        echo -e "${YELLOW}[+] Clonando repositorio do Painel Admin...${NC}"
        git clone https://github.com/Rayan-Novik/admin.git "$ADMIN_PATH" || {
            echo -e "${RED}[!] Nao foi possivel clonar o admin. Verifique o acesso ao GitHub.${NC}"
        }
    fi

    if [ ! -d "$FRONTEND_PATH" ]; then
        echo -e "${YELLOW}[+] Clonando repositorio do Frontend dos Clientes...${NC}"
        git clone https://github.com/Rayan-Novik/frontend.git "$FRONTEND_PATH" || {
            echo -e "${RED}[!] Nao foi possivel clonar o frontend. Verifique o acesso ao GitHub.${NC}"
        }
    fi

    echo -e "\n${YELLOW}[+] Construindo e Subindo Containers do Frontend e Admin...${NC}"
    $COMPOSE_CMD --profile full up -d --build admin-app frontend-app

    echo -e "\n${YELLOW}[+] Recarregando configuracoes do Proxy Nginx...${NC}"
    $COMPOSE_CMD restart proxy

    echo -e "\n${GREEN}==============================================================================${NC}"
    echo -e "${GREEN}          [SUCESSO] FRONTEND E ADMIN INSTALADOS E OPERACIONAIS!              ${NC}"
    echo -e "${GREEN}==============================================================================${NC}"
    echo -e "${WHITE}  • Admin Frontend:${NC}    Container ativo e roteado no proxy"
    echo -e "${WHITE}  • Loja Frontend:${NC}     Container ativo e roteado no proxy"
    echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
    read -p "Pressione [Enter] para continuar..."
}

# 4. ATUALIZAR FRONTEND E ADMIN
update_frontend() {
    header
    echo -e "${WHITE}--- [4] ATUALIZAR VERSAO DO FRONTEND E ADMIN ---${NC}\n"
    COMPOSE_CMD=$(get_compose_cmd)

    if [ -d "$BASE_DIR/admin/.git" ]; then
        echo -e "${YELLOW}[+] Puxando atualizacoes do Admin...${NC}"
        cd "$BASE_DIR/admin" && git pull && cd "$BASE_DIR"
    fi

    if [ -d "$BASE_DIR/frontend/.git" ]; then
        echo -e "${YELLOW}[+] Puxando atualizacoes do Frontend...${NC}"
        cd "$BASE_DIR/frontend" && git pull && cd "$BASE_DIR"
    fi

    echo -e "\n${YELLOW}[+] Recompilando imagens web...${NC}"
    $COMPOSE_CMD --profile full up -d --build --no-deps admin-app frontend-app
    $COMPOSE_CMD restart proxy

    echo -e "\n${GREEN}[✓] Frontend e Admin atualizados com sucesso!${NC}"
    read -p "Pressione [Enter] para continuar..."
}

# 5. VER STATUS E LOGS EM TEMPO REAL
view_logs() {
    header
    echo -e "${WHITE}--- [5] STATUS E LOGS DOS SERVICOS AZUN ---${NC}\n"
    COMPOSE_CMD=$(get_compose_cmd)

    echo -e "${YELLOW}Status dos Containers:${NC}"
    $COMPOSE_CMD ps
    echo -e "\n${CYAN}------------------------------------------------------------------------------${NC}"
    echo -e "Escolha o servico para ver logs em tempo real (Pressione Ctrl+C para sair dos logs):"
    echo -e "  [1] Backend API"
    echo -e "  [2] Proxy Nginx"
    echo -e "  [3] Banco MySQL"
    echo -e "  [4] Admin Frontend"
    echo -e "  [5] Client Frontend"
    echo -e "  [6] Todos os Servicos"
    echo -e "  [0] Voltar"
    read -p "Opcao: " LOG_OPT

    case $LOG_OPT in
        1) docker logs -f --tail 100 azun_backend ;;
        2) docker logs -f --tail 100 azun_proxy ;;
        3) docker logs -f --tail 100 azun_mysql ;;
        4) docker logs -f --tail 100 azun_admin_frontend 2>/dev/null || echo "Admin nao iniciado" ;;
        5) docker logs -f --tail 100 azun_client_frontend 2>/dev/null || echo "Frontend nao iniciado" ;;
        6) $COMPOSE_CMD logs -f --tail 50 ;;
        *) return ;;
    esac
}

# 6. GERENCIAR ESTADO (START / STOP / RESTART)
manage_services() {
    header
    echo -e "${WHITE}--- [6] GERENCIAR ESTADO DOS SERVICOS ---${NC}\n"
    COMPOSE_CMD=$(get_compose_cmd)

    echo -e "  [1] Reiniciar toda a aplicacao (Restart)"
    echo -e "  [2] Parar todos os servicos (Stop/Down)"
    echo -e "  [3] Iniciar todos os servicos (Up -d)"
    echo -e "  [4] Reiniciar apenas o Backend"
    echo -e "  [5] Reiniciar apenas o Proxy Nginx"
    echo -e "  [0] Voltar"
    read -p "Opcao: " SVC_OPT

    case $SVC_OPT in
        1)
            echo -e "${YELLOW}[+] Reiniciando aplicacao...${NC}"
            $COMPOSE_CMD restart
            echo -e "${GREEN}[✓] Todos os servicos foram reiniciados!${NC}"
            ;;
        2)
            echo -e "${YELLOW}[+] Parando servicos...${NC}"
            $COMPOSE_CMD down
            echo -e "${GREEN}[✓] Servicos parados!${NC}"
            ;;
        3)
            echo -e "${YELLOW}[+] Iniciando servicos...${NC}"
            $COMPOSE_CMD up -d
            echo -e "${GREEN}[✓] Servicos iniciados!${NC}"
            ;;
        4)
            $COMPOSE_CMD restart backend
            echo -e "${GREEN}[✓] Backend reiniciado com sucesso!${NC}"
            ;;
        5)
            $COMPOSE_CMD restart proxy
            echo -e "${GREEN}[✓] Proxy Nginx reiniciado com sucesso!${NC}"
            ;;
        *) return ;;
    esac
    read -p "Pressione [Enter] para continuar..."
}

# BACKUP SILENCIOSO (Chamado antes de atualizacoes ou desinstalacao)
make_backup_silent() {
    mkdir -p "$BASE_DIR/backups"
    BACKUP_FILE="$BASE_DIR/backups/backup_auto_$(date +%Y%m%d_%H%M%S).sql.gz"
    echo -e "${YELLOW}[+] Gerando backup de seguranca em $BACKUP_FILE...${NC}"
    docker exec azun_mysql mysqldump -u root -pGd1700al@@ --single-transaction --quick ecommerce_db 2>/dev/null | gzip > "$BACKUP_FILE" || true
    if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
        echo -e "${GREEN}[✓] Backup preventivo salvo com sucesso ($BACKUP_FILE)!${NC}"
    else
        echo -e "${YELLOW}[!] Nao foi possivel gerar backup previo (o container mysql pode estar desligado).${NC}"
    fi
}

# 7. CONFIGURAR NGINX, DOMINIOS E CERTIFICADO SSL (LET'S ENCRYPT)
configure_nginx_domains_ssl() {
    header
    echo -e "${WHITE}--- [7] CONFIGURAR NGINX, DOMINIOS & CERTIFICADO SSL (LET'S ENCRYPT) ---${NC}\n"
    COMPOSE_CMD=$(get_compose_cmd)

    # Cria diretorios de seguranca no host
    mkdir -p /var/www/certbot 2>/dev/null || true
    mkdir -p /etc/letsencrypt 2>/dev/null || true
    mkdir -p "$PROXY_DIR/ssl"
    mkdir -p "$PROXY_DIR/certbot/www"
    mkdir -p "$PROXY_DIR/certbot/conf"

    # Detectar IP publico da VPS
    SERVER_IP=$(curl -s -4 ifconfig.me 2>/dev/null || curl -s -4 icanhazip.com 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "SEU_IP_VPS")
    echo -e "${BLUE}  • IP Publico detectado desta VPS:${NC} ${WHITE}${SERVER_IP}${NC}"
    echo -e "${BLUE}  • Pasta do Proxy Nginx:${NC}          ${WHITE}${PROXY_DIR}${NC}"
    echo -e "${CYAN}------------------------------------------------------------------------------${NC}"

    echo -e "${YELLOW}Como deseja definir os dominios no Nginx?${NC}\n"
    echo -e "  ${GREEN}[1]${NC} ${WHITE}Dominio Base com Subdominios Automaticos (Recomendado)${NC}"
    echo -e "      Exemplo: voce informa 'meusistema.com' e o instalador configura:"
    echo -e "        - API Backend:   api.meusistema.com"
    echo -e "        - Painel Admin:  admin.meusistema.com"
    echo -e "        - Loja/Frontend: meusistema.com"
    echo -e ""
    echo -e "  ${CYAN}[2]${NC} ${WHITE}Definir cada dominio manualmente (Personalizado)${NC}"
    echo -e "      Voce digita a URL exata de cada servico"
    echo -e ""
    echo -e "  ${PURPLE}[3]${NC} ${WHITE}Apenas Backend / API (Ideal para VPS somente com backend)${NC}"
    echo -e "      Exemplo: api.meusistema.com ou back.ararinhacloud.shop"
    echo -e ""
    echo -e "  ${WHITE}[0]${NC} Voltar ao menu principal"
    echo -e ""
    read -p "Selecione a opcao [1/2/3/0]: " DOM_OPT

    case $DOM_OPT in
        1)
            echo ""
            read -p "Digite seu dominio base (ex: meusistema.com.br): " RAW_BASE
            BASE_DOMAIN=$(echo "$RAW_BASE" | sed -e 's|^https*://||' -e 's|/.*||' | tr -d ' ')
            if [ -z "$BASE_DOMAIN" ]; then
                echo -e "${RED}[X] Dominio base invalido.${NC}"
                read -p "Pressione [Enter] para voltar..."
                return
            fi

            DOMAIN_BACKEND="api.${BASE_DOMAIN}"
            DOMAIN_ADMIN="admin.${BASE_DOMAIN}"
            DOMAIN_FRONTEND="${BASE_DOMAIN}"

            echo -e "\n${GREEN}[+] Dominios pre-configurados:${NC}"
            echo -e "    • Backend API:   ${WHITE}$DOMAIN_BACKEND${NC}"
            echo -e "    • Painel Admin:  ${WHITE}$DOMAIN_ADMIN${NC}"
            echo -e "    • Loja/Frontend: ${WHITE}$DOMAIN_FRONTEND${NC}"

            read -p "Deseja personalizar algum desses subdominios? [s/N]: " CUSTOMIZE_SUB
            if [[ "$CUSTOMIZE_SUB" =~ ^[Ss]$ ]]; then
                read -p "Dominio Backend API [$DOMAIN_BACKEND]: " NEW_BACK
                [ -n "$NEW_BACK" ] && DOMAIN_BACKEND=$(echo "$NEW_BACK" | sed -e 's|^https*://||' -e 's|/.*||' | tr -d ' ')
                read -p "Dominio Painel Admin [$DOMAIN_ADMIN]: " NEW_ADMIN
                [ -n "$NEW_ADMIN" ] && DOMAIN_ADMIN=$(echo "$NEW_ADMIN" | sed -e 's|^https*://||' -e 's|/.*||' | tr -d ' ')
                read -p "Dominio Loja/Frontend [$DOMAIN_FRONTEND]: " NEW_FRONT
                [ -n "$NEW_FRONT" ] && DOMAIN_FRONTEND=$(echo "$NEW_FRONT" | sed -e 's|^https*://||' -e 's|/.*||' | tr -d ' ')
            fi
            ;;
        2)
            echo ""
            read -p "Dominio do Backend / API (ex: api.meusistema.com): " IN_BACK
            DOMAIN_BACKEND=$(echo "$IN_BACK" | sed -e 's|^https*://||' -e 's|/.*||' | tr -d ' ')
            if [ -z "$DOMAIN_BACKEND" ]; then
                echo -e "${RED}[X] O dominio do Backend e obrigatorio.${NC}"
                read -p "Pressione [Enter] para voltar..."
                return
            fi

            read -p "Dominio do Painel Admin (ex: admin.meusistema.com) [Opcional]: " IN_ADMIN
            DOMAIN_ADMIN=$(echo "$IN_ADMIN" | sed -e 's|^https*://||' -e 's|/.*||' | tr -d ' ')
            [ -z "$DOMAIN_ADMIN" ] && DOMAIN_ADMIN="admin.azun.com.br"

            read -p "Dominio do Frontend / Loja (ex: meusistema.com) [Opcional]: " IN_FRONT
            DOMAIN_FRONTEND=$(echo "$IN_FRONT" | sed -e 's|^https*://||' -e 's|/.*||' | tr -d ' ')
            [ -z "$DOMAIN_FRONTEND" ] && DOMAIN_FRONTEND="_"
            ;;
        3)
            echo ""
            read -p "Dominio do Backend / API (ex: api.meusistema.com): " IN_BACK
            DOMAIN_BACKEND=$(echo "$IN_BACK" | sed -e 's|^https*://||' -e 's|/.*||' | tr -d ' ')
            if [ -z "$DOMAIN_BACKEND" ]; then
                echo -e "${RED}[X] O dominio do Backend e obrigatorio.${NC}"
                read -p "Pressione [Enter] para voltar..."
                return
            fi
            DOMAIN_ADMIN="admin.azun.com.br"
            DOMAIN_FRONTEND="_"
            ;;
        *)
            return
            ;;
    esac

    PRIMARY_SSL_DOMAIN="$DOMAIN_BACKEND"

    echo -e "\n${CYAN}------------------------------------------------------------------------------${NC}"
    echo -e "${YELLOW}[+] Instalacao de Certificado SSL Gratuito (HTTPS / Let's Encrypt)${NC}"
    echo -e "Para que o certificado seja emitido com sucesso:"
    echo -e "Os dominios devem apontar o DNS (Registro Tipo A) para o IP: ${WHITE}$SERVER_IP${NC}\n"

    read -p "Deseja emitir e instalar o Certificado SSL agora? [S/n]: " INSTALL_SSL
    INSTALL_SSL=${INSTALL_SSL:-S}

    CERT_INSTALLED=false

    if [[ "$INSTALL_SSL" =~ ^[Ss]$ ]]; then
        read -p "Digite seu e-mail para registro do Certificado Let's Encrypt: " SSL_EMAIL
        while [ -z "$SSL_EMAIL" ]; do
            read -p "E-mail obrigatorio para notificacoes SSL: " SSL_EMAIL
        done

        # Instala Certbot no host se ausente
        if ! command -v certbot &>/dev/null; then
            echo -e "\n${YELLOW}[+] Instalando pacote Certbot no sistema hospedeiro...${NC}"
            if [ -f /etc/debian_version ]; then
                apt-get update && apt-get install -y certbot
            elif [ -f /etc/redhat-release ]; then
                yum install -y epel-release 2>/dev/null || true
                yum install -y certbot
            fi
        fi

        # Monta lista de argumentos de dominios para certbot
        CERTBOT_DOMAINS="-d $DOMAIN_BACKEND"
        if [ "$DOMAIN_ADMIN" != "admin.azun.com.br" ] && [ -n "$DOMAIN_ADMIN" ]; then
            CERTBOT_DOMAINS="$CERTBOT_DOMAINS -d $DOMAIN_ADMIN"
        fi
        if [ "$DOMAIN_FRONTEND" != "_" ] && [ -n "$DOMAIN_FRONTEND" ]; then
            CERTBOT_DOMAINS="$CERTBOT_DOMAINS -d $DOMAIN_FRONTEND"
        fi

        echo -e "\n${YELLOW}[+] Solicitando certificado SSL para: ${WHITE}$CERTBOT_DOMAINS${NC}..."

        # Garante que o proxy esta respondendo na porta 80 para o desafio webroot
        $COMPOSE_CMD up -d proxy 2>/dev/null || true

        # Metodo 1: Webroot (sem parar o proxy)
        if certbot certonly --webroot -w /var/www/certbot $CERTBOT_DOMAINS --email "$SSL_EMAIL" --agree-tos --non-interactive --keep-until-expiring 2>/dev/null; then
            echo -e "${GREEN}[✓] Certificado SSL emitido com sucesso via Webroot!${NC}"
            CERT_INSTALLED=true
        else
            echo -e "${YELLOW}[!] Metodo Webroot falhou. Alternando para Standalone (parando proxy temporariamente)...${NC}"
            $COMPOSE_CMD stop proxy 2>/dev/null || true
            if certbot certonly --standalone $CERTBOT_DOMAINS --email "$SSL_EMAIL" --agree-tos --non-interactive --keep-until-expiring; then
                echo -e "${GREEN}[✓] Certificado SSL emitido com sucesso via Standalone!${NC}"
                CERT_INSTALLED=true
            else
                echo -e "${RED}[X] Falha ao emitir certificado SSL.${NC}"
                echo -e "${RED}    Verifique se o DNS de $CERTBOT_DOMAINS ja aponta para o IP $SERVER_IP.${NC}"
            fi
            $COMPOSE_CMD start proxy 2>/dev/null || true
        fi
    fi

    # 3. Gerar arquivo de configuracao do Nginx (proxy/nginx.conf)
    echo -e "\n${YELLOW}[+] Gerando arquivo '$PROXY_DIR/nginx.conf' otimizado...${NC}"
    mkdir -p "$PROXY_DIR"
    [ -f "$PROXY_DIR/nginx.conf" ] && cp "$PROXY_DIR/nginx.conf" "$PROXY_DIR/nginx.conf.bak_$(date +%Y%m%d_%H%M%S)"

    # Verifica se os arquivos do certificado existem
    CERT_FILE="/etc/letsencrypt/live/$PRIMARY_SSL_DOMAIN/fullchain.pem"
    KEY_FILE="/etc/letsencrypt/live/$PRIMARY_SSL_DOMAIN/privkey.pem"

    if [ "$CERT_INSTALLED" = true ] || [ -f "$CERT_FILE" ]; then
        echo -e "${GREEN}[+] Aplicando configuracao HTTPS com Certificados SSL ativos.${NC}"
        
        cat << NGINX_CONF_EOF > "$PROXY_DIR/nginx.conf"
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    server_tokens off;

    # Otimizacoes de Desempenho e Limite de Upload
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    client_max_body_size 50M;

    # Compressao Gzip
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;

    # DNS Interno do Docker (Permite resolver containers dinamicamente)
    resolver 127.0.0.11 valid=15s ipv6=off;

    # ==============================================================================
    # 1. REDIRECIONAMENTO HTTP -> HTTPS (PORTA 80)
    # ==============================================================================
    server {
        listen 80;
        server_name $DOMAIN_BACKEND $DOMAIN_ADMIN $DOMAIN_FRONTEND;

        # Desafio Let's Encrypt para renovacao automatica
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 301 https://$host$request_uri;
        }
    }

    # ==============================================================================
    # 2. BACKEND / API (NODE.JS + PHP CLI + WEBSOCKETS) - HTTPS
    # ==============================================================================
    server {
        listen 443 ssl;
        http2 on;
        server_name $DOMAIN_BACKEND;

        ssl_certificate /etc/letsencrypt/live/$PRIMARY_SSL_DOMAIN/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/$PRIMARY_SSL_DOMAIN/privkey.pem;

        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;
        ssl_session_cache shared:SSL_BACK:10m;
        ssl_session_timeout 1d;

        location / {
            set $backend_upstream http://backend:5000;
            proxy_pass $backend_upstream;

            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;

            proxy_connect_timeout 15s;
            proxy_read_timeout 300s;
            proxy_send_timeout 300s;
        }
    }

    # ==============================================================================
    # 3. PAINEL ADMINISTRATIVO (ADMIN) - HTTPS
    # ==============================================================================
    server {
        listen 443 ssl;
        http2 on;
        server_name $DOMAIN_ADMIN;

        ssl_certificate /etc/letsencrypt/live/$PRIMARY_SSL_DOMAIN/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/$PRIMARY_SSL_DOMAIN/privkey.pem;

        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;
        ssl_session_cache shared:SSL_ADM:10m;
        ssl_session_timeout 1d;

        location / {
            set $admin_upstream http://admin-app:80;
            proxy_pass $admin_upstream;

            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;

            proxy_connect_timeout 10s;
            proxy_read_timeout 120s;
        }
    }

    # ==============================================================================
    # 4. FRONTEND / CLIENTES / TENANTS - HTTPS
    # ==============================================================================
    server {
        listen 443 ssl default_server;
        http2 on;
        server_name $DOMAIN_FRONTEND;

        ssl_certificate /etc/letsencrypt/live/$PRIMARY_SSL_DOMAIN/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/$PRIMARY_SSL_DOMAIN/privkey.pem;

        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;
        ssl_session_cache shared:SSL_FRONT:10m;
        ssl_session_timeout 1d;

        location /api/public/render-og {
            set $backend_upstream http://backend:5000;
            proxy_pass $backend_upstream;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;
        }

        location / {
            set $frontend_upstream http://frontend-app:80;
            proxy_pass $frontend_upstream;

            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;

            proxy_connect_timeout 10s;
            proxy_read_timeout 120s;
        }
    }
}
NGINX_CONF_EOF

    else
        echo -e "${YELLOW}[+] Aplicando configuracao HTTP padrao (Porta 80).${NC}"
        
        cat << NGINX_CONF_EOF > "$PROXY_DIR/nginx.conf"
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    server_tokens off;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    client_max_body_size 50M;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;

    resolver 127.0.0.11 valid=15s ipv6=off;

    # 1. ADMIN
    server {
        listen 80;
        server_name $DOMAIN_ADMIN;

        location / {
            set $admin_upstream http://admin-app:80;
            proxy_pass $admin_upstream;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 10s;
            proxy_read_timeout 120s;
        }

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
    }

    # 2. BACKEND / API
    server {
        listen 80;
        server_name $DOMAIN_BACKEND;

        location / {
            set $backend_upstream http://backend:5000;
            proxy_pass $backend_upstream;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 15s;
            proxy_read_timeout 300s;
            proxy_send_timeout 300s;
        }

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
    }

    # 3. FRONTEND / CLIENTES
    server {
        listen 80 default_server;
        server_name $DOMAIN_FRONTEND;

        location /api/public/render-og {
            set $backend_upstream http://backend:5000;
            proxy_pass $backend_upstream;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location / {
            set $frontend_upstream http://frontend-app:80;
            proxy_pass $frontend_upstream;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 10s;
            proxy_read_timeout 120s;
        }

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
    }
}
NGINX_CONF_EOF
    fi

    # 4. Atualizar variaveis de ambiente no backend/.env
    PROTO="http"
    if [ "$CERT_INSTALLED" = true ] || [ -f "$CERT_FILE" ]; then
        PROTO="https"
    fi

    if [ -f "$BACKEND_DIR/.env" ]; then
        echo -e "\n${YELLOW}[+] Sincronizando variaveis de ambiente em '$BACKEND_DIR/.env'...${NC}"
        
        # BACKEND_URL
        if grep -q "^BACKEND_URL=" "$BACKEND_DIR/.env"; then
            sed -i "s|^BACKEND_URL=.*|BACKEND_URL=${PROTO}://${DOMAIN_BACKEND}|" "$BACKEND_DIR/.env"
        else
            echo "BACKEND_URL=${PROTO}://${DOMAIN_BACKEND}" >> "$BACKEND_DIR/.env"
        fi

        # ADMIN_URL
        if grep -q "^ADMIN_URL=" "$BACKEND_DIR/.env"; then
            sed -i "s|^ADMIN_URL=.*|ADMIN_URL=${PROTO}://${DOMAIN_ADMIN}|" "$BACKEND_DIR/.env"
        else
            echo "ADMIN_URL=${PROTO}://${DOMAIN_ADMIN}" >> "$BACKEND_DIR/.env"
        fi

        # FRONTEND_URL
        if [ "$DOMAIN_FRONTEND" != "_" ]; then
            if grep -q "^FRONTEND_URL=" "$BACKEND_DIR/.env"; then
                sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=${PROTO}://${DOMAIN_FRONTEND}|" "$BACKEND_DIR/.env"
            else
                echo "FRONTEND_URL=${PROTO}://${DOMAIN_FRONTEND}" >> "$BACKEND_DIR/.env"
            fi
        fi

        echo -e "${GREEN}[✓] Arquivo '$BACKEND_DIR/.env' atualizado com as novas URLs!${NC}"
    fi

    # 5. Reiniciar Proxy Nginx e Backend
    echo -e "\n${YELLOW}[+] Aplicando e reiniciando Proxy Nginx e Backend...${NC}"
    $COMPOSE_CMD up -d --no-deps proxy backend
    $COMPOSE_CMD restart proxy

    # 6. Agendar renovacao automatica no Cron
    if [ "$CERT_INSTALLED" = true ] || [ -f "$CERT_FILE" ]; then
        RENEW_CRON="/etc/cron.d/certbot-azun-renew"
        echo -e "\n${YELLOW}[+] Agendando renovacao automatica do SSL em $RENEW_CRON...${NC}"
        cat << 'CRON_EOF' > "$RENEW_CRON"
0 3 * * * root certbot renew --quiet --deploy-hook "docker exec azun_proxy nginx -s reload 2>/dev/null || docker compose restart proxy 2>/dev/null || true"
CRON_EOF
        chmod 644 "$RENEW_CRON" 2>/dev/null || true
        echo -e "${GREEN}[✓] Renovacao automatica ativada para rodar diariamente as 03:00!${NC}"
    fi

    echo -e "\n${GREEN}==============================================================================${NC}"
    echo -e "${GREEN}       [SUCESSO] NGINX E DOMINIOS CONFIGURADOS COM EXCELENCIA!                ${NC}"
    echo -e "${GREEN}==============================================================================${NC}"
    echo -e "${WHITE}  • API Backend:${NC}       ${PROTO}://${DOMAIN_BACKEND}"
    echo -e "${WHITE}  • Painel Admin:${NC}      ${PROTO}://${DOMAIN_ADMIN}"
    echo -e "${WHITE}  • Loja / Frontend:${NC}   ${PROTO}://${DOMAIN_FRONTEND}"
    if [ "$CERT_INSTALLED" = true ] || [ -f "$CERT_FILE" ]; then
        echo -e "${WHITE}  • Certificado SSL:${NC}   ${GREEN}ATIVO (HTTPS Seguro / Let's Encrypt)${NC}"
        echo -e "${WHITE}  • Renovacao Cron:${NC}    Ativa (Certificados renovam automaticamente)"
    else
        echo -e "${WHITE}  • Certificado SSL:${NC}   ${YELLOW}HTTP Padrao (Porta 80)${NC}"
    fi
    echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
    read -p "Pressione [Enter] para voltar ao menu principal..."
}

# 8. FAZER BACKUP MANUAL DO BANCO DE DADOS
manual_backup() {
    header
    echo -e "${WHITE}--- [8] FAZER BACKUP MANUAL DO BANCO DE DADOS MYSQL ---${NC}\n"
    mkdir -p "$BASE_DIR/backups"
    BACKUP_FILE="$BASE_DIR/backups/backup_azun_$(date +%Y%m%d_%H%M%S).sql.gz"

    echo -e "${YELLOW}[+] Extraindo dados do MySQL com compressao Gzip...${NC}"
    docker exec azun_mysql mysqldump -u root -pGd1700al@@ --single-transaction --quick ecommerce_db | gzip > "$BACKUP_FILE"

    if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
        SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        echo -e "\n${GREEN}[✓] BACKUP CONCLUIDO COM SUCESSO!${NC}"
        echo -e "${WHITE}  • Arquivo:${NC} $BACKUP_FILE"
        echo -e "${WHITE}  • Tamanho:${NC} $SIZE"
    else
        echo -e "\n${RED}[X] Erro ao gerar backup. Verifique se o container 'azun_mysql' esta em execucao.${NC}"
    fi
    echo -e "\n${CYAN}------------------------------------------------------------------------------${NC}"
    read -p "Pressione [Enter] para continuar..."
}

# 9. RESTAURAR BACKUP DO BANCO DE DADOS
restore_backup() {
    header
    echo -e "${WHITE}--- [9] RESTAURAR BACKUP DO BANCO DE DADOS MYSQL ---${NC}\n"
    
    if [ ! -d "$BASE_DIR/backups" ] || [ -z "$(ls -A "$BASE_DIR/backups"/*.sql.gz 2>/dev/null)" ]; then
        echo -e "${RED}[!] Nenhum arquivo de backup (.sql.gz) encontrado na pasta '$BASE_DIR/backups'.${NC}"
        read -p "Pressione [Enter] para voltar..."
        return
    fi

    echo -e "${YELLOW}Backups disponiveis:${NC}"
    ls -lh "$BASE_DIR/backups"/*.sql.gz
    echo ""
    read -p "Digite o caminho completo ou o nome do arquivo para restaurar: " RESTORE_TARGET

    if [ ! -f "$RESTORE_TARGET" ] && [ -f "$BASE_DIR/backups/$RESTORE_TARGET" ]; then
        RESTORE_TARGET="$BASE_DIR/backups/$RESTORE_TARGET"
    fi

    if [ ! -f "$RESTORE_TARGET" ]; then
        echo -e "${RED}[X] Arquivo nao encontrado: $RESTORE_TARGET${NC}"
        read -p "Pressione [Enter] para voltar..."
        return
    fi

    echo -e "${RED}⚠️  ATENCAO: Isso sobrescrevera os dados atuais no banco de dados!${NC}"
    read -p "Tem certeza absoluta que deseja restaurar este backup? [s/N]: " CONFIRM
    if [[ "$CONFIRM" =~ ^[Ss]$ ]]; then
        echo -e "\n${YELLOW}[+] Restaurando dados...${NC}"
        gunzip < "$RESTORE_TARGET" | docker exec -i azun_mysql mysql -u root -pGd1700al@@ ecommerce_db
        echo -e "${GREEN}[✓] Banco de dados restaurado com sucesso!${NC}"
    else
        echo -e "${YELLOW}[!] Operacao de restauracao cancelada.${NC}"
    fi
    read -p "Pressione [Enter] para continuar..."
}

# 10. DESINSTALAR TUDO (REMOVER CONTAINERS, REDES E LIBERAR PORTAS)
uninstall_all() {
    header
    echo -e "${RED}==============================================================================${NC}"
    echo -e "${RED}       [10] ATENCAO: DESINSTALACAO TOTAL DO SISTEMA AZUN DA VPS              ${NC}"
    echo -e "${RED}==============================================================================${NC}\n"
    
    COMPOSE_CMD=$(get_compose_cmd)

    echo -e "${YELLOW}Esta operacao ira:${NC}"
    echo -e "  • Parar e remover todos os containers Docker (Backend, MySQL, Proxy, PHPMyAdmin, Frontend)"
    echo -e "  • Remover a rede interna 'azun_network'"
    echo -e "  • Remover os agendamentos de renovacao automatica SSL do Cron (/etc/cron.d/certbot-azun-renew)"
    echo -e "  • Liberar todas as portas do servidor (80, 443, 3307, 5005, 8081)"
    echo -e ""

    # Pergunta sobre backup previo de seguranca
    read -p "Deseja gerar um backup de seguranca do banco de dados antes de desinstalar? [S/n]: " DO_BK
    DO_BK=${DO_BK:-S}
    if [[ "$DO_BK" =~ ^[Ss]$ ]]; then
        make_backup_silent
    fi

    echo -e "\n${YELLOW}O que deseja fazer com o volume de dados do Banco MySQL (azun_mysql_data)?${NC}"
    echo -e "  ${GREEN}[1] Manter os dados do banco intactos${NC} (Recomendado se for reinstalar depois)"
    echo -e "  ${RED}[2] Apagar TODOS os dados do banco MySQL${NC} (Limpeza total / Reset de fabrica)"
    read -p "Escolha [1/2]: " VOL_CHOICE

    echo -e "\n${RED}Para confirmar a desinstalacao, digite 'DELETAR' em maiusculas:${NC}"
    read -p "Confirmacao: " CONFIRM_TXT
    if [ "$CONFIRM_TXT" != "DELETAR" ]; then
        echo -e "\n${YELLOW}[!] Desinstalacao cancelada pelo usuario.${NC}"
        read -p "Pressione [Enter] para voltar ao menu..."
        return
    fi

    echo -e "\n${YELLOW}[+] 1/4: Encerrando e removendo containers Docker...${NC}"
    if [ -n "$COMPOSE_CMD" ] && [ -f "$COMPOSE_FILE" ]; then
        if [ "$VOL_CHOICE" = "2" ]; then
            $COMPOSE_CMD down -v --remove-orphans 2>/dev/null || true
        else
            $COMPOSE_CMD down --remove-orphans 2>/dev/null || true
        fi
    fi

    # Limpeza forcada de containers residuais por seguranca
    echo -e "${YELLOW}[+] 2/4: Limpando containers da Azun...${NC}"
    docker rm -f azun_backend azun_mysql azun_proxy azun_phpmyadmin azun_admin_frontend azun_client_frontend 2>/dev/null || true

    # Remove rede
    echo -e "${YELLOW}[+] 3/4: Removendo rede 'azun_network'...${NC}"
    docker network rm azun_network 2>/dev/null || true

    # Remove volume se solicitado
    if [ "$VOL_CHOICE" = "2" ]; then
        docker volume rm azun_mysql_data 2>/dev/null || true
        echo -e "${RED}[✓] Volume de banco de dados azun_mysql_data removido.${NC}"
    fi

    # Remove agendamento cron
    echo -e "${YELLOW}[+] 4/4: Removendo agendamentos do Cron...${NC}"
    rm -f /etc/cron.d/certbot-azun-renew 2>/dev/null || true

    # Pergunta sobre imagens
    echo -e ""
    read -p "Deseja remover tambem as imagens Docker locais para liberar espaco em disco? [s/N]: " RM_IMG
    if [[ "$RM_IMG" =~ ^[Ss]$ ]]; then
        echo -e "${YELLOW}[+] Removendo imagens Docker...${NC}"
        docker rmi -f azun_backend azun_proxy azun_admin_frontend azun_client_frontend 2>/dev/null || true
        docker image prune -f 2>/dev/null || true
        echo -e "${GREEN}[✓] Imagens Docker removidas!${NC}"
    fi

    echo -e "\n${GREEN}==============================================================================${NC}"
    echo -e "${GREEN}             [SUCESSO] DESINSTALACAO CONCLUIDA COM EXITO!                     ${NC}"
    echo -e "${GREEN}==============================================================================${NC}"
    echo -e "${WHITE}  • Todos os servicos foram encerrados e removidos do Docker.${NC}"
    echo -e "${WHITE}  • As portas 80, 443, 3307, 5005 e 8081 estao agora 100% livres.${NC}"
    if [ "$VOL_CHOICE" = "1" ]; then
        echo -e "${GREEN}  • Seus dados do MySQL foram PRESERVADOS no volume 'azun_mysql_data'.${NC}"
    else
        echo -e "${RED}  • Todos os dados do banco foram apagados conforme solicitado.${NC}"
    fi
    echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
    read -p "Pressione [Enter] para continuar..."
}

# ==============================================================================
# MENU PRINCIPAL INTERATIVO
# ==============================================================================
while true; do
    header
    echo -e "${WHITE}Selecione a opcao desejada:${NC}"
    echo -e ""
    echo -e "  ${GREEN}[1]${NC} ${WHITE}Instalar Backend + Banco de Dados + Proxy (Instalacao Inicial)${NC}"
    echo -e "  ${CYAN}[2]${NC} ${WHITE}Atualizar Versao do Backend (Git Pull + Rebuild + Migrations)${NC}"
    echo -e ""
    echo -e "  ${PURPLE}[3]${NC} ${WHITE}Instalar / Ativar Frontend e Admin (Quando estiver pronto)${NC}"
    echo -e "  ${PURPLE}[4]${NC} ${WHITE}Atualizar Frontend e Admin (Git Pull + Rebuild)${NC}"
    echo -e ""
    echo -e "  ${BLUE}[5]${NC} Ver Status e Logs dos Servicos (Tempo Real)"
    echo -e "  ${YELLOW}[6]${NC} Gerenciar Estado (Reiniciar / Parar / Iniciar Servicos)"
    echo -e ""
    echo -e "  ${GREEN}[7]${NC} ${WHITE}Configurar Nginx (Dominios & Certificado SSL Let's Encrypt)${NC}"
    echo -e "  ${CYAN}[8]${NC} Fazer Backup Manual do Banco de Dados MySQL"
    echo -e "  ${RED}[9]${NC} Restaurar Backup do Banco de Dados MySQL"
    echo -e ""
    echo -e "  ${RED}[10]${NC} ${WHITE}Desinstalar Tudo (Limpar Containers, Redes e Liberar Portas)${NC}"
    echo -e ""
    echo -e "  ${WHITE}[0]${NC} Sair"
    echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
    read -p "Digite o numero da opcao: " MENU_OPTION

    case $MENU_OPTION in
        1) install_backend ;;
        2) update_backend ;;
        3) install_frontend ;;
        4) update_frontend ;;
        5) view_logs ;;
        6) manage_services ;;
        7) configure_nginx_domains_ssl ;;
        8) manual_backup ;;
        9) restore_backup ;;
        10) uninstall_all ;;
        0) 
            echo -e "\n${GREEN}[✓] Saindo do instalador. O sistema continua rodando em background no Docker.${NC}\n"
            exit 0 
            ;;
        *) 
            echo -e "${RED}[X] Opcao invalida. Pressione Enter para tentar novamente.${NC}"
            sleep 1
            ;;
    esac
done
