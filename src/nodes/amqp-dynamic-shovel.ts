import { Node, NodeAPI, NodeDef, NodeMessage } from 'node-red'
import { BrokerConfig } from '../types'
import { getBrokerUrl, resolveBrokerId } from '../broker-utils'

type ShovelAction = 'create' | 'update' | 'delete' | 'status' | 'restart'
type DestinationType = 'exchange' | 'queue'

interface DynamicShovelConfig extends NodeDef {
  managementBroker: string
  managementPort: number
  managementTls: boolean
  shovelVhost: string
  shovelName: string
  sourceBroker: string
  sourceQueue: string
  sourcePredeclared: boolean
  prefetch: number
  destinationBroker: string
  destinationType: DestinationType
  destinationName: string
  destinationRoutingKey: string
  destinationPredeclared: boolean
  ackMode: 'on-confirm' | 'on-publish' | 'no-ack'
  reconnectDelay: number
  deleteAfter: string
  addForwardHeaders: boolean
}

interface ShovelMessage extends NodeMessage {
  action?: ShovelAction
}

interface ManagementCredentials {
  managementUsername: string
  managementPassword: string
}

function encodePath(value: string): string {
  return encodeURIComponent(value || '/')
}

module.exports = function (RED: NodeAPI): void {
  function DynamicShovel(
    this: Node<ManagementCredentials>,
    config: DynamicShovelConfig,
  ): void {
    RED.nodes.createNode(this, config)

    const getBroker = (reference: string, label: string): BrokerConfig => {
      const brokerId = resolveBrokerId(RED, this, reference)
      const broker = RED.nodes.getNode(brokerId) as unknown as BrokerConfig
      if (!broker) {
        throw new Error(`${label} AMQP broker node not found: ${brokerId}`)
      }
      return broker
    }

    const getManagementUrl = (action: ShovelAction): string => {
      const broker = getBroker(config.managementBroker, 'Management')
      const protocol = config.managementTls ? 'https' : 'http'
      const base = `${protocol}://${broker.host}:${Number(config.managementPort)}`
      const vhost = encodePath(config.shovelVhost || broker.vhost)
      const name = encodePath(config.shovelName)

      if (action === 'status') {
        return `${base}/api/shovels/vhost/${vhost}/${name}`
      }
      if (action === 'restart') {
        return `${base}/api/shovels/vhost/${vhost}/${name}/restart`
      }
      return `${base}/api/parameters/shovel/${vhost}/${name}`
    }

    const buildDefinition = (): Record<string, unknown> => {
      if (!config.sourceQueue) {
        throw new Error('Source queue is required')
      }
      if (!config.destinationName) {
        throw new Error('Destination name is required')
      }
      const sourceBroker = getBroker(config.sourceBroker, 'Source')
      const destinationBroker = getBroker(
        config.destinationBroker,
        'Destination',
      )
      const deleteAfter = config.deleteAfter || 'never'
      const deleteAfterCount = Number(deleteAfter)
      const normalizedDeleteAfter =
        Number.isInteger(deleteAfterCount) && deleteAfterCount > 0
          ? deleteAfterCount
          : deleteAfter
      if (
        !['never', 'queue-length'].includes(String(normalizedDeleteAfter)) &&
        typeof normalizedDeleteAfter !== 'number'
      ) {
        throw new Error(
          'Delete after must be never, queue-length, or a positive integer',
        )
      }
      if (config.ackMode === 'no-ack' && normalizedDeleteAfter !== 'never') {
        throw new Error('Delete after cannot be used with no-ack mode')
      }

      const value: Record<string, unknown> = {
        'src-protocol': 'amqp091',
        'src-uri': getBrokerUrl(RED, sourceBroker),
        'src-queue': config.sourceQueue,
        'src-predeclared': config.sourcePredeclared,
        'src-prefetch-count': Number(config.prefetch),
        'dest-protocol': 'amqp091',
        'dest-uri': getBrokerUrl(RED, destinationBroker),
        'ack-mode': config.ackMode,
        'reconnect-delay': Number(config.reconnectDelay),
        'src-delete-after': normalizedDeleteAfter,
        'dest-add-forward-headers': config.addForwardHeaders,
      }

      if (config.destinationType === 'queue') {
        value['dest-queue'] = config.destinationName
        value['dest-predeclared'] = config.destinationPredeclared
      } else {
        value['dest-exchange'] = config.destinationName
        if (config.destinationRoutingKey) {
          value['dest-exchange-key'] = config.destinationRoutingKey
        }
      }

      return { value }
    }

    this.on('input', async (msg: ShovelMessage, send, done) => {
      const action = msg.action || 'create'
      try {
        if (
          !['create', 'update', 'delete', 'status', 'restart'].includes(action)
        ) {
          throw new Error(`Unsupported shovel action: ${action}`)
        }
        if (!config.shovelName) {
          throw new Error('Shovel name is required')
        }

        const method =
          action === 'status'
            ? 'GET'
            : action === 'create' || action === 'update'
              ? 'PUT'
              : 'DELETE'
        const request: RequestInit = {
          method,
          headers: {
            Accept: 'application/json',
            Authorization: `Basic ${Buffer.from(
              `${this.credentials.managementUsername || ''}:${this.credentials.managementPassword || ''}`,
            ).toString('base64')}`,
          },
        }
        if (method === 'PUT') {
          request.headers = {
            ...request.headers,
            'Content-Type': 'application/json',
          }
          request.body = JSON.stringify(buildDefinition())
        }

        const response = await fetch(getManagementUrl(action), request)
        const responseText = await response.text()
        let payload: unknown = responseText
        if (responseText) {
          try {
            payload = JSON.parse(responseText)
          } catch (_e) {
            // Keep non-JSON management responses as text.
          }
        }

        msg.payload = payload
        msg.statusCode = response.status
        const managementBroker = getBroker(
          config.managementBroker,
          'Management',
        )
        msg.shovel = {
          action,
          name: config.shovelName,
          vhost: config.shovelVhost || managementBroker.vhost || '/',
        }
        if (!response.ok) {
          throw new Error(
            `RabbitMQ management request failed (${response.status} ${response.statusText})`,
          )
        }

        send(msg)
        done?.()
      } catch (error) {
        if (done) {
          done(error as Error)
        } else {
          this.error(error as Error, msg)
        }
      }
    })
  }

  RED.nodes.registerType('amqp-dynamic-shovel', DynamicShovel, {
    credentials: {
      managementUsername: { type: 'text' },
      managementPassword: { type: 'password' },
    },
  })
}
