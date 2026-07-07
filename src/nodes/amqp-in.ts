import { NodeAPI, EditorNodeProperties, Node } from 'node-red'
import { NODE_STATUS } from '../constants'
import {
  AmqpInNodeDefaults,
  AmqpOutNodeDefaults,
  ErrorType,
  NodeType,
  ErrorLocationEnum,
} from '../types'
import Amqp from '../Amqp'
import { processReconnect } from '../common/amqp-utils'

type ReconnectFn = () => Promise<void>
type ManagedConnection = Awaited<ReturnType<Amqp['connect']>>
type ManagedChannel = Awaited<ReturnType<Amqp['initialize']>>

module.exports = function (RED: NodeAPI): void {
  function AmqpIn(this: Node, config: EditorNodeProperties): void {
    let reconnectTimeout: NodeJS.Timeout
    let reconnect: ReconnectFn = async () => {}
    let connection: ManagedConnection | null = null
    let channel: ManagedChannel | null = null
    let reconnectPending = false

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    RED.nodes.createNode(this, config)
    const lifecycleTag = `[instance=${this.id || 'unknown'}]`
    this.log(`${lifecycleTag} Node-RED lifecycle: node created`)

    RED.events.once('flows:stopped', () => {
      this.log(`${lifecycleTag} Node-RED lifecycle: flows:stopped received`)
      clearTimeout(reconnectTimeout)
    })

    this.status(NODE_STATUS.Disconnected)

    const configAmqp: AmqpInNodeDefaults & AmqpOutNodeDefaults = config

    // Enhancement: If no queue name, do not setup AMQP
    if (!configAmqp.queueName || String(configAmqp.queueName).trim() === '') {
      this.status({ fill: 'red', shape: 'ring', text: 'No queue name' })
      this.warn('AMQP not initialized: queue name is missing in configuration.')
      return
    }

    const amqp = new Amqp(RED, this, configAmqp)

    const reconnectOnError = configAmqp.reconnectOnError

    const inputListener = async (
      msg: any,
      _: any,
      done?: (err?: any) => void,
    ) => {
      // Then handle reconnect if needed.
      await processReconnect(msg, reconnect, done)
    }

    // receive input reconnectCall
    this.log(`${lifecycleTag} Node-RED lifecycle: input handler registered`)
    this.on('input', inputListener)
    // When the node is re-deployed
    this.on('close', (done: () => void): void => {
      this.log(`${lifecycleTag} Node-RED lifecycle: close handler start`)
      clearTimeout(reconnectTimeout)
      reconnectPending = false

      try {
        if (channel && channel.removeAllListeners) {
          channel.removeAllListeners()
          channel.close().catch(() => {
            // ignore channel close errors during teardown
          })
          channel = null
        }

        if (connection && connection.removeAllListeners) {
          connection.removeAllListeners()
          connection.close().catch(() => {
            // ignore connection close errors during teardown
          })
          connection = null
        }
      } catch (_e) {
        // ignore teardown cleanup errors
      }

      amqp.close().catch(() => {
        // ignore AMQP teardown errors
      })

      this.log(`${lifecycleTag} Node-RED lifecycle: close handler done`)
      done && done()
    })

    async function initializeNode(nodeIns: Node) {
      reconnectPending = false
      nodeIns.log('AMQP state: initializing input node')
      reconnect = async () => {
        if (reconnectPending) {
          nodeIns.log(
            'AMQP state: reconnect already pending, skipping duplicate request',
          )
          return
        }

        reconnectPending = true
        try {
          nodeIns.log(
            'AMQP state: reconnect requested, cleaning up input node resources',
          )
          // check the channel and clear all the event listener
          if (channel && channel.removeAllListeners) {
            channel.removeAllListeners()
            channel.close().catch(() => {
              // ignore channel close errors during reconnect cleanup
            })
            channel = null
          }

          // check the connection and clear all the event listener
          if (connection && connection.removeAllListeners) {
            connection.removeAllListeners()
            connection.close().catch(() => {
              // ignore connection close errors during reconnect cleanup
            })
            connection = null
          }
        } catch (_e) {}
        // always clear timer before set it;
        clearTimeout(reconnectTimeout)
        nodeIns.log('AMQP state: scheduling reconnect in 2000ms')
        reconnectTimeout = setTimeout(() => {
          // Retry cycle is starting; allow a fresh reconnect schedule if this attempt fails.
          reconnectPending = false
          nodeIns.log('AMQP state: reconnect retry starting')
          initializeNode(nodeIns).catch(() => {
            nodeIns.log(
              'AMQP state: reconnect retry failed, scheduling another retry',
            )
            void reconnect()
          })
        }, 2000)
      }

      try {
        connection = await amqp.connect()

        // istanbul ignore else
        if (connection) {
          channel = await amqp.initialize()
          await amqp.consume()

          // When the connection goes down
          connection.on('close', async () => {
            await reconnect()
          })

          // When the connection goes down
          connection.on('error', async e => {
            reconnectOnError && (await reconnect())
            nodeIns.error(`Connection error ${e}`, {
              payload: {
                error: e,
                location: ErrorLocationEnum.ConnectionErrorEvent,
              },
            })
          })

          // When the channel goes down
          channel.on('close', async () => {
            await reconnect()
          })

          // When the channel goes down
          channel.on('error', async e => {
            reconnectOnError && (await reconnect())
            nodeIns.error(`Channel error ${e}`, {
              payload: {
                error: e,
                location: ErrorLocationEnum.ChannelErrorEvent,
              },
            })
          })

          nodeIns.status(NODE_STATUS.Connected)
        }
      } catch (e) {
        const err = e as { code?: string }
        nodeIns.log(`AMQP state: connect failed (${err.code || 'unknown'})`)
        if (err.code === ErrorType.InvalidLogin) {
          nodeIns.status(NODE_STATUS.Invalid)
          nodeIns.error(`AmqpIn() Could not connect to broker ${e}`, {
            payload: { error: e, location: ErrorLocationEnum.ConnectError },
          })
        } else {
          nodeIns.status(NODE_STATUS.Error)
          nodeIns.error(`AmqpIn() ${e}`, {
            payload: { error: e, source: 'ConnectionError' },
          })
        }

        reconnectOnError && (await reconnect())
      }
    }

    // call
    initializeNode(this)
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  RED.nodes.registerType(NodeType.AmqpIn, AmqpIn)
}
