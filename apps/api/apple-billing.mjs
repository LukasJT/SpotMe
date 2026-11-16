import {readFile} from 'node:fs/promises';
import {AppStoreServerAPIClient, Environment, SignedDataVerifier, Status, VerificationStatus}
  from '@apple/app-store-server-library';
import {HttpError, json, readJson} from './chat.mjs';

const bundleID = 'com.spotmedating.ios';
const products = new Set([`${bundleID}.premium.weekly`, `${bundleID}.premium.monthly`]);
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const originalID = /^[0-9]{1,32}$/;
const jws = /^[\w-]+\.[\w-]+\.[\w-]+$/;
const canonicalAccount = value => typeof value === 'string' && uuid.test(value) ? value.toLowerCase() : null;

async function signedField(request, key) {
  const body = await readJson(request, key === 'signedPayload' ? 64 * 1024 : 16 * 1024);
  if (!body || Object.keys(body).length !== 1 || typeof body[key] !== 'string' || !jws.test(body[key])) {
    throw new HttpError(422,'invalid_signed_payload');
  }
  return body[key];
}

async function verifyInput(action) {
  try { return await action(); }
  catch (error) {
    if (error?.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE) {
      throw new HttpError(503,'apple_verification_unavailable');
    }
    throw new HttpError(422,'invalid_signed_payload');
  }
}

function validDate(milliseconds) {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1) return false;
  return !Number.isNaN(new Date(milliseconds).getTime());
}

function createAppleBilling({environment, verifier, apple, db}) {
  async function reconcile(transaction, account) {
    const original = transaction.originalTransactionId;
    if (!originalID.test(original ?? '')) throw new HttpError(422,'invalid_transaction');
    const {rows:[{ticket}]} = await db.query('select spotme_private.next_apple_sync_ticket() as ticket');
    let current, status, activeUntil = null;
    try {
      const response = await apple.getAllSubscriptionStatuses(original);
      const matching = (response.data ?? []).flatMap(group => group.lastTransactions ?? [])
        .filter(item => item.originalTransactionId === original);
      if (matching.length !== 1) throw new Error('Missing subscription status');
      const item = matching[0];
      status = item.status;
      current = await verifier.verifyAndDecodeTransaction(item.signedTransactionInfo);
      if (current.originalTransactionId !== original || !products.has(current.productId) ||
          (current.appAccountToken != null && canonicalAccount(current.appAccountToken) !== account)) {
        throw new Error('Unexpected subscription identity');
      }
      if (!Object.values(Status).includes(status) || typeof status !== 'number') throw new Error('Unknown subscription status');
      if (!current.revocationDate && status === Status.ACTIVE) {
        if (!validDate(current.expiresDate)) throw new Error('Invalid subscription expiration');
        activeUntil = new Date(current.expiresDate);
      }
      if (!current.revocationDate && status === Status.BILLING_GRACE_PERIOD) {
        const renewal = await verifier.verifyAndDecodeRenewalInfo(item.signedRenewalInfo);
        if (renewal.originalTransactionId !== original || !validDate(renewal.gracePeriodExpiresDate)) {
          throw new Error('Invalid grace period');
        }
        activeUntil = new Date(renewal.gracePeriodExpiresDate);
      }
    } catch {
      throw new HttpError(503,'apple_status_unavailable');
    }
    await db.query('select spotme_private.record_apple_subscription($1,$2,$3,$4,$5,$6)',
      [environment,original,account,current.productId,activeUntil,ticket]);
  }

  async function claim(request, actor) {
    const signed = await signedField(request, 'signedTransaction');
    const transaction = await verifyInput(() => verifier.verifyAndDecodeTransaction(signed));
    const account = canonicalAccount(transaction.appAccountToken);
    if (!account || account !== canonicalAccount(actor) || !products.has(transaction.productId)) {
      throw new HttpError(403,'subscription_account_mismatch');
    }
    await reconcile(transaction, account);
  }

  async function receive(request) {
    try {
      const signed = await signedField(request, 'signedPayload');
      const notice = await verifyInput(() => verifier.verifyAndDecodeNotification(signed));
      if (notice.notificationType === 'TEST' || !notice.data?.signedTransactionInfo) return json(null,204);
      const transaction = await verifyInput(() => verifier.verifyAndDecodeTransaction(notice.data.signedTransactionInfo));
      if (!products.has(transaction.productId)) return json(null,204);
      const original = transaction.originalTransactionId;
      if (!originalID.test(original ?? '')) throw new HttpError(422,'invalid_transaction');
      const account = canonicalAccount(transaction.appAccountToken) ?? (await db.query(
        'select spotme_private.apple_subscription_owner($1,$2) as actor',[environment,original]
      )).rows[0].actor;
      if (account) await reconcile(transaction, account);
      return json(null,204);
    } catch (error) {
      if (error instanceof HttpError) return json({error:error.code},error.status);
      if (error?.code === '23503') return json(null,204); // The SpotMe account was deleted.
      return json({error:'billing_unavailable'},503);
    }
  }

  return {environment,claim,receive};
}

async function configureAppleBilling(env, db) {
  const environment = env.SPOTME_APPLE_ENVIRONMENT;
  const appID = Number(env.SPOTME_APPLE_APP_ID);
  const required = ['SPOTME_APPLE_KEY_FILE','SPOTME_APPLE_KEY_ID','SPOTME_APPLE_ISSUER_ID','SPOTME_APPLE_ROOT_FILES'];
  if (![Environment.PRODUCTION,Environment.SANDBOX].includes(environment) || required.some(key => !env[key]) ||
      (environment === Environment.PRODUCTION && (!Number.isSafeInteger(appID) || appID <= 0))) {
    throw new Error('Configure Apple billing environment, credentials, trusted roots, and production app ID.');
  }
  const [key, roots] = await Promise.all([
    readFile(env.SPOTME_APPLE_KEY_FILE,'utf8'),
    Promise.all(env.SPOTME_APPLE_ROOT_FILES.split(',').map(file => readFile(file.trim())))
  ]);
  const verifier = new SignedDataVerifier(roots,true,environment,bundleID,appID || undefined);
  const apple = new AppStoreServerAPIClient(key,env.SPOTME_APPLE_KEY_ID,env.SPOTME_APPLE_ISSUER_ID,bundleID,environment);
  return createAppleBilling({environment,verifier,apple,db});
}

export {configureAppleBilling, createAppleBilling};
