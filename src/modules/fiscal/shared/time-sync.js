export async function getTrueDate() {
  // O SEFAZ permite que a data de emissão seja até 30 dias no passado,
  // mas tem tolerância quase zero para notas no futuro (Rejeição 704).
  // A solução à prova de falhas é sempre atrasar o relógio local em 3 minutos
  // na hora de assinar o XML, absorvendo qualquer diferença de fuso ou relógio adiantado.
  return new Date(Date.now() - 3 * 60000);
}
