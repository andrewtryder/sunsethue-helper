/**
 * Safe audit logging for credential-admin operations.
 * Never logs request bodies, tokens, or secret values.
 */

export function auditLog({ event, provider, requestId, actor, outcome }) {
  console.log(
    JSON.stringify({
      event,
      provider,
      requestId: requestId || null,
      actor: actor || null,
      outcome
    })
  );
}
