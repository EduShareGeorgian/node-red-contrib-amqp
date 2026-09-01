# source

This repo fork from @stormwolf/node-red-contrib-amqp

and

- upgrade amqplib so you can use it with node10+
- fixed direct routing publish issues
- allow reconnect on error
- manually control node reconnect
- fixed multi event listener on connection (cause memory leak)

AMQP nodes for node-red

## Installation

Install via the Palette Manager or from within your node-red directory (typically `~/.node-red`) run:

```
npm i @stormpass/node-red-contrib-amqp
```

## Usage

Provides AMQP input, output, manual acknowledgement, and dynamic shovel nodes,
plus an AMQP broker config node.

The `amqp-dynamic-shovel` node uses RabbitMQ's Management HTTP API to create,
update, delete, inspect, and restart dynamic shovels. Source and destination
broker fields accept separate AMQP broker config nodes, allowing messages to be
moved across virtual hosts or RabbitMQ clusters. Management API credentials are
stored as Node-RED credentials and are never added to output messages.

Set `msg.action` to `create`, `update`, `delete`, `status`, or `restart`. Create
is the default. The RabbitMQ management plugin is required for all operations;
status and restart also require the `rabbitmq_shovel_management` plugin.

Please see the `Node Help` section from within node-red for more info

## Development

### Build the project

```
npm run build
```

### Run tests

```
npm test
```

Run coverage:

```
npm run test:cov
```
