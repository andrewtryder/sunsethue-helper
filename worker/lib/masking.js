/**
 * Masked status helpers. Never include full secrets.
 */

function maskLocalPart(local) {
  if (!local || local.length <= 2) return `${local?.[0] || "*"}***`;
  return `${local.slice(0, 2)}***`;
}

export function maskEmail(email) {
  if (typeof email !== "string" || !email.includes("@")) return "***";
  const [local, domain] = email.split("@");
  return `${maskLocalPart(local)}@${domain}`;
}

export function maskMailbox(mailbox) {
  if (typeof mailbox !== "string") return "***";
  const open = mailbox.indexOf("<");
  const close = mailbox.lastIndexOf(">");
  if (open >= 0 && close > open) {
    const name = mailbox.slice(0, open).trim();
    const email = mailbox.slice(open + 1, close).trim();
    const nameMasked = name ? `${name.slice(0, 2)}***` : "";
    return nameMasked ? `${nameMasked} <${maskEmail(email)}>` : maskEmail(email);
  }
  return maskEmail(mailbox);
}

export function emailStatusFromTransport(transport, meta = {}) {
  if (!transport?.configured) {
    return {
      configured: false,
      gmailUserMasked: null,
      emailFromMasked: null,
      updatedAt: meta.updatedAt ?? null,
      lastValidationCode: meta.lastValidationCode ?? null
    };
  }
  return {
    configured: true,
    gmailUserMasked: maskEmail(transport.gmailUser),
    emailFromMasked: maskMailbox(transport.emailFrom),
    updatedAt: meta.updatedAt ?? null,
    lastValidationCode: meta.lastValidationCode ?? "OK"
  };
}

export function pushoverStatusFromTransport(transport, meta = {}) {
  if (!transport?.configured) {
    return {
      configured: false,
      appTokenPresent: false,
      userKeyPresent: false,
      updatedAt: meta.updatedAt ?? null,
      lastValidationCode: meta.lastValidationCode ?? null
    };
  }
  return {
    configured: true,
    appTokenPresent: true,
    userKeyPresent: true,
    updatedAt: meta.updatedAt ?? null,
    lastValidationCode: meta.lastValidationCode ?? "OK"
  };
}
