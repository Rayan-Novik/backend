import axios from 'axios';

/**
 * Geocodifica um endereço brasileiro retornando latitude e longitude.
 * Utiliza o Photon (OpenStreetMap) em múltiplos estágios e fallback para BrasilAPI (CEP v2).
 */
export async function geocodeAddress(endereco) {
    if (!endereco) return null;

    const logradouro = endereco.logradouro || endereco.rua || '';
    const numero = endereco.numero || endereco.num || '';
    const bairro = endereco.bairro || '';
    const cidade = endereco.cidade || endereco.cid || '';
    const estado = endereco.estado || '';
    const cep = endereco.cep ? endereco.cep.toString().replace(/\D/g, '') : '';

    // 1. TENTATIVA 1: PHOTON (KOMOOT / OSM) - RUA + NÚMERO + BAIRRO + CIDADE + ESTADO
    try {
        const termosCompletos = [logradouro, numero, bairro, cidade, estado, 'Brasil'].filter(Boolean).join(', ');
        if (termosCompletos.length > 5) {
            const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(termosCompletos)}&limit=1`;
            const res = await axios.get(url, { 
                timeout: 4500,
                headers: { 'User-Agent': 'AzunLogistics/1.0' }
            });

            if (res.data?.features?.length > 0) {
                const [lng, lat] = res.data.features[0].geometry.coordinates;
                if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
                    return {
                        latitude: parseFloat(lat),
                        longitude: parseFloat(lng),
                        source: 'photon_full'
                    };
                }
            }
        }
    } catch (err) {}

    // 2. TENTATIVA 2: PHOTON - APENAS RUA + BAIRRO + CIDADE + ESTADO (SEM NÚMERO)
    try {
        const termosRua = [logradouro, bairro, cidade, estado, 'Brasil'].filter(Boolean).join(', ');
        if (termosRua.length > 5) {
            const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(termosRua)}&limit=1`;
            const res = await axios.get(url, { 
                timeout: 4000,
                headers: { 'User-Agent': 'AzunLogistics/1.0' }
            });

            if (res.data?.features?.length > 0) {
                const [lng, lat] = res.data.features[0].geometry.coordinates;
                if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
                    return {
                        latitude: parseFloat(lat),
                        longitude: parseFloat(lng),
                        source: 'photon_street'
                    };
                }
            }
        }
    } catch (err) {}

    // 3. TENTATIVA 3: BRASILAPI (CEP v2) - RETORNA COORDENADAS PRECISAS DO CEP
    if (cep && cep.length === 8) {
        try {
            const url = `https://brasilapi.com.br/api/cep/v2/${cep}`;
            const res = await axios.get(url, { timeout: 4500 });
            const coords = res.data?.location?.coordinates;

            if (coords?.latitude && coords?.longitude) {
                const lat = parseFloat(coords.latitude);
                const lng = parseFloat(coords.longitude);
                if (!isNaN(lat) && !isNaN(lng)) {
                    return {
                        latitude: lat,
                        longitude: lng,
                        source: 'brasilapi_cep'
                    };
                }
            }
        } catch (err) {}
    }

    // 4. TENTATIVA 4: PHOTON - APENAS BAIRRO + CIDADE + ESTADO
    try {
        const termosBairro = [bairro, cidade, estado, 'Brasil'].filter(Boolean).join(', ');
        if (termosBairro.length > 4) {
            const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(termosBairro)}&limit=1`;
            const res = await axios.get(url, { 
                timeout: 4000,
                headers: { 'User-Agent': 'AzunLogistics/1.0' }
            });

            if (res.data?.features?.length > 0) {
                const [lng, lat] = res.data.features[0].geometry.coordinates;
                if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
                    return {
                        latitude: parseFloat(lat),
                        longitude: parseFloat(lng),
                        source: 'photon_bairro'
                    };
                }
            }
        }
    } catch (err) {}

    // 5. TENTATIVA 5: PHOTON - APENAS CIDADE + ESTADO
    try {
        const termosCidade = [cidade, estado, 'Brasil'].filter(Boolean).join(', ');
        if (termosCidade.length > 3) {
            const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(termosCidade)}&limit=1`;
            const res = await axios.get(url, { 
                timeout: 4000,
                headers: { 'User-Agent': 'AzunLogistics/1.0' }
            });

            if (res.data?.features?.length > 0) {
                const [lng, lat] = res.data.features[0].geometry.coordinates;
                if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
                    return {
                        latitude: parseFloat(lat),
                        longitude: parseFloat(lng),
                        source: 'photon_cidade'
                    };
                }
            }
        }
    } catch (err) {}

    return null;
}
