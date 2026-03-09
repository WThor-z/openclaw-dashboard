import { BlockList, isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";

const METADATA_IPV4_ADDRESSES = ["169.254.169.254", "168.63.129.16"];
const METADATA_IPV6_ADDRESSES = ["fd00:ec2::254"];
const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

const blockedIpv4 = new BlockList();
blockedIpv4.addSubnet("0.0.0.0", 8, "ipv4");
blockedIpv4.addSubnet("10.0.0.0", 8, "ipv4");
blockedIpv4.addSubnet("127.0.0.0", 8, "ipv4");
blockedIpv4.addSubnet("169.254.0.0", 16, "ipv4");
blockedIpv4.addSubnet("172.16.0.0", 12, "ipv4");
blockedIpv4.addSubnet("192.168.0.0", 16, "ipv4");
blockedIpv4.addSubnet("100.64.0.0", 10, "ipv4");
blockedIpv4.addSubnet("198.18.0.0", 15, "ipv4");
for (const address of METADATA_IPV4_ADDRESSES) {
  blockedIpv4.addAddress(address, "ipv4");
}

const blockedIpv6 = new BlockList();
blockedIpv6.addAddress("::", "ipv6");
blockedIpv6.addAddress("::1", "ipv6");
blockedIpv6.addSubnet("fe80::", 10, "ipv6");
blockedIpv6.addSubnet("fc00::", 7, "ipv6");
for (const address of METADATA_IPV6_ADDRESSES) {
  blockedIpv6.addAddress(address, "ipv6");
}

function normalizeHostname(hostname) {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function parseAllowlistEntries(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue.map((entry) => String(entry).trim().toLowerCase()).filter((entry) => entry.length > 0);
  }

  if (typeof rawValue === "string") {
    return rawValue
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0);
  }

  return [];
}

function hostMatchesAllowlist(hostname, allowlistEntries) {
  return allowlistEntries.some((entry) => {
    if (entry.startsWith("*.")) {
      const wildcardSuffix = entry.slice(2);
      return wildcardSuffix.length > 0 && hostname.endsWith(`.${wildcardSuffix}`);
    }

    return hostname === entry || hostname.endsWith(`.${entry}`);
  });
}

function extractMappedIpv4(ipv6Address) {
  const normalized = ipv6Address.toLowerCase();
  if (!normalized.startsWith("::ffff:")) {
    return null;
  }

  const mapped = normalized.slice("::ffff:".length);
  return isIP(mapped) === 4 ? mapped : null;
}

function isBlockedIpAddress(ipAddress) {
  const ipVersion = isIP(ipAddress);
  if (ipVersion === 4) {
    return blockedIpv4.check(ipAddress, "ipv4");
  }

  if (ipVersion !== 6) {
    return false;
  }

  if (blockedIpv6.check(ipAddress, "ipv6")) {
    return true;
  }

  const mappedIpv4 = extractMappedIpv4(ipAddress);
  return mappedIpv4 ? blockedIpv4.check(mappedIpv4, "ipv4") : false;
}

function isBlockedHostname(hostname) {
  return BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost");
}

export class WebhookEndpointPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WebhookEndpointPolicyError";
    this.code = code;
  }
}

export function resolveWebhookEndpointPolicy({
  allowHttp = process.env.DAEMON_WEBHOOK_ALLOW_HTTP === "1",
  allowPrivateAddresses = process.env.DAEMON_WEBHOOK_ALLOW_PRIVATE_ADDRESSES === "1",
  allowlist = process.env.DAEMON_WEBHOOK_ALLOWLIST,
  resolveHostname = async (hostname) => {
    const records = await dnsLookup(hostname, { all: true });
    return records
      .map((record) => String(record?.address ?? "").trim())
      .filter((address) => address.length > 0);
  }
} = {}) {
  return {
    allowHttp,
    allowPrivateAddresses,
    allowlistHosts: parseAllowlistEntries(allowlist),
    resolveHostname
  };
}

async function assertResolvedAddressesAllowed(hostname, resolveHostname) {
  let addresses;
  try {
    addresses = await resolveHostname(hostname);
  } catch {
    throw new WebhookEndpointPolicyError(
      "ENDPOINT_URL_HOST_UNRESOLVABLE",
      "endpointUrl host could not be resolved"
    );
  }

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new WebhookEndpointPolicyError(
      "ENDPOINT_URL_HOST_UNRESOLVABLE",
      "endpointUrl host could not be resolved"
    );
  }

  for (const address of addresses) {
    if (isBlockedIpAddress(address)) {
      throw new WebhookEndpointPolicyError(
        "ENDPOINT_URL_PRIVATE_IP_FORBIDDEN",
        "endpointUrl IP is not allowed"
      );
    }
  }
}

export async function normalizeAndValidateWebhookEndpoint(endpointUrl, policy = {}) {
  if (typeof endpointUrl !== "string" || endpointUrl.trim().length === 0) {
    throw new WebhookEndpointPolicyError("ENDPOINT_URL_REQUIRED", "endpointUrl is required");
  }

  let parsed;
  try {
    parsed = new URL(endpointUrl.trim());
  } catch {
    throw new WebhookEndpointPolicyError("ENDPOINT_URL_INVALID", "endpointUrl must be a valid URL");
  }

  const allowHttp = policy.allowHttp === true;
  const allowPrivateAddresses = policy.allowPrivateAddresses === true;
  const allowlistHosts = parseAllowlistEntries(policy.allowlistHosts);
  const resolveHostname =
    typeof policy.resolveHostname === "function"
      ? policy.resolveHostname
      : async (hostname) => {
        const records = await dnsLookup(hostname, { all: true });
        return records
          .map((record) => String(record?.address ?? "").trim())
          .filter((address) => address.length > 0);
      };
  const protocol = parsed.protocol.toLowerCase();

  if (protocol !== "https:" && !(allowHttp && protocol === "http:")) {
    throw new WebhookEndpointPolicyError(
      "ENDPOINT_URL_PROTOCOL_FORBIDDEN",
      "endpointUrl must use HTTPS"
    );
  }

  if (parsed.username || parsed.password) {
    throw new WebhookEndpointPolicyError(
      "ENDPOINT_URL_CREDENTIALS_FORBIDDEN",
      "endpointUrl must not include URL credentials"
    );
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (hostname.length === 0) {
    throw new WebhookEndpointPolicyError("ENDPOINT_URL_INVALID", "endpointUrl hostname is required");
  }

  if (allowlistHosts.length > 0 && !hostMatchesAllowlist(hostname, allowlistHosts)) {
    throw new WebhookEndpointPolicyError(
      "ENDPOINT_URL_HOST_NOT_ALLOWLISTED",
      "endpointUrl host is not in allowlist"
    );
  }

  if (!allowPrivateAddresses) {
    if (isBlockedHostname(hostname)) {
      throw new WebhookEndpointPolicyError(
        "ENDPOINT_URL_PRIVATE_HOST_FORBIDDEN",
        "endpointUrl host is not allowed"
      );
    }

    if (isBlockedIpAddress(hostname)) {
      throw new WebhookEndpointPolicyError(
        "ENDPOINT_URL_PRIVATE_IP_FORBIDDEN",
        "endpointUrl IP is not allowed"
      );
    }

    if (isIP(hostname) === 0) {
      await assertResolvedAddressesAllowed(hostname, resolveHostname);
    }
  }

  parsed.hostname = hostname;
  return parsed.toString();
}
