#!/usr/bin/env bash
# ==============================================================================
# ATENCAO: O instalador oficial e o Proxy Nginx ficam na pasta raiz (/var/www/azun ou /www/azun)
# ==============================================================================

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Se estiver dentro de backend/ e existir o instalador na pasta raiz:
if [ -f "$BASE_DIR/../install.sh" ]; then
    echo -e "\033[1;33m[!] Redirecionando para o instalador oficial na pasta raiz: $(cd "$BASE_DIR/.." && pwd)\033[0m"
    cd "$BASE_DIR/.."
    exec ./install.sh "$@"
fi

echo -e "\033[0;31m[X] O instalador e o proxy Nginx devem ser executados a partir da pasta raiz (/var/www/azun ou /www/azun).\033[0m"
echo -e "Estrutura recomendada na VPS:"
echo -e "  /var/www/azun/"
echo -e "    ├── docker-compose.yml"
echo -e "    ├── install.sh"
echo -e "    ├── proxy/"
echo -e "    │    └── nginx.conf"
echo -e "    └── backend/"
echo -e ""
echo -e "Por favor, execute: \033[1;32mcd /var/www/azun && ./install.sh\033[0m"
exit 1
