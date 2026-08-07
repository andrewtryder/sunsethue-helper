/**
 * Private credential-administration Worker.
 *
 * Callable only via Cloudflare service binding RPC.
 * Holds CLOUDFLARE_API_TOKEN; never exposed to the main Worker or the browser.
 */
import { WorkerEntrypoint } from "cloudflare:workers";
import { auditLog } from "./audit.js";
import { emailStatusFromTransport, pushoverStatusFromTransport } from "../lib/masking.js";
import { replaceProviderSecret } from "./secrets-store-client.js";
import {
  buildEmailTransportDocument,
  buildPushoverTransportDocument,
  CredentialError,
  parseEmailTransport,
  parsePushoverTransport,
  unconfiguredSentinel
} from "../lib/transport-schema.js";
import { SECRETS_STORE_GET_TIMEOUT_MS, withTimeout } from "../lib/timeout.js";

const EMAIL_SECRET_NAME = "SUNSETHUE_EMAIL_TRANSPORT";
const PUSHOVER_SECRET_NAME = "SUNSETHUE_PUSHOVER_TRANSPORT";

const EMAIL_UPDATE_FIELDS = new Set(["gmailUser", "gmailAppPassword", "emailFrom"]);
const PUSHOVER_UPDATE_FIELDS = new Set(["appToken", "userKey"]);

function rejectUnknown(input, allowed) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CredentialError("INVALID_EMAIL_CREDENTIALS");
  }
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new CredentialError("INVALID_EMAIL_CREDENTIALS");
    }
  }
}

async function readBoundSecret(binding) {
  if (!binding || typeof binding.get !== "function") {
    return null;
  }
  try {
    return await withTimeout(binding.get(), SECRETS_STORE_GET_TIMEOUT_MS, "SECRETS_STORE_GET_TIMEOUT");
  } catch {
    return null;
  }
}

export class CredentialAdminEntrypoint extends WorkerEntrypoint {
  async getStatus(meta = {}) {
    const emailRaw = await readBoundSecret(this.env.EMAIL_TRANSPORT_SECRET);
    const pushoverRaw = await readBoundSecret(this.env.PUSHOVER_TRANSPORT_SECRET);
    let emailTransport = { configured: false };
    let pushoverTransport = { configured: false };
    try {
      emailTransport = emailRaw ? parseEmailTransport(emailRaw) : { configured: false };
    } catch {
      emailTransport = { configured: false };
    }
    try {
      pushoverTransport = pushoverRaw ? parsePushoverTransport(pushoverRaw) : { configured: false };
    } catch {
      pushoverTransport = { configured: false };
    }
    return {
      email: emailStatusFromTransport(emailTransport, meta.email || {}),
      pushover: pushoverStatusFromTransport(pushoverTransport, meta.pushover || {})
    };
  }

  async updateEmail(input = {}, context = {}) {
    rejectUnknown(input, EMAIL_UPDATE_FIELDS);
    const existingRaw = await readBoundSecret(this.env.EMAIL_TRANSPORT_SECRET);
    let existing = null;
    try {
      existing = existingRaw ? parseEmailTransport(existingRaw) : null;
    } catch {
      existing = null;
    }

    const gmailUser = typeof input.gmailUser === "string" ? input.gmailUser.trim() : "";
    const emailFrom = typeof input.emailFrom === "string" ? input.emailFrom.trim() : "";
    let gmailAppPassword = typeof input.gmailAppPassword === "string" ? input.gmailAppPassword : "";

    const passwordOmitted = gmailAppPassword === "";
    if (!existing?.configured) {
      if (!gmailUser || !emailFrom || passwordOmitted) {
        throw new CredentialError("INVALID_EMAIL_CREDENTIALS");
      }
    } else {
      if (!gmailUser || !emailFrom) {
        throw new CredentialError("INVALID_EMAIL_CREDENTIALS");
      }
      if (passwordOmitted) {
        gmailAppPassword = existing.gmailAppPassword;
      }
      // Changing Gmail username without an explicit password is rejected unless retaining.
      if (gmailUser.toLowerCase() !== existing.gmailUser && passwordOmitted) {
        throw new CredentialError("INVALID_EMAIL_CREDENTIALS");
      }
    }

    const { serialized, document } = buildEmailTransportDocument({
      gmailUser,
      gmailAppPassword,
      emailFrom
    });

    await replaceProviderSecret(
      this.env,
      EMAIL_SECRET_NAME,
      serialized,
      "sunsethue-helper email transport (Gmail SMTP)"
    );

    auditLog({
      event: "provider_credentials_updated",
      provider: "email",
      requestId: context.requestId || null,
      actor: context.actor || null,
      outcome: "success"
    });

    const now = context.now || Date.now();
    return emailStatusFromTransport(document, {
      updatedAt: now,
      lastValidationCode: "OK"
    });
  }

  async removeEmail(context = {}) {
    const { serialized } = unconfiguredSentinel();
    await replaceProviderSecret(
      this.env,
      EMAIL_SECRET_NAME,
      serialized,
      "sunsethue-helper email transport (unconfigured)"
    );
    auditLog({
      event: "provider_credentials_updated",
      provider: "email",
      requestId: context.requestId || null,
      actor: context.actor || null,
      outcome: "removed"
    });
    return emailStatusFromTransport({ configured: false }, {
      updatedAt: context.now || Date.now(),
      lastValidationCode: null
    });
  }

  async updatePushover(input = {}, context = {}) {
    rejectUnknown(input, PUSHOVER_UPDATE_FIELDS);
    const existingRaw = await readBoundSecret(this.env.PUSHOVER_TRANSPORT_SECRET);
    let existing = null;
    try {
      existing = existingRaw ? parsePushoverTransport(existingRaw) : null;
    } catch {
      existing = null;
    }

    let appToken = typeof input.appToken === "string" ? input.appToken : "";
    let userKey = typeof input.userKey === "string" ? input.userKey : "";
    const tokenOmitted = appToken === "";
    const keyOmitted = userKey === "";

    if (!existing?.configured) {
      if (tokenOmitted || keyOmitted) {
        throw new CredentialError("INVALID_PUSHOVER_CREDENTIALS");
      }
    } else {
      if (tokenOmitted) appToken = existing.appToken;
      if (keyOmitted) userKey = existing.userKey;
      if (!appToken || !userKey) {
        throw new CredentialError("INVALID_PUSHOVER_CREDENTIALS");
      }
    }

    const { serialized, document } = buildPushoverTransportDocument({ appToken, userKey });
    await replaceProviderSecret(
      this.env,
      PUSHOVER_SECRET_NAME,
      serialized,
      "sunsethue-helper pushover transport"
    );

    auditLog({
      event: "provider_credentials_updated",
      provider: "pushover",
      requestId: context.requestId || null,
      actor: context.actor || null,
      outcome: "success"
    });

    const now = context.now || Date.now();
    return pushoverStatusFromTransport(document, {
      updatedAt: now,
      lastValidationCode: "OK"
    });
  }

  async removePushover(context = {}) {
    const { serialized } = unconfiguredSentinel();
    await replaceProviderSecret(
      this.env,
      PUSHOVER_SECRET_NAME,
      serialized,
      "sunsethue-helper pushover transport (unconfigured)"
    );
    auditLog({
      event: "provider_credentials_updated",
      provider: "pushover",
      requestId: context.requestId || null,
      actor: context.actor || null,
      outcome: "removed"
    });
    return pushoverStatusFromTransport({ configured: false }, {
      updatedAt: context.now || Date.now(),
      lastValidationCode: null
    });
  }
}

export default {
  async fetch() {
    return new Response("Not Found", { status: 404 });
  }
};
