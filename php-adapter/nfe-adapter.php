<?php

require __DIR__ . '/vendor/autoload.php';

use NFePHP\NFe\Make;
use NFePHP\NFe\Tools;
use NFePHP\Common\Certificate;
use NFePHP\NFe\Common\Standardize;

// Lê o JSON da entrada padrão (STDIN)
$stdin = file_get_contents("php://stdin");
$input = json_decode($stdin, true);

if (!$input) {
    echo json_encode(['error' => 'Input JSON invlido ou vazio']);
    exit(1);
}

$action = $input['action'] ?? null;
$payload = $input['payload'] ?? [];
$config = $input['config'] ?? [];
$certificadoB64 = $input['certificado'] ?? '';

try {
    
    if ($action === 'test-xml') {
        $nfe = new Make($config['schemes'] ?? 'PL_010_V1.30');
        $stdIde = new \stdClass();
        $stdIde->cUF = 13;
        $stdIde->natOp = 'Venda';
        $stdIde->mod = '55';
        $stdIde->serie = 1;
        $stdIde->nNF = 22;
        $stdIde->dhEmi = date('c');
        $stdIde->tpNF = 1;
        $stdIde->idDest = 1;
        $stdIde->cMunFG = '1302504';
        $stdIde->tpImp = 1;
        $stdIde->tpEmis = 1;
        $stdIde->tpAmb = 2;
        $stdIde->finNFe = 1;
        $stdIde->indFinal = 1;
        $stdIde->indPres = 1;
        $stdIde->procEmi = 0;
        $stdIde->verProc = 'ERP-1.0';
        $nfe->tagide($stdIde);

          // Notas Referenciadas (NFref)
          if (!empty($payload['referenciados']) && is_array($payload['referenciados'])) {
              foreach ($payload['referenciados'] as $ref) {
                  if (!empty($ref['chave_acesso'])) {
                      $stdRef = new \stdClass();
                      $stdRef->refNFe = $ref['chave_acesso'];
                      $nfe->tagrefNFe($stdRef);
                  }
              }
          }

        
        $stdEmit = new \stdClass();
        $stdEmit->xNome = 'Teste';
        $stdEmit->CNPJ = '05807622000140';
        $stdEmit->IE = 'ISENTO';
        $stdEmit->CRT = 1;
        $nfe->tagemit($stdEmit);
        
        $stdEnderEmit = new \stdClass();
        $stdEnderEmit->xLgr = 'Rua';
        $stdEnderEmit->nro = '1';
        $stdEnderEmit->xBairro = 'Centro';
        $stdEnderEmit->cMun = '1302504';
        $stdEnderEmit->xMun = 'Manaus';
        $stdEnderEmit->UF = 'AM';
        $stdEnderEmit->CEP = '69000000';
        $stdEnderEmit->cPais = '1058';
        $stdEnderEmit->xPais = 'Brasil';
        $nfe->tagenderEmit($stdEnderEmit);
        
        $stdDest = new \stdClass();
        $stdDest->xNome = 'Dest';
        $stdDest->CNPJ = '11222333000181';
        $stdDest->indIEDest = 9;
        $nfe->tagdest($stdDest);
        
        $stdEnderDest = clone $stdEnderEmit;
        $nfe->tagenderDest($stdEnderDest);

        // ITEM
        $stdProd = new \stdClass();
        $stdProd->item = 1;
        $stdProd->cProd = '1';
        $stdProd->cEAN = 'SEM GTIN';
        $stdProd->xProd = 'Teste';
        $stdProd->NCM = '23091000';
        $stdProd->CFOP = '5102';
        $stdProd->uCom = 'UN';
        $stdProd->qCom = '1';
        $stdProd->vUnCom = '100';
        $stdProd->vProd = '100';
        $stdProd->cEANTrib = 'SEM GTIN';
        $stdProd->uTrib = 'UN';
        $stdProd->qTrib = '1';
        $stdProd->vUnTrib = '100';
        $stdProd->indTot = 1;
        $nfe->tagprod($stdProd);
        
        $stdIcms = new \stdClass();
        $stdIcms->item = 1;
        $stdIcms->orig = 0;
        $stdIcms->CSOSN = '102';
        $nfe->tagICMSSN($stdIcms);
        
        $stdPis = new \stdClass();
        $stdPis->item = 1;
        $stdPis->CST = '49';
        $stdPis->vBC = 100;
        $stdPis->pPIS = 0;
        $stdPis->vPIS = 0;
        $nfe->tagPIS($stdPis);
        
        $stdCof = new \stdClass();
        $stdCof->item = 1;
        $stdCof->CST = '49';
        $stdCof->vBC = 100;
        $stdCof->pCOFINS = 0;
        $stdCof->vCOFINS = 0;
        $nfe->tagCOFINS($stdCof);
        
        $stdIBS = new \stdClass();
        $stdIBS->item = 1;
        $stdIBS->CST = '49';
        $stdIBS->cClassTrib = '000001';
        $stdIBS->vBC = null;
        $stdIBS->vIBS = null;
        $stdIBS->gIBSUF_pIBSUF = 0;
        $stdIBS->gIBSUF_vIBSUF = 0;
        $stdIBS->gIBSMun_pIBSMun = 0;
        $stdIBS->gIBSMun_vIBSMun = 0;
        $stdIBS->vCBS = null;
        $stdIBS->gCBS_pCBS = 0;
        $stdIBS->gCBS_vCBS = 0;
        $nfe->tagIBSCBS($stdIBS);
        
        $stdIcmsTot = new \stdClass();
        $stdIcmsTot->vBC = 0;
        $stdIcmsTot->vICMS = 0;
        $stdIcmsTot->vICMSDeson = 0;
        $stdIcmsTot->vFCP = 0;
        $stdIcmsTot->vBCST = 0;
        $stdIcmsTot->vST = 0;
        $stdIcmsTot->vFCPST = 0;
        $stdIcmsTot->vFCPSTRet = 0;
        $stdIcmsTot->vProd = 100;
        $stdIcmsTot->vFrete = $payload['totais']['frete'] ?? 0;
        $stdIcmsTot->vSeg = 0;
        $stdIcmsTot->vDesc = 0;
        $stdIcmsTot->vII = 0;
        $stdIcmsTot->vIPI = 0;
        $stdIcmsTot->vIPIDevol = 0;
        $stdIcmsTot->vPIS = 0;
        $stdIcmsTot->vCOFINS = 0;
        $stdIcmsTot->vOutro = 0;
        $stdIcmsTot->vNF = 100;
        $nfe->tagICMSTot($stdIcmsTot);

          $stdIbsTot = new \stdClass();
          $stdIbsTot->vBCIBSCBS = '0.00';
          $stdIbsTot->vIBS = '0.00';
          $stdIbsTot->gIBS_vIBS = '0.00';
          $stdIbsTot->vCBS = '0.00';
          $stdIbsTot->gCBS_vCBS = '0.00';
          $nfe->tagIBSCBSTot($stdIbsTot);

        
        $stdTransp = new \stdClass();
        $stdTransp->modFrete = 9;
        $nfe->tagtransp($stdTransp);
        
        $stdPag = new \stdClass();
        $nfe->tagpag($stdPag);
        $stdDetPag = new \stdClass();
        $stdDetPag->tPag = '01';
        $stdDetPag->vPag = 100;
        $nfe->tagdetPag($stdDetPag);
        
        echo json_encode(['xml' => $nfe->getXML()]);
        exit(0);
    }

    if ($action === 'test') {
        echo json_encode([
            'status' => 'success',
            'message' => 'Adapter funcionando!',
            'action_received' => $action
        ]);
        exit(0);
    }

    if ($action === 'emitir') {
        // 1. Setup do Certificado em memória
        $pfxContent = base64_decode($certificadoB64);
        $password = $payload['password'] ?? '';
        
        $certificate = Certificate::readPfx($pfxContent, $password);
        
        // 2. Setup Tools
        $tools = new Tools(json_encode($config), $certificate);
        $modelo = $payload['cenario']['modelo'] ?? '55';
        $tools->model($modelo);
        
        // 3. Montar XML
        $nfe = new Make($config['schemes'] ?? 'PL_010_V1.30');
        $std = new \stdClass();
        $std->versao = '4.00';
        $std->Id = ''; // gerado automaticamente se vazio
        $std->pk_nItem = null;
        $nfe->taginfNFe($std);
        
        
          // Configurar timezone baseado na UF
          $uf = strtoupper($payload['estabelecimento']['uf'] ?? 'SP');
          $timezone = 'America/Sao_Paulo';
          if ($uf === 'AC') $timezone = 'America/Rio_Branco';
          elseif (in_array($uf, ['AM', 'RR', 'RO'])) $timezone = 'America/Manaus';
          elseif (in_array($uf, ['MS', 'MT'])) $timezone = 'America/Campo_Grande';
          
          date_default_timezone_set($timezone);

          // IDE
          $stdIde = new \stdClass();
        $stdIde->cUF = substr($payload['estabelecimento']['codigo_municipio_ibge'], 0, 2);
        $stdIde->cNF = rand(11111111, 99999999);
        $stdIde->natOp = substr($payload['cenario']['operacao'], 0, 60);
        $stdIde->mod = $modelo;
        $stdIde->serie = $payload['serie'];
        $stdIde->nNF = $payload['numero'];
        $stdIde->dhEmi = date('c', strtotime($payload['data_emissao']));
        $stdIde->tpNF = 1; // 1 Sada
        $stdIde->idDest = 1; // 1 Interna, 2 Interestadual
        if (!empty($payload['destinatario']['uf']) && $payload['estabelecimento']['uf'] !== $payload['destinatario']['uf']) {
            $stdIde->idDest = 2;
        }
        $stdIde->cMunFG = $payload['estabelecimento']['codigo_municipio_ibge'];
        $stdIde->tpImp = ($modelo == '65') ? 4 : 1; // DANFE NFC-e ou NF-e
        
          $stdIde->tpEmis = !empty($payload['contingencia']) ? 9 : 1;
          if (!empty($payload['contingencia'])) {
              $stdIde->dhCont = $payload['data_emissao']; // Mesma data
              $stdIde->xJust = 'Falha de conexao com a SEFAZ (Contingencia Offline)';
          }

        $stdIde->cDV = ''; // Calculado
        $stdIde->tpAmb = $config['tpAmb'];
        $stdIde->finNFe = $payload['cenario']['finalidade']; // 1 normal, 4 devolução
        $stdIde->indFinal = 1; // Consumidor final
        $stdIde->indPres = 1; // Presencial
        
        if ($modelo == '65') {
            $stdIde->idDest = 1; // Sempre interna
        }
        $stdIde->procEmi = 0; // App do contribuinte
        $stdIde->verProc = 'ERP-1.0';
        $nfe->tagide($stdIde);

          // Notas Referenciadas (NFref)
          if (!empty($payload['referenciados']) && is_array($payload['referenciados'])) {
              foreach ($payload['referenciados'] as $ref) {
                  if (!empty($ref['chave_acesso'])) {
                      $stdRef = new \stdClass();
                      $stdRef->refNFe = $ref['chave_acesso'];
                      $nfe->tagrefNFe($stdRef);
                  }
              }
          }

        
        // EMIT
        $stdEmit = new \stdClass();
        $stdEmit->xNome = substr($payload['empresa']['razao_social'], 0, 60);
        $stdEmit->CNPJ = preg_replace('/[^0-9]/', '', $payload['estabelecimento']['cnpj']);
        $stdEmit->IE = !empty($payload['estabelecimento']['ie']) ? preg_replace('/[^0-9ISENTOisento]/', '', $payload['estabelecimento']['ie']) : (!empty($payload['empresa']['ie']) ? preg_replace('/[^0-9ISENTOisento]/', '', $payload['empresa']['ie']) : 'ISENTO');
        $stdEmit->CRT = 1; // Simples Nacional (pegar do banco futuramente)
        $nfe->tagemit($stdEmit);
        
        $stdEnderEmit = new \stdClass();
        $stdEnderEmit->xLgr = $payload['estabelecimento']['logradouro'];
        $stdEnderEmit->nro = $payload['estabelecimento']['numero'];
        $stdEnderEmit->xBairro = $payload['estabelecimento']['bairro'];
        $stdEnderEmit->cMun = $payload['estabelecimento']['codigo_municipio_ibge'];
        $stdEnderEmit->xMun = $payload['estabelecimento']['municipio'];
        $stdEnderEmit->UF = $payload['estabelecimento']['uf'];
        $stdEnderEmit->CEP = preg_replace('/[^0-9]/', '', $payload['estabelecimento']['cep']);
        $stdEnderEmit->cPais = '1058';
        $stdEnderEmit->xPais = 'Brasil';
        $nfe->tagenderEmit($stdEnderEmit);
        
        // DEST (Opcional na NFC-e 65, Obrigatório na NF-e 55)
        $temDestinatario = !empty($payload['destinatario']) && (!empty($payload['destinatario']['cpf_cnpj']) || !empty($payload['destinatario']['razao_social']));
        if ($temDestinatario) {
            $stdDest = new \stdClass();
            $cnpjCpf = !empty($payload['destinatario']['cpf_cnpj']) ? preg_replace('/[^0-9]/', '', $payload['destinatario']['cpf_cnpj']) : '';
            if (strlen($cnpjCpf) === 14) {
                $stdDest->CNPJ = $cnpjCpf;
            } else if (strlen($cnpjCpf) === 11) {
                $stdDest->CPF = $cnpjCpf;
            }
            if (!empty($payload['destinatario']['razao_social'])) {
                $stdDest->xNome = substr($payload['destinatario']['razao_social'], 0, 60);
            }
            $stdDest->indIEDest = !empty($payload['destinatario']['ie']) ? 1 : 9;
            if (!empty($payload['destinatario']['ie'])) {
                $stdDest->IE = preg_replace('/[^0-9]/', '', $payload['destinatario']['ie']);
            }
            $nfe->tagdest($stdDest);
            
            // Endereço do destinatário
            if (!empty($payload['destinatario']['logradouro']) && !empty($payload['destinatario']['municipio'])) {
                $stdEnderDest = new \stdClass();
                $stdEnderDest->xLgr = substr($payload['destinatario']['logradouro'], 0, 60);
                $stdEnderDest->nro = !empty($payload['destinatario']['numero']) ? substr($payload['destinatario']['numero'], 0, 60) : 'SN';
                $stdEnderDest->xBairro = !empty($payload['destinatario']['bairro']) ? substr($payload['destinatario']['bairro'], 0, 60) : 'Centro';
                $stdEnderDest->cMun = !empty($payload['destinatario']['codigo_municipio_ibge']) ? $payload['destinatario']['codigo_municipio_ibge'] : $payload['estabelecimento']['codigo_municipio_ibge'];
                $stdEnderDest->xMun = !empty($payload['destinatario']['municipio']) ? substr($payload['destinatario']['municipio'], 0, 60) : $payload['estabelecimento']['municipio'];
                $stdEnderDest->UF = !empty($payload['destinatario']['uf']) ? $payload['destinatario']['uf'] : $payload['estabelecimento']['uf'];
                $stdEnderDest->CEP = !empty($payload['destinatario']['cep']) ? preg_replace('/[^0-9]/', '', $payload['destinatario']['cep']) : preg_replace('/[^0-9]/', '', $payload['estabelecimento']['cep']);
                $stdEnderDest->cPais = '1058';
                $stdEnderDest->xPais = 'Brasil';
                $nfe->tagenderDest($stdEnderDest);
            }
        }
        
        // RESPONSAVEL TECNICO
        $stdRespTec = new \stdClass();
        $stdRespTec->CNPJ = preg_replace('/[^0-9]/', '', $payload['estabelecimento']['cnpj']);
        $stdRespTec->xContato = 'Suporte Modulo Fiscal';
        $stdRespTec->email = 'suporte@modulofiscal.com.br';
        $stdRespTec->fone = '11999999999';
        $nfe->taginfRespTec($stdRespTec);

        // ITENS
        foreach ($payload['itens'] as $idx => $item) {
            $stdDet = new \stdClass();
            $stdDet->item = $item['numero_item'];
            $stdDet->cProd = $item['produto']['codigo_interno'];
            $stdDet->cEAN = !empty($item['produto']['ean_gtin']) ? $item['produto']['ean_gtin'] : 'SEM GTIN';
            $stdDet->xProd = $item['produto']['descricao'];
            $stdDet->NCM = $item['produto']['ncm'];
            $stdDet->CFOP = ltrim($item['cfop'], '0'); // Evita erro se vier 05102 em vez de 5102
            $stdDet->CFOP = str_replace('.', '', $stdDet->CFOP); // Evita 5.102
            
            $stdDet->uCom = 'UN';
            $stdDet->qCom = $item['quantidade'];
            $stdDet->vUnCom = $item['valor_unitario'];
            $stdDet->vProd = $item['valor_total'];
              if (isset($item['valor_frete']) && $item['valor_frete'] > 0) {
                  $stdDet->vFrete = $item['valor_frete'];
              }
            $stdDet->cEANTrib = !empty($item['produto']['ean_gtin']) ? $item['produto']['ean_gtin'] : 'SEM GTIN';
            $stdDet->uTrib = 'UN';
            $stdDet->qTrib = $item['quantidade'];
            $stdDet->vUnTrib = $item['valor_unitario'];
            $stdDet->indTot = 1; // Compoe total
            $nfe->tagprod($stdDet);
            
            // Impostos
            $stdImposto = new \stdClass();
            $stdImposto->item = $item['numero_item'];
            $nfe->tagimposto($stdImposto);
            
            // ICMS (SN)
            if (isset($item['tributacao']['icms']['cst_csosn'])) {
                $stdIcms = new \stdClass();
                $stdIcms->item = $item['numero_item'];
                $stdIcms->orig = $item['produto']['origem'] ?? 0;
                $stdIcms->CSOSN = $item['tributacao']['icms']['cst_csosn'];
                
                // Exemplo bsico para CSOSN 102, 103, 300, 400
                if (in_array($stdIcms->CSOSN, ['102', '103', '300', '400'])) {
                    $nfe->tagICMSSN($stdIcms);
                }
            }
            
            // PIS / COFINS (Simplificado para nǜo estourar o limite agora)
            if (isset($item['tributacao']['pis']['cst'])) {
                $stdPis = new \stdClass();
                $stdPis->item = $item['numero_item'];
                $stdPis->CST = $item['tributacao']['pis']['cst'];
                $stdPis->vBC = $item['tributacao']['pis']['base'];
                $stdPis->pPIS = $item['tributacao']['pis']['aliquota'];
                $stdPis->vPIS = $item['tributacao']['pis']['valor'];
                $nfe->tagPIS($stdPis);
            }
            
            if (isset($item['tributacao']['cofins']['cst'])) {
                $stdCof = new \stdClass();
                $stdCof->item = $item['numero_item'];
                $stdCof->CST = $item['tributacao']['cofins']['cst'];
                $stdCof->vBC = $item['tributacao']['cofins']['base'];
                $stdCof->pCOFINS = $item['tributacao']['cofins']['aliquota'];
                $stdCof->vCOFINS = $item['tributacao']['cofins']['valor'];
                $nfe->tagCOFINS($stdCof);
              }

            // Injeta IBS/CBS obrigatoriamente (NT 2024.002) mesmo que a regra tributária não tenha sido encontrada
            if (true) {
                $stdIBS = new \stdClass();
                $stdIBS->item = $item['numero_item'];
                $stdIBS->CST = !empty($item['tributacao']['ibs']['cst']) ? $item['tributacao']['ibs']['cst'] : '049';
                $stdIBS->cClassTrib = !empty($item['tributacao']['ibs']['cClassTrib']) ? $item['tributacao']['ibs']['cClassTrib'] : '000001';
                
                $vBC = $item['tributacao']['ibs']['base'] ?? 0;
                $pIBS = $item['tributacao']['ibs']['aliquota'] ?? 0;
                $vIBS = $item['tributacao']['ibs']['valor'] ?? 0;
                $pCBS = $item['tributacao']['cbs']['aliquota'] ?? 0;
                $vCBS = $item['tributacao']['cbs']['valor'] ?? 0;
                
                if (in_array($stdIBS->CST, ['000', '010', '011', '200', '620', '800']) && $vBC > 0 && ($pIBS > 0 || $pCBS > 0)) {
                    $stdIBS->vBC = $vBC;
                    $stdIBS->vIBS = $vIBS;
                    $stdIBS->gIBSUF_pIBSUF = $pIBS / 2;
                    $stdIBS->gIBSUF_vIBSUF = $vIBS / 2;
                    $stdIBS->gIBSMun_pIBSMun = $pIBS / 2;
                    $stdIBS->gIBSMun_vIBSMun = $vIBS / 2;
                    
                    $stdIBS->vCBS = $vCBS;
                    $stdIBS->gCBS_pCBS = $pCBS;
                    $stdIBS->gCBS_vCBS = $vCBS;
                } else {
                    $stdIBS->vBC = null;
                    $stdIBS->vIBS = null;
                    $stdIBS->gIBSUF_pIBSUF = 0;
                    $stdIBS->gIBSUF_vIBSUF = 0;
                    $stdIBS->gIBSMun_pIBSMun = 0;
                    $stdIBS->gIBSMun_vIBSMun = 0;
                    $stdIBS->vCBS = null;
                    $stdIBS->gCBS_pCBS = 0;
                    $stdIBS->gCBS_vCBS = 0;
                }
                
                $nfe->tagIBSCBS($stdIBS);
            }

        }
        
        // TOTAL
        $stdIcmsTot = new \stdClass();
        $stdIcmsTot->vBC = 0;
        $stdIcmsTot->vICMS = 0;
        $stdIcmsTot->vICMSDeson = 0;
        $stdIcmsTot->vFCP = 0;
        $stdIcmsTot->vBCST = 0;
        $stdIcmsTot->vST = 0;
        $stdIcmsTot->vFCPST = 0;
        $stdIcmsTot->vFCPSTRet = 0;
        $stdIcmsTot->vProd = $payload['totais']['bruto'];
        $stdIcmsTot->vFrete = $payload['totais']['frete'] ?? 0;
        $stdIcmsTot->vSeg = 0;
        $stdIcmsTot->vDesc = 0;
        $stdIcmsTot->vII = 0;
        $stdIcmsTot->vIPI = 0;
        $stdIcmsTot->vIPIDevol = 0;
        $stdIcmsTot->vPIS = 0; // Soma PIS
        $stdIcmsTot->vCOFINS = 0; // Soma COFINS
        $stdIcmsTot->vOutro = 0;
        $stdIcmsTot->vNF = $payload['totais']['total'] ?? $payload['totais']['bruto'];
        
        foreach ($payload['itens'] as $it) {
            if (isset($it['tributacao']['pis']['valor'])) $stdIcmsTot->vPIS += $it['tributacao']['pis']['valor'];
            if (isset($it['tributacao']['cofins']['valor'])) $stdIcmsTot->vCOFINS += $it['tributacao']['cofins']['valor'];
        }
        $nfe->tagICMSTot($stdIcmsTot);
        
        // TRANSPORTE
        $stdTransp = new \stdClass();
        $stdTransp->modFrete = $payload['modalidade_frete'] ?? 9;
        $nfe->tagtransp($stdTransp);
        
                // PAGAMENTO
        $stdPag = new \stdClass();
        $nfe->tagpag($stdPag);
        $stdDetPag = new \stdClass();
        
        $fin = $stdIde->finNFe ?? 1;
        if ($fin == 4 || $fin == 2 || $fin == 3) {
            $stdDetPag->tPag = '90'; // Sem Pagamento
            $stdDetPag->vPag = 0.00;
        } else {
            $stdDetPag->tPag = str_pad($payload['pagamento_codigo'] ?? '01', 2, '0', STR_PAD_LEFT);
            $stdDetPag->vPag = $payload['totais']['total'] ?? $payload['totais']['bruto'];
        }
        $nfe->tagdetPag($stdDetPag);
        
        $xml = $nfe->montaNFe();
          if (!empty($xml) && empty($nfe->getErrors())) {
            // $xml ja tem o conteudo
            
            // Assinar XML
            $xmlAssinado = $tools->signNFe($xml);
            
            // Transmitir para a SEFAZ
            // (Para nǜo enviar lixo para SEFAZ logo de cara no dev local, 
            // vamos apenas retornar o XML gerado se o config['tpAmb'] for 2 
            // e for apenas um teste. Mas aqui vamos mandar de verdade.)
            
            
              if (!empty($payload['apenas_salvar']) || !empty($payload['contingencia'])) {
                  echo json_encode([
                      'status' => 'success',
                      'xml_gerado' => $xml,
                      'xml_assinado' => $xmlAssinado,
                      'xml_autorizado' => null,
                      'chave_acesso' => $nfe->getChave(),
                      'sefaz_response' => null,
                      'is_draft' => true
                  ]);
                  exit(0);
              }

              try {

                  $idLote = str_pad(1, 15, '0', STR_PAD_LEFT);
                $resp = $tools->sefazEnviaLote([$xmlAssinado], $idLote, 1); // 1 = Sncrono
                
                $st = new Standardize();
                $stdResp = $st->toStd($resp);
                
                echo json_encode([
                    'status' => 'success',
                    'xml_gerado' => $xml,
                    'xml_assinado' => $xmlAssinado,
                      'xml_autorizado' => null,
                      'chave_acesso' => $nfe->getChave(), // S tem isso se autorizar
                    'sefaz_response' => $stdResp
                ]);
            } catch (\Exception $e) {
                // Erro de rede ou validaǜo do XSD
                echo json_encode([
                    'status' => 'error',
                    'message' => 'Erro Sefaz: ' . $e->getMessage(),
                      'xml_assinado' => $xmlAssinado,
                      'chave_acesso' => $nfe->getChave()
                  ]);
            }
            exit(0);
        } else {
            // Falha ao montar
            echo json_encode([
                'status' => 'error',
                'message' => 'Falha ao montar XML NFe',
                'errors' => $nfe->getErrors()
            ]);
            exit(1);
        }
    }

    if ($action === 'evento') {
        $pfxContent = base64_decode($certificadoB64);
        $password = $payload['password'] ?? '';
        $certificate = Certificate::readPfx($pfxContent, $password);
        
        $tools = new Tools(json_encode($config), $certificate);
        $modelo = $payload['modelo'] ?? '55';
        $tools->model($modelo);
        
        $tipo = $payload['tipo_evento'];
        try {
            $resp = '';
            if ($tipo === 'CANCELAMENTO') {
                $resp = $tools->sefazCancela(
                    $payload['chave_acesso'],
                    $payload['justificativa'],
                    $payload['protocolo_autorizacao']
                );
            } elseif ($tipo === 'CC_E') {
                $resp = $tools->sefazCCe(
                    $payload['chave_acesso'],
                    $payload['justificativa'],
                    $payload['sequencial']
                );
            } elseif ($tipo === 'INUTILIZACAO') {
                $resp = $tools->sefazInutiliza(
                    $payload['ano'],
                    $modelo,
                    $payload['serie'],
                    $payload['numero_inicial'],
                    $payload['numero_final'],
                    $payload['justificativa']
                );
            } else {
                throw new \Exception('Tipo de evento desconhecido: ' . $tipo);
            }
            
            $st = new Standardize();
            $stdResp = $st->toStd($resp);
            
            echo json_encode([
                'status' => 'success',
                'sefaz_response' => $stdResp
            ]);
            exit(0);
        } catch (\Exception $e) {
            echo json_encode([
                'status' => 'error',
                'message' => 'Erro Evento Sefaz: ' . $e->getMessage()
            ]);
            exit(1);
        }
    }
} catch (\Exception $e) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Exception no PHP: ' . $e->getMessage()
    ]);
    exit(1);
}
