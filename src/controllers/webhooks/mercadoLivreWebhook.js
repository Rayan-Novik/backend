export const processarMercadoLivreNotification = async (req, res) => {
    const { resource, topic } = req.body;
    if (topic === 'orders_v2' || resource?.includes('/orders/')) {
        console.log(`📦 [ML] Nova venda: ${resource}`);
    }
    res.status(200).send('OK');
};