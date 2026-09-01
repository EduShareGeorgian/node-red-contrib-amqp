import { Node, NodeAPI } from 'node-red'
import { BrokerConfig } from './types'

export function resolveBrokerId(
  RED: NodeAPI,
  node: Node,
  rawBroker: unknown,
): string {
  let brokerId = String(rawBroker ?? '').trim()
  if (!brokerId) {
    return brokerId
  }

  for (let depth = 0; depth < 6; depth += 1) {
    const placeholderMatch = brokerId.match(/^\$\{([^}]+)\}$/)
    if (!placeholderMatch) {
      return brokerId
    }

    const key = placeholderMatch[1].trim()
    let resolved = ''
    try {
      resolved = String(
        RED.util?.evaluateEnvProperty?.(brokerId, node) ?? '',
      ).trim()
    } catch (_e) {
      // Try the parent subflow scope below.
    }

    if (resolved && resolved !== brokerId) {
      brokerId = resolved
      continue
    }

    if (!key.startsWith('$parent.')) {
      const parentKey = '${$parent.' + key + '}'
      let parentResolved = ''
      try {
        parentResolved = String(
          RED.util?.evaluateEnvProperty?.(parentKey, node) ?? '',
        ).trim()
      } catch (_e) {
        // Return the unresolved value below.
      }

      if (parentResolved && parentResolved !== parentKey) {
        brokerId = parentResolved
        continue
      }
    }

    break
  }

  return brokerId
}

export function getBrokerCredentials(
  RED: NodeAPI,
  broker: BrokerConfig,
): { username: string; password: string } {
  if (!broker.credsFromSettings) {
    return broker.credentials || { username: '', password: '' }
  }

  const settings = RED.settings as unknown as Record<string, string | undefined>
  return {
    username: settings.MW_CONTRIB_AMQP_USERNAME || '',
    password: settings.MW_CONTRIB_AMQP_PASSWORD || '',
  }
}

export function getBrokerUrl(RED: NodeAPI, broker: BrokerConfig): string {
  const { host, port, vhost, tls } = broker
  const { username, password } = getBrokerCredentials(RED, broker)
  const protocol = tls ? 'amqps' : 'amqp'
  const encodedVhost = encodeURIComponent(vhost || '')

  return `${protocol}://${encodeURIComponent(username)}:${encodeURIComponent(
    password,
  )}@${host}:${port}/${encodedVhost}`
}
