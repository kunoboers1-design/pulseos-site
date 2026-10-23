// MARK: - Positiegrootte
// Comment NL: Alle geldbedragen gebruiken dezelfde accountvaluta (USD in deze demo).
// Pipwaarde is per pip per standaardlot; geen koersfeed, valutaconversie of brokerregels.
export function calculatePosition(values) {
  const errors = {};
  const parsed = {};
  const labels = { balance: 'Balance', risk: 'Risk percentage', stop: 'Stop loss', pip: 'Pip value' };
  for (const [key, label] of Object.entries(labels)) {
    const raw = String(values[key] ?? '').trim();
    const value = Number(raw);
    if (!raw || !Number.isFinite(value) || value <= 0) errors[key] = `${label} must be greater than zero.`;
    else parsed[key] = value;
  }
  if (parsed.risk > 100) errors.risk = 'Risk percentage cannot exceed 100%.';
  if (Object.keys(errors).length) return { errors };
  const riskAmount = parsed.balance * (parsed.risk / 100);
  const lossPerLot = parsed.stop * parsed.pip;
  const lots = riskAmount / lossPerLot;
  if (![riskAmount, lossPerLot, lots].every(n => Number.isFinite(n) && n > 0) || lots * 100 > Number.MAX_SAFE_INTEGER) {
    return { errors: { balance: 'These values are outside the supported calculation range.' } };
  }
  // Comment NL: Naar beneden afronden op 0,01 lot voorkomt een groter gepland risico door afronding.
  let roundedLots = Math.floor(Number(lots.toPrecision(14)) * 100) / 100;
  if (roundedLots * lossPerLot > riskAmount) roundedLots = Math.max(0, roundedLots - 0.01);
  return { errors, riskAmount, lots, roundedLots, plannedRisk: roundedLots * lossPerLot };
}
