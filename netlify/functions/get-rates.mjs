export default async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=1800'
  };

  try {
    const apiKey = process.env.ALLRATES_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify(getStaticRates()), { headers });
    }

    const res = await fetch(
      'https://allratestoday.com/api/v1/central-bank/bct/latest?source=USD&target=TND',
      { headers: { 'Authorization': `Bearer ${apiKey}` } }
    );

    let dynamicRates = null;
    if (res.ok) {
      const data = await res.json();
      dynamicRates = {
        id: 'bct_usd_tnd',
        name: 'BCT USD/TND',
        value: data.rate != null ? Number(data.rate).toFixed(4) : 'N/A',
        source: 'AllRatesToday',
        rate_date: data.rate_date
      };
    }

    const payload = {
      updated_at: new Date().toISOString(),
      rates: [...getStaticRates(), ...(dynamicRates ? [dynamicRates] : [])]
    };

    return new Response(JSON.stringify(payload), { headers });

  } catch (err) {
    console.error('get-rates error:', err);
    return new Response(JSON.stringify({
      error: 'Erreur lors de la récupération',
      fallback: getStaticRates()
    }), { status: 500, headers });
  }
};

// Taux directeurs statiques — VÉRIFIÉS (novembre 2026)
function getStaticRates() {
  return [
    { id: 'bct',  name: 'BCT Tunisie',   value: '7,00 %',      source: 'BCT (7 oct. 2026)' },
    { id: 'bce',  name: 'BCE (MRO)',     value: '2,65 %',      source: 'BCE (29 oct. 2026)' },
    { id: 'fed',  name: 'FED USA',       value: '3,50–3,75 %', source: 'FED (juin 2026)' },
    { id: 'bam',  name: 'BAM Maroc',     value: '2,25 %',      source: 'BAM (22 sept. 2026)' },
    { id: 'ba',   name: 'BA Algérie',    value: '2,50 %',      source: 'BA (oct. 2026)' },
    { id: 'cbl',  name: 'CBL Libye',     value: '3,00 %',      source: 'CBL (sept. 2026)' }
  ];
}
