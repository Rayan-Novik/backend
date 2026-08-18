export const calcularDesconto = (carrinho, cupom, valorFrete = 0) => {
    const agora = new Date();

    if (!cupom.ativo) throw new Error("Cupom inativo.");
    if (new Date(cupom.data_validade) < agora) throw new Error("Cupom expirado.");
    
    if (cupom.usos_maximos && cupom.usos_atuais >= cupom.usos_maximos) {
        throw new Error("Cupom esgotado.");
    }

    const subtotalCarrinho = carrinho.reduce((acc, item) => acc + (Number(item.preco) * item.quantidade), 0);

    if (cupom.valor_minimo && subtotalCarrinho < Number(cupom.valor_minimo)) {
        throw new Error(`O valor mínimo para este cupom é R$ ${parseFloat(cupom.valor_minimo).toFixed(2)}`);
    }

    let baseCalculo = 0;

    switch (cupom.alvo) {
        case 'TOTAL_CARRINHO':
            baseCalculo = subtotalCarrinho;
            break;

        case 'FRETE':
            baseCalculo = Number(valorFrete);
            break;

        case 'PRODUTO':
            baseCalculo = carrinho
                .filter(item => item.id_produto === cupom.id_produto_alvo)
                .reduce((acc, item) => acc + (Number(item.preco) * item.quantidade), 0);
            break;

        case 'CATEGORIA':
            baseCalculo = carrinho
                .filter(item => item.produto?.id_categoria === cupom.id_categoria_alvo)
                .reduce((acc, item) => acc + (Number(item.preco) * item.quantidade), 0);
            break;
            
        case 'MARCA':
            baseCalculo = carrinho
                .filter(item => item.produto?.id_marca === cupom.id_marca_alvo)
                .reduce((acc, item) => acc + (Number(item.preco) * item.quantidade), 0);
            break;

        default:
            baseCalculo = 0;
    }

    if (baseCalculo <= 0) {
        throw new Error("Este cupom não se aplica aos itens do seu carrinho.");
    }

    let valorDesconto = 0;

    if (cupom.tipo_desconto === 'PERCENTUAL') {
        valorDesconto = baseCalculo * (Number(cupom.valor) / 100);
    } else {
        valorDesconto = Number(cupom.valor);
        if (valorDesconto > baseCalculo) valorDesconto = baseCalculo;
    }

    return parseFloat(valorDesconto.toFixed(2));
};