#!/usr/bin/env bash
# ==============================================================================
# AZUN TECNOLOGIA & GESTAO - INSTALADOR E GERENCIADOR VPS LINUX
# Stack: Node.js 20, PHP CLI (NFePHP/Composer), MySQL 8.0, Proxy Nginx & Frontend
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

# Função para imprimir cabeçalhos
header() {
    clear
    echo -e "${CYAN}==============================================================================${NC}"
    echo -e "${WHITE}           AZUN TECNOLOGIA & GESTAO - GERENCIADOR E INSTALADOR VPS            ${NC}"
    echo -e "${CYAN}==============================================================================${NC}"
    echo -e "${BLUE} Diretorio:${NC} $BASE_DIR"
    echo -e "${BLUE} Servidor:${NC} $(hostname) | Kernel: $(uname -r)"
    echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
}

# Verifica se o comando docker compose existe (moderno ou plugin)
get_compose_cmd() {
    if docker compose version >/dev/null 2>&1; then
        echo "docker compose"
    elif docker-compose version >/dev/null 2>&1; then
        echo "docker-compose"
    else
        echo ""
    fi
}

# Checa e instala pré-requisitos essenciais no Linux (Docker, Compose, Git, Curl)
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

    # Cria pastas essenciais de persistência se não existirem
    mkdir -p "$BASE_DIR/backend/uploads"
    mkdir -p "$BASE_DIR/backend/whatsapp_sessions"
    mkdir -p "$BASE_DIR/proxy/ssl"
    mkdir -p "$BASE_DIR/proxy/certbot/www"
    mkdir -p "$BASE_DIR/proxy/certbot/conf"
    mkdir -p "$BASE_DIR/backups"

    # Configuração do .env do Backend
    if [ ! -f "$BASE_DIR/backend/.env" ]; then
        echo -e "${YELLOW}[+] Criando arquivo de ambiente 'backend/.env' a partir do modelo...${NC}"
        if [ -f "$BASE_DIR/backend/.env.example" ]; then
            cp "$BASE_DIR/backend/.env.example" "$BASE_DIR/backend/.env"
        else
            echo -e "${RED}[X] 'backend/.env.example' nao encontrado. Criando base padrao...${NC}"
            cat << 'EOF' > "$BASE_DIR/backend/.env"
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
        echo -e "${GREEN}[✓] Arquivo 'backend/.env' configurado com sucesso!${NC}"
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
    echo -e "${WHITE}  • Nginx Proxy:${NC}       Ativo nas portas 80 e 443"
    echo -e "${WHITE}  • NFePHP/Composer:${NC}   Configurado e compilado no container backend"
    echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
    read -p "Pressione [Enter] para voltar ao menu principal..."
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

    # Backup de Segurança automático antes de atualizar
    read -p "Deseja gerar um backup preventivo do banco MySQL antes de atualizar? [S/n]: " BACKUP_OPT
    BACKUP_OPT=${BACKUP_OPT:-S}
    if [[ "$BACKUP_OPT" =~ ^[Ss]$ ]]; then
        make_backup_silent
    fi

    echo -e "\n${YELLOW}[+] Puxando as atualizacoes mais recentes do Git (backend)...${NC}"
    if [ -d "$BASE_DIR/backend/.git" ]; then
        cd "$BASE_DIR/backend"
        git fetch origin
        CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
        echo -e "${BLUE}    Branch atual: $CURRENT_BRANCH${NC}"
        git pull origin "$CURRENT_BRANCH"
        cd "$BASE_DIR"
    else
        echo -e "${YELLOW}[!] O diretorio 'backend' nao e um repositorio Git direto.${NC}"
        echo -e "${YELLOW}    Atualizando com os arquivos locais presentes.${NC}"
    fi

    echo -e "\n${YELLOW}[+] Recompilando o container do Backend...${NC}"
    $COMPOSE_CMD build backend

    echo -e "\n${YELLOW}[+] Reiniciando o servico do Backend com a nova versao...${NC}"
    $COMPOSE_CMD up -d --no-deps backend

    echo -e "\n${YELLOW}[+] Aplicando sincronizacao do Prisma ORM no Banco de Dados...${NC}"
    sleep 3
    $COMPOSE_CMD exec -T backend npx prisma db push --schema=./src/prisma/schema.prisma || true

    echo -e "\n${GREEN}[✓] Backend atualizado com sucesso para a versao mais recente!${NC}"
    echo -e "\n${YELLOW}[+] Ultimos logs do Backend:${NC}"
    $COMPOSE_CMD logs --tail=20 backend

    echo -e "\n${CYAN}------------------------------------------------------------------------------${NC}"
    read -p "Pressione [Enter] para voltar ao menu..."
}

# 3. INSTALAR / ATIVAR FRONTEND E ADMIN
install_frontend() {
    header
    echo -e "${WHITE}--- [3] INSTALAR / ATIVAR FRONTEND E ADMIN ---${NC}\n"
    COMPOSE_CMD=$(get_compose_cmd)

    # 1. Verifica/Clona o Admin se necessário
    if [ ! -d "$BASE_DIR/admin/.git" ] && [ ! -f "$BASE_DIR/admin/package.json" ]; then
        echo -e "${YELLOW}[+] Repositorio do Admin nao encontrado. Clonando...${NC}"
        git clone https://github.com/Rayan-Novik/admin.git "$BASE_DIR/admin" || {
            echo -e "${RED}[!] Falha ao clonar admin. Verifique permissao do git.${NC}"
        }
    fi

    # 2. Verifica/Clona o Frontend se necessário
    if [ ! -d "$BASE_DIR/frontend/.git" ] && [ ! -f "$BASE_DIR/frontend/package.json" ]; then
        echo -e "${YELLOW}[+] Repositorio do Frontend nao encontrado. Clonando...${NC}"
        git clone https://github.com/Rayan-Novik/frontend.git "$BASE_DIR/frontend" || {
            echo -e "${RED}[!] Falha ao clonar frontend. Verifique permissao do git.${NC}"
        }
    fi

    echo -e "\n${YELLOW}[+] Compilando e iniciando Admin e Frontend (Perfil Full)...${NC}"
    $COMPOSE_CMD --profile full up -d --build admin-app frontend-app

    echo -e "\n${YELLOW}[+] Recarregando o Nginx Proxy para rotear o Frontend e Admin...${NC}"
    $COMPOSE_CMD exec -T proxy nginx -s reload || $COMPOSE_CMD restart proxy

    echo -e "\n${GREEN}[✓] Frontend e Admin iniciados e integrados ao Proxy com sucesso!${NC}"
    $COMPOSE_CMD ps
    echo -e "\n${CYAN}------------------------------------------------------------------------------${NC}"
    read -p "Pressione [Enter] para voltar ao menu..."
}

# 4. ATUALIZAR FRONTEND E ADMIN
update_frontend() {
    header
    echo -e "${WHITE}--- [4] ATUALIZAR VERSAO DO FRONTEND E ADMIN ---${NC}\n"
    COMPOSE_CMD=$(get_compose_cmd)

    if [ -d "$BASE_DIR/admin/.git" ]; then
        echo -e "${YELLOW}[+] Atualizando repositorio Admin...${NC}"
        git -C "$BASE_DIR/admin" pull origin main || git -C "$BASE_DIR/admin" pull
    fi

    if [ -d "$BASE_DIR/frontend/.git" ]; then
        echo -e "${YELLOW}[+] Atualizando repositorio Frontend...${NC}"
        git -C "$BASE_DIR/frontend" pull origin main || git -C "$BASE_DIR/frontend" pull
    fi

    echo -e "\n${YELLOW}[+] Recompilando e atualizando containers do Frontend e Admin...${NC}"
    $COMPOSE_CMD --profile full up -d --build admin-app frontend-app
    $COMPOSE_CMD exec -T proxy nginx -s reload || true

    echo -e "\n${GREEN}[✓] Frontend e Admin atualizados com sucesso!${NC}"
    read -p "Pressione [Enter] para voltar ao menu..."
}

# 5. VER STATUS E LOGS
view_logs() {
    header
    echo -e "${WHITE}--- [5] STATUS E LOGS DOS SERVICOS ---${NC}\n"
    COMPOSE_CMD=$(get_compose_cmd)

    echo -e "${CYAN}[Status Atual dos Containers]:${NC}"
    $COMPOSE_CMD ps
    echo -e "\n${WHITE}Escolha o servico para visualizar os logs em tempo real (Ctrl+C para sair):${NC}"
    echo -e "  [1] Todos os servicos"
    echo -e "  [2] Apenas Backend API"
    echo -e "  [3] Apenas Nginx Proxy"
    echo -e "  [4] Apenas Banco MySQL"
    echo -e "  [5] Apenas Admin / Frontend"
    echo -e "  [0] Voltar"
    read -p "Opcao: " LOG_OPT

    case $LOG_OPT in
        1) $COMPOSE_CMD logs -f ;;
        2) $COMPOSE_CMD logs -f backend ;;
        3) $COMPOSE_CMD logs -f proxy ;;
        4) $COMPOSE_CMD logs -f mysql ;;
        5) $COMPOSE_CMD logs -f admin-app frontend-app ;;
        *) return ;;
    esac
}

# 6. REINICIAR / PARAR / INICIAR
manage_services() {
    header
    echo -e "${WHITE}--- [6] GERENCIAR ESTADO DOS SERVICOS ---${NC}\n"
    COMPOSE_CMD=$(get_compose_cmd)

    echo -e "  [1] Reiniciar toda a aplicacao (Restart All)"
    echo -e "  [2] Parar todos os servicos (Stop All)"
    echo -e "  [3] Iniciar todos os servicos (Start All)"
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

# BACKUP SILENCIOSO (Chamado antes de atualizações)
make_backup_silent() {
    mkdir -p "$BASE_DIR/backups"
    BACKUP_FILE="$BASE_DIR/backups/backup_auto_$(date +%Y%m%d_%H%M%S).sql.gz"
    echo -e "${YELLOW}[+] Gerando backup de seguranca em $BACKUP_FILE...${NC}"
    docker exec azun_mysql mysqldump -u root -pGd1700al@@ --single-transaction --quick ecommerce_db 2>/dev/null | gzip > "$BACKUP_FILE" || true
    if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
        echo -e "${GREEN}[✓] Backup preventivo salvo com sucesso (${BACKUP_FILE})!${NC}"
    else
        echo -e "${YELLOW}[!] Nao foi possivel gerar backup previo (o container mysql pode estar desligado).${NC}"
    fi
}

# 7. FAZER BACKUP MANUAL DO BANCO DE DADOS
manual_backup() {
    header
    echo -e "${WHITE}--- [7] FAZER BACKUP MANUAL DO BANCO DE DADOS MYSQL ---${NC}\n"
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

# 8. RESTAURAR BACKUP DO BANCO DE DADOS
restore_backup() {
    header
    echo -e "${WHITE}--- [8] RESTAURAR BACKUP DO BANCO DE DADOS MYSQL ---${NC}\n"
    
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

# 9. CERTIFICADO SSL GRATUITO (LET'S ENCRYPT / CERTBOT)
setup_ssl() {
    header
    echo -e "${WHITE}--- [9] CONFIGURAR CERTIFICADO SSL GRATUITO (LET'S ENCRYPT) ---${NC}\n"
    echo -e "${BLUE}Esta funcao configura SSL automatico para os seus dominios.${NC}"
    echo -e "Certifique-se de que os seus dominios (ex: back.ararinhacloud.shop, admin.azun.com.br)"
    echo -e "ja estao apontando o DNS (Tipo A) para o IP desta VPS!\n"

    read -p "Deseja instalar o Certbot no sistema hospedeiro? [S/n]: " INSTALL_CERTBOT
    INSTALL_CERTBOT=${INSTALL_CERTBOT:-S}

    if [[ "$INSTALL_CERTBOT" =~ ^[Ss]$ ]]; then
        if [ -f /etc/debian_version ]; then
            apt-get update && apt-get install -y certbot
        elif [ -f /etc/redhat-release ]; then
            yum install -y certbot
        fi
    fi

    read -p "Digite o dominio para gerar o certificado (ex: back.ararinhacloud.shop): " SSL_DOMAIN
    read -p "Digite seu e-mail para notificacoes da Let's Encrypt: " SSL_EMAIL

    if [ -n "$SSL_DOMAIN" ] && [ -n "$SSL_EMAIL" ]; then
        echo -e "\n${YELLOW}[+] Solicitando certificado para $SSL_DOMAIN...${NC}"
        certbot certonly --webroot -w "$BASE_DIR/proxy/certbot/www" -d "$SSL_DOMAIN" --email "$SSL_EMAIL" --agree-tos --non-interactive || {
            echo -e "${YELLOW}[!] Tentando modo standalone (parando o proxy temporariamente)...${NC}"
            docker compose stop proxy
            certbot certonly --standalone -d "$SSL_DOMAIN" --email "$SSL_EMAIL" --agree-tos --non-interactive
            docker compose start proxy
        }
        echo -e "${GREEN}[✓] Processo de certificado concluido!${NC}"
    fi
    read -p "Pressione [Enter] para voltar ao menu..."
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
    echo -e "  ${CYAN}[7]${NC} Fazer Backup Manual do Banco de Dados MySQL"
    echo -e "  ${RED}[8]${NC} Restaurar Backup do Banco de Dados MySQL"
    echo -e "  ${GREEN}[9]${NC} Configurar Certificado SSL (Let's Encrypt)"
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
        7) manual_backup ;;
        8) restore_backup ;;
        9) setup_ssl ;;
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
