"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */
const chai_1 = require("chai");
const sinon = require("sinon");
const amqplib = require("amqplib");
const Amqp_1 = require("../src/Amqp");
const doubles_1 = require("./doubles");
const types_1 = require("../src/types");
let RED;
let amqp;
describe('Amqp Class', () => {
    beforeEach(function (done) {
        RED = {
            nodes: {
                getNode: sinon.stub().returns(doubles_1.brokerConfigFixture),
            },
        };
        // @ts-ignore
        amqp = new Amqp_1.default(RED, doubles_1.nodeFixture, doubles_1.nodeConfigFixture);
        done();
    });
    afterEach(function (done) {
        sinon.restore();
        done();
    });
    it('constructs with default Direct exchange', () => {
        // @ts-ignore
        amqp = new Amqp_1.default(RED, doubles_1.nodeFixture, Object.assign(Object.assign({}, doubles_1.nodeConfigFixture), { exchangeType: types_1.ExchangeType.Direct, exchangeName: types_1.DefaultExchangeName.Direct }));
        (0, chai_1.expect)(amqp.config.exchange.name, 'exchange name should be Direct default').to.eq(types_1.DefaultExchangeName.Direct);
    });
    it('constructs with default Fanout exchange', () => {
        // @ts-ignore
        amqp = new Amqp_1.default(RED, doubles_1.nodeFixture, Object.assign(Object.assign({}, doubles_1.nodeConfigFixture), { exchangeType: types_1.ExchangeType.Fanout, exchangeName: types_1.DefaultExchangeName.Fanout }));
        (0, chai_1.expect)(amqp.config.exchange.name, 'exchange name should be Fanout default').to.eq(types_1.DefaultExchangeName.Fanout);
    });
    it('constructs with default Topic exchange', () => {
        // @ts-ignore
        amqp = new Amqp_1.default(RED, doubles_1.nodeFixture, Object.assign(Object.assign({}, doubles_1.nodeConfigFixture), { exchangeType: types_1.ExchangeType.Topic, exchangeName: types_1.DefaultExchangeName.Topic }));
        (0, chai_1.expect)(amqp.config.exchange.name, 'exchange name should be Topic default').to.eq(types_1.DefaultExchangeName.Topic);
    });
    it('constructs with default Headers exchange', () => {
        // @ts-ignore
        amqp = new Amqp_1.default(RED, doubles_1.nodeFixture, Object.assign(Object.assign({}, doubles_1.nodeConfigFixture), { exchangeType: types_1.ExchangeType.Headers, exchangeName: types_1.DefaultExchangeName.Headers }));
        (0, chai_1.expect)(amqp.config.exchange.name, 'exchange name should be Headers default').to.eq(types_1.DefaultExchangeName.Headers);
    });
    it('connect()', async () => {
        const error = 'error!';
        const result = { on: () => error };
        // @ts-ignore
        sinon.stub(amqplib, 'connect').resolves(result);
        const connection = await amqp.connect();
        (0, chai_1.expect)(connection, 'connect() should return the connection object').to.eq(result);
    });
    it('initialize()', async () => {
        const createChannelStub = sinon.stub();
        const assertExchangeStub = sinon.stub();
        amqp.createChannel = createChannelStub;
        amqp.assertExchange = assertExchangeStub;
        await amqp.initialize();
        (0, chai_1.expect)(createChannelStub.calledOnce, 'createChannel should be called exactly once').to.be.true;
        (0, chai_1.expect)(assertExchangeStub.calledOnce, 'assertExchange should be called exactly once').to.be.true;
    });
    it('consume()', async () => {
        const assertQueueStub = sinon.stub();
        const bindQueueStub = sinon.stub();
        const messageContent = 'messageContent';
        const send = sinon.stub();
        const error = sinon.stub();
        const node = { send, error };
        const channel = {
            consume: function (queue, cb, 
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            config) {
                const amqpMessage = { content: messageContent };
                cb(amqpMessage);
            },
        };
        amqp.channel = channel;
        amqp.assertQueue = assertQueueStub;
        amqp.bindQueue = bindQueueStub;
        amqp.q = { queue: 'queueName' };
        amqp.node = node;
        await amqp.consume();
        (0, chai_1.expect)(assertQueueStub.calledOnce, 'assertQueue should be called once during consume').to.be.true;
        (0, chai_1.expect)(bindQueueStub.calledOnce, 'bindQueue should be called once during consume').to.be.true;
        (0, chai_1.expect)(send.calledOnce, 'send should be called once for received message').to.be.true;
        (0, chai_1.expect)(send.calledWith({
            content: messageContent,
            payload: messageContent,
        }), 'send should be called with message content and payload').to.be.true;
    });
    describe('publish()', () => {
        it('publishes a message (topic)', () => {
            const publishStub = sinon.stub();
            amqp.channel = {
                publish: publishStub,
            };
            amqp.publish('a message');
            (0, chai_1.expect)(publishStub.calledOnce, 'publish should be called once for topic exchange').to.be.true;
        });
        it('publishes a message (fanout)', () => {
            // @ts-ignore
            amqp = new Amqp_1.default(RED, doubles_1.nodeFixture, Object.assign(Object.assign({}, doubles_1.nodeConfigFixture), { exchangeType: types_1.ExchangeType.Fanout }));
            const publishStub = sinon.stub();
            amqp.channel = {
                publish: publishStub,
            };
            amqp.publish('a message');
            (0, chai_1.expect)(publishStub.calledOnce, 'publish should be called once for fanout exchange').to.be.true;
        });
        it('publishes a message (direct w/RPC)', () => {
            // @ts-ignore
            amqp = new Amqp_1.default(RED, doubles_1.nodeFixture, Object.assign(Object.assign({}, doubles_1.nodeConfigFixture), { exchangeType: types_1.ExchangeType.Direct, outputs: 1 }));
            const publishStub = sinon.stub();
            const assertQueueStub = sinon.stub();
            const consumeStub = sinon.stub();
            amqp.channel = {
                publish: publishStub,
                assertQueue: assertQueueStub,
                consume: consumeStub,
            };
            const routingKey = 'rpc-routingkey';
            amqp.config = {
                broker: '',
                exchange: { type: types_1.ExchangeType.Direct, routingKey },
                queue: {},
                amqpProperties: {},
                outputs: 1,
            };
            amqp.node = {
                error: sinon.stub(),
            };
            amqp.q = {};
            amqp.publish('a message');
            // FIXME: we're losing `this` in here and can't assert on mocks.
            // So no assertions :(
            // expect(consumeStub.calledOnce).to.equal(true)
            // expect(publishStub.calledOnce).to.equal(true)
        });
        it('rejects when publish throws', async () => {
            const publishStub = sinon.stub().throws();
            amqp.channel = {
                publish: publishStub,
            };
            try {
                await amqp.publish('a message');
                chai_1.expect.fail('Expected publish to reject');
            }
            catch (error) {
                (0, chai_1.expect)(error).to.be.instanceOf(Error);
            }
            (0, chai_1.expect)(publishStub.calledOnce).to.equal(true);
        });
    });
    it('close()', async () => {
        const { exchangeName, exchangeRoutingKey } = doubles_1.nodeConfigFixture;
        const queueName = 'queueName';
        const unbindQueueStub = sinon.stub().resolves();
        const channelCloseStub = sinon.stub().resolves();
        const connectionCloseStub = sinon.stub().resolves();
        const assertQueueStub = sinon.stub().resolves({ queue: queueName });
        amqp.channel = {
            unbindQueue: unbindQueueStub,
            close: channelCloseStub,
            assertQueue: assertQueueStub,
        };
        amqp.connection = { close: connectionCloseStub };
        // Set up config with required queue properties for close() to unbind
        amqp.config.queue.name = queueName;
        amqp.config.queue.autoDelete = true;
        await amqp.assertQueue();
        await amqp.close();
        (0, chai_1.expect)(unbindQueueStub.calledOnce, 'unbindQueue should be called exactly once during close').to.be.true;
        (0, chai_1.expect)(unbindQueueStub.calledWith(queueName, exchangeName, exchangeRoutingKey), `unbindQueue should be called with queue "${queueName}", exchange "${exchangeName}", and routing key "${exchangeRoutingKey}"`).to.be.true;
        (0, chai_1.expect)(channelCloseStub.calledOnce, 'channel.close() should be called exactly once').to.be.true;
        (0, chai_1.expect)(connectionCloseStub.calledOnce, 'connection.close() should be called exactly once').to.be.true;
    });
    it('createChannel()', async () => {
        const error = 'error!';
        const result = {
            on: () => error,
            prefetch: () => null,
        };
        const createChannelStub = sinon.stub().returns(result);
        amqp.connection = { createChannel: createChannelStub };
        await amqp.createChannel();
        (0, chai_1.expect)(createChannelStub.calledOnce, 'connection.createChannel should be called exactly once').to.be.true;
        (0, chai_1.expect)(amqp.channel, 'channel should be set to the created channel').to.eq(result);
    });
    it('assertExchange()', async () => {
        const assertExchangeStub = sinon.stub();
        amqp.channel = { assertExchange: assertExchangeStub };
        const { exchangeName, exchangeType, exchangeDurable } = doubles_1.nodeConfigFixture;
        await amqp.assertExchange();
        (0, chai_1.expect)(assertExchangeStub.calledOnce, 'assertExchange should be called exactly once').to.be.true;
        (0, chai_1.expect)(assertExchangeStub.calledWith(exchangeName, exchangeType, {
            durable: exchangeDurable,
        }), `assertExchange should be called with name "${exchangeName}", type "${exchangeType}", and durable=${exchangeDurable}`).to.be.true;
    });
    it('assertQueue()', async () => {
        const queue = 'queueName';
        const { queueName, queueExclusive, queueDurable, queueAutoDelete } = doubles_1.nodeConfigFixture;
        const assertQueueStub = sinon.stub().resolves({ queue });
        amqp.channel = { assertQueue: assertQueueStub };
        await amqp.assertQueue();
        (0, chai_1.expect)(assertQueueStub.calledOnce, 'assertQueue should be called exactly once').to.be.true;
        (0, chai_1.expect)(assertQueueStub.calledWith(queueName, {
            exclusive: queueExclusive,
            durable: queueDurable,
            autoDelete: queueAutoDelete,
        }), `assertQueue should be called with name "${queueName}" and options: exclusive=${queueExclusive}, durable=${queueDurable}, autoDelete=${queueAutoDelete}`).to.be.true;
    });
    it('bindQueue() topic exchange', () => {
        const queue = 'queueName';
        const bindQueueStub = sinon.stub();
        amqp.channel = { bindQueue: bindQueueStub };
        amqp.q = { queue };
        const { exchangeName, exchangeRoutingKey } = doubles_1.nodeConfigFixture;
        amqp.bindQueue();
        (0, chai_1.expect)(bindQueueStub.calledOnce, 'bindQueue should be called exactly once').to.be.true;
        (0, chai_1.expect)(bindQueueStub.calledWith(queue, exchangeName, exchangeRoutingKey), `bindQueue should bind queue "${queue}" to exchange "${exchangeName}" with routing key "${exchangeRoutingKey}"`).to.be.true;
    });
    it('bindQueue() direct exchange', () => {
        const config = Object.assign(Object.assign({}, doubles_1.nodeConfigFixture), { exchangeType: types_1.ExchangeType.Direct, exchangeRoutingKey: 'routing-key' });
        // @ts-ignore
        amqp = new Amqp_1.default(RED, doubles_1.nodeFixture, config);
        const queue = 'queueName';
        const bindQueueStub = sinon.stub();
        amqp.channel = { bindQueue: bindQueueStub };
        amqp.q = { queue };
        const { exchangeName, exchangeRoutingKey } = config;
        amqp.bindQueue();
        (0, chai_1.expect)(bindQueueStub.calledWith(queue, exchangeName, exchangeRoutingKey), `bindQueue should bind queue "${queue}" to direct exchange "${exchangeName}" with routing key "${exchangeRoutingKey}"`).to.be.true;
    });
    // Direct method call tests for uncovered lines
    describe('manual ack methods', () => {
        it('ack() calls channel.ack with correct parameters', () => {
            const ackStub = sinon.stub();
            amqp.channel = { ack: ackStub };
            const msg = { manualAck: { allUpTo: true } };
            amqp.ack(msg);
            (0, chai_1.expect)(ackStub.calledOnce, 'channel.ack should be called once').to.be.true;
            (0, chai_1.expect)(ackStub.calledWith(msg, true), 'should pass message and allUpTo flag').to.be.true;
        });
        it('ackAll() calls channel.ackAll', () => {
            const ackAllStub = sinon.stub();
            amqp.channel = { ackAll: ackAllStub };
            amqp.ackAll();
            (0, chai_1.expect)(ackAllStub.calledOnce, 'channel.ackAll should be called once').to.be.true;
        });
        it('nack() calls channel.nack with default requeue=true', () => {
            const nackStub = sinon.stub();
            amqp.channel = { nack: nackStub };
            const msg = { manualAck: { allUpTo: false } };
            amqp.nack(msg);
            (0, chai_1.expect)(nackStub.calledOnce, 'channel.nack should be called once').to.be.true;
            (0, chai_1.expect)(nackStub.calledWith(msg, false, true), 'should pass message, allUpTo=false, requeue=true').to.be.true;
        });
        it('nack() respects requeue parameter from manualAck', () => {
            const nackStub = sinon.stub();
            amqp.channel = { nack: nackStub };
            const msg = { manualAck: { allUpTo: true, requeue: false } };
            amqp.nack(msg);
            (0, chai_1.expect)(nackStub.calledWith(msg, true, false), 'should pass requeue=false when specified').to.be.true;
        });
        it('nackAll() calls channel.nackAll with requeue=true by default', () => {
            const nackAllStub = sinon.stub();
            amqp.channel = { nackAll: nackAllStub };
            const msg = { manualAck: {} };
            amqp.nackAll(msg);
            (0, chai_1.expect)(nackAllStub.calledOnce, 'channel.nackAll should be called once').to.be.true;
            (0, chai_1.expect)(nackAllStub.calledWith(true), 'should pass requeue=true by default').to.be.true;
        });
        it('nackAll() respects requeue parameter', () => {
            const nackAllStub = sinon.stub();
            amqp.channel = { nackAll: nackAllStub };
            const msg = { manualAck: { requeue: false } };
            amqp.nackAll(msg);
            (0, chai_1.expect)(nackAllStub.calledWith(false), 'should pass requeue=false when specified').to.be.true;
        });
        it('reject() calls channel.reject with default requeue=true', () => {
            const rejectStub = sinon.stub();
            amqp.channel = { reject: rejectStub };
            const msg = { manualAck: {} };
            amqp.reject(msg);
            (0, chai_1.expect)(rejectStub.calledOnce, 'channel.reject should be called once').to.be.true;
            (0, chai_1.expect)(rejectStub.calledWith(msg, true), 'should pass message and requeue=true by default').to.be.true;
        });
        it('reject() respects requeue parameter', () => {
            const rejectStub = sinon.stub();
            amqp.channel = { reject: rejectStub };
            const msg = { manualAck: { requeue: false } };
            amqp.reject(msg);
            (0, chai_1.expect)(rejectStub.calledWith(msg, false), 'should pass requeue=false when specified').to.be.true;
        });
    });
    describe('setRoutingKey()', () => {
        it('updates routing key in config', () => {
            const newRoutingKey = 'new.routing.key';
            amqp.setRoutingKey(newRoutingKey);
            (0, chai_1.expect)(amqp.config.exchange.routingKey, 'routing key should be updated').to.equal(newRoutingKey);
        });
    });
    describe('publish() error handling', () => {
        it('throws descriptive error when channel is unavailable', async () => {
            amqp.channel = null;
            const msg = 'test message';
            try {
                await amqp.publish(msg);
                chai_1.expect.fail('publish should throw when channel is unavailable');
            }
            catch (e) {
                (0, chai_1.expect)(e.message, 'error should mention disconnected/reconnecting').to.include('disconnected or reconnecting');
            }
        });
        it('throws descriptive error when channel.publish is not a function', async () => {
            amqp.channel = { publish: 'not-a-function' };
            const msg = 'test message';
            try {
                await amqp.publish(msg);
                chai_1.expect.fail('publish should throw when channel.publish is not callable');
            }
            catch (e) {
                (0, chai_1.expect)(e.message, 'error should mention disconnected/reconnecting').to.include('disconnected or reconnecting');
            }
        });
        it('wraps and rethrows errors from channel.publish', async () => {
            const publishError = new Error('Network error');
            amqp.channel = { publish: sinon.stub().throws(publishError) };
            const msg = 'test message';
            try {
                await amqp.publish(msg);
                chai_1.expect.fail('publish should rethrow wrapped error');
            }
            catch (e) {
                (0, chai_1.expect)(e.message, 'error should be wrapped').to.include('Could not publish message');
                (0, chai_1.expect)(e.message, 'error should include original message').to.include('Network error');
            }
        });
    });
});
it('bindQueue() fanout exchange', () => {
    const config = Object.assign(Object.assign({}, doubles_1.nodeConfigFixture), { exchangeType: types_1.ExchangeType.Fanout, exchangeRoutingKey: '' });
    // @ts-ignore
    amqp = new Amqp_1.default(RED, doubles_1.nodeFixture, config);
    const queue = 'queueName';
    const bindQueueStub = sinon.stub();
    amqp.channel = { bindQueue: bindQueueStub };
    amqp.q = { queue };
    const { exchangeName } = config;
    amqp.bindQueue();
    (0, chai_1.expect)(bindQueueStub.calledOnce, 'bindQueue should be called exactly once for fanout exchange').to.be.true;
    (0, chai_1.expect)(bindQueueStub.calledWith(queue, exchangeName, ''), `bindQueue should bind queue "${queue}" to fanout exchange "${exchangeName}" with empty routing key`).to.be.true;
});
it('bindQueue() headers exchange', () => {
    const config = Object.assign(Object.assign({}, doubles_1.nodeConfigFixture), { exchangeType: types_1.ExchangeType.Headers, exchangeRoutingKey: '', headers: { some: 'headers' } });
    // @ts-ignore
    amqp = new Amqp_1.default(RED, doubles_1.nodeFixture, config);
    const queue = 'queueName';
    const bindQueueStub = sinon.stub();
    amqp.channel = { bindQueue: bindQueueStub };
    amqp.q = { queue };
    const { exchangeName, headers } = config;
    amqp.bindQueue();
    (0, chai_1.expect)(bindQueueStub.calledOnce, 'bindQueue should be called exactly once for headers exchange').to.be.true;
    (0, chai_1.expect)(bindQueueStub.calledWith(queue, exchangeName, '', headers), `bindQueue should bind queue "${queue}" to headers exchange "${exchangeName}" with headers filter`).to.be.true;
});
//# sourceMappingURL=Amqp.spec.js.map