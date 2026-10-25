// MARK: - Apple-aankoopcontrole
const subscriptions = new Set(['weekly', 'monthly', 'yearly'].map(period => `com.templateos.fxlotsize.pro.${period}.v1`));
const lifetime = 'com.templateos.fxlotsize.pro.lifetime.v1';
export const bundleID = 'com.templateos.fxlotsize';

// Comment NL: Alleen de officiële Apple-verifier mag payloads aan deze adapter leveren.
// Comment NL: Iedere toegangscontrole leest de actuele status; oude JWS-bewijzen zijn geen blijvende toegang.
export function createApplePurchases({ verifier, client, environment, now = Date.now }) {
  function valid(transaction) {
    return transaction?.bundleId === bundleID && transaction.environment === environment
      && transaction.revocationDate == null && !transaction.isUpgraded
      && typeof transaction.transactionId === 'string' && typeof transaction.originalTransactionId === 'string';
  }
  function entitlement(transaction) {
    if (!valid(transaction)) return null;
    if (transaction.productId === lifetime && transaction.type === 'Non-Consumable') {
      return { transactionId: transaction.transactionId, kind: 'lifetime', expiresAt: null };
    }
    if (subscriptions.has(transaction.productId) && transaction.type === 'Auto-Renewable Subscription'
      && Number.isFinite(transaction.expiresDate) && transaction.expiresDate > now()) {
      return { transactionId: transaction.transactionId, kind: 'subscription', expiresAt: transaction.expiresDate };
    }
    return null;
  }
  async function current(transactionId) {
    const response = await client.getTransactionInfo(transactionId);
    const transaction = await verifier.verifyAndDecodeTransaction(response.signedTransactionInfo);
    if (!valid(transaction) || transaction.transactionId !== transactionId) throw new Error('PURCHASE_INVALID');
    if (transaction.productId === lifetime) {
      const access = entitlement(transaction);
      if (access) return access;
    } else if (subscriptions.has(transaction.productId)) {
      const statuses = await client.getAllSubscriptionStatuses(transactionId);
      for (const group of statuses.data || []) for (const entry of group.lastTransactions || []) {
        if (entry.status !== 1) continue;
        const latest = await verifier.verifyAndDecodeTransaction(entry.signedTransactionInfo);
        if (latest.originalTransactionId !== transaction.originalTransactionId) continue;
        const access = entitlement(latest);
        if (access) return access;
      }
    }
    throw new Error('PURCHASE_INACTIVE');
  }
  return {
    current,
    async verifyProof(proof) {
      if (typeof proof !== 'string' || proof.length > 24000) throw new Error('PURCHASE_INVALID');
      const transaction = await verifier.verifyAndDecodeTransaction(proof);
      if (!valid(transaction) || (!subscriptions.has(transaction.productId) && transaction.productId !== lifetime)) throw new Error('PURCHASE_INVALID');
      return current(transaction.transactionId);
    },
  };
}
