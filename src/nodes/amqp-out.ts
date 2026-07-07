import { NodeAPI, EditorNodeProperties, Node } from 'node-red'
import { NODE_STATUS } from '../constants'
import {
  AmqpInNodeDefaults,
  AmqpOutNodeDefaults,
  ErrorLocationEnum,
  ErrorType,
  NodeType,
} from '../types'
import Amqp from '../Amqp'
import { MessageProperties } from 'amqplib'

type ReconnectFn = () => Promise<void>
type ManagedConnection = Awaited<ReturnType<Amqp['connect']>>
type ManagedChannel = Awaited<ReturnType<Amqp['initialize']>>

module.exports = function (RED: NodeAPI): void {
  function AmqpOut(
    this: Node,
    config: EditorNodeProperties & {
      exchangeRoutingKey: string
      exchangeRoutingKeyType: string
      amqpProperties: string
    },
  ): void {
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

    const amqp = new Amqp(RED, this, configAmqp)

    const reconnectOnError = configAmqp.reconnectOnError

    // handle input event;
    const inputListener = async (
      msg: any,
      _: any,
      done?: (err?: any) => void,
    ) => {
      try {
        const { payload, routingKey, properties: msgProperties } = msg
        const { exchangeRoutingKey, exchangeRoutingKeyType, amqpProperties } =
          config

        // message properties override config properties
        let properties: MessageProperties
        try {
          properties = {
            ...JSON.parse(amqpProperties),
            ...msgProperties,
          }
        } catch (e) {
          properties = msgProperties
        }

        switch (exchangeRoutingKeyType) {
          case 'msg':
          case 'flow':
          case 'global':
            amqp.setRoutingKey(
              RED.util.evaluateNodeProperty(
                exchangeRoutingKey,
                exchangeRoutingKeyType,
                this,
                msg,
              ),
            )
            break
          case 'jsonata':
            const evaluateJSONataasPromise = (
              exchangeRoutingKey: any,
              msg: any,
              amqp: any,
            ): Promise<void> => {
              return new Promise((resolve, reject) => {
                RED.util.evaluateJSONataExpression(
                  RED.util.prepareJSONataExpression(exchangeRoutingKey, this),
                  msg,
                  function (er, val) {
                    if (er) {
                      reject(er)
                    } else {
                      amqp.setRoutingKey(val)
                      resolve()
                    }
                  },
                )
              })
            }
            await evaluateJSONataasPromise(exchangeRoutingKey, msg, amqp)
            break
          case 'str':
          default:
            if (routingKey) {
              // if incoming payload contains a routingKey value
              // override our string value with it.

              // Superfluous (and possibly confusing) at this point
              // but keeping it to retain backwards compatibility
              amqp.setRoutingKey(routingKey)
            }
            break
        }

        if (!!properties?.headers?.doNotStringifyPayload) {
          await amqp.publish(payload, properties)
        } else {
          await amqp.publish(JSON.stringify(payload), properties)
        }

        done && done()
      } catch (e) {
        if (done) {
          done(e)
        } else {
          this.error(e, msg)
        }
      }
    }

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
      nodeIns.log('AMQP state: initializing out node')
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
            'AMQP state: reconnect requested, cleaning up out node resources',
          )
          // check the channel and clear all the event listeners
          if (channel && channel.removeAllListeners) {
            channel.removeAllListeners()
            channel.close().catch(() => {
              // ignore channel close errors during reconnect cleanup
            })
            channel = null
          }

          // check the connection and clear all the event listeners
          if (connection && connection.removeAllListeners) {
            connection.removeAllListeners()
            connection.close().catch(() => {
              // ignore connection close errors during reconnect cleanup
            })
            connection = null
          }
        } catch (e) {
          // ignore cleanup errors
        }
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

          // When the server goes down
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

          // When the channel error occur
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
          nodeIns.error(`AmqpOut() Could not connect to broker ${e}`, {
            payload: { error: e, location: ErrorLocationEnum.ConnectError },
          })
        } else {
          nodeIns.status(NODE_STATUS.Error)
          nodeIns.error(`AmqpOut() ${e}`, {
            payload: { error: e, location: ErrorLocationEnum.ConnectError },
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
  RED.nodes.registerType(NodeType.AmqpOut, AmqpOut)
}
