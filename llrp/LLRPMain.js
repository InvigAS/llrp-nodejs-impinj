/**
 * @fileOverview Basic reading of RF tags. This is the main starting point.
 *
 * This file was created at Openovate Labs.
 *
 * @author Billie Dee R. Ang <billieang24@gmail.com>
 * @author Jeriel Mari E. Lopez <jerielmari@gmail.com>
 */


'use strict';

// ====================
// Includes
// ====================

const messageC = require('./LLRPMessagesConstants.js');
const parameterC = require('./LLRPParametersConstants.js');
const LLRPMessage = require('./LLRPMessages.js');
const decode = require('./decode.js');

const net = require('net');
const { rootCertificates } = require('tls');
var EventEmitter = require('events').EventEmitter;

class llrpMain  extends EventEmitter{
	constructor(config) {
		super();

		// ====================
		// Variables
		// ====================

		const ipaddress = config.ipaddress || '192.168.0.30';
		const port = config.port || 5084;
		const log = config.log || false;

		const socket = new net.Socket();
		const self = this;
		let client = null;

		const bKeepaliveAck = Buffer.from('04480000000a00000000', 'hex');

		let connected = false;

		// ====================
		// Public Methods
		// ====================
		this.testConnection = function () {
			const promise = new Promise((resolve, reject) => {
				const testClient = net.connect({ host: ipaddress, port: port, timeout: 1 },
					function () {
						console.log('client connected');
						testClient.end();
					})
					.once('error', function (err) {
						resolve(false);
					})
					.once('connect', function () {
						resolve(true);
					});
				testClient.setTimeout(3000, function () {
					testClient.destroy();
					resolve(false);
				});
			});
			return promise;
		};

		this.connect = function () {
			/*
			// timeout after 60 seconds.
			socket.setTimeout(60000, function () {
				if (log) console.log('Connection timeout');
				process.nextTick(function () {
					self.emit('timeout', new Error('Connection timeout'));
				});
			});
			*/
			if (!connected) {
				// connect with reader
				client = socket.connect(port, ipaddress, function () {
					if (log)
						console.log('Connected to: ' + ipaddress + ':' + port);
					connected = true;
				});

				// whenever reader sends data.
				client.on('data', function (data) {
					process.nextTick(function () {
						//check if there is data.
						if (data === undefined) {
							if (log)
								console.log('Undefined data returned by the rfid.');

						}

						//decoded message(s), passable to LLRPMessage class.
						var messagesKeyValue = decode.message(data);

						//loop through the message.
						for (var index in messagesKeyValue) {
							//possible we have more than 1 message in a reply.
							var message = new LLRPMessage(messagesKeyValue[index]);
							if (log)
								console.log('Receiving: ' + message.getTypeName());

							//Check message type and send appropriate response.
							//This send-receive is the most basic form to read a tag in llrp.
							const messageType = message.getType();
							switch (messageType) {
								case messageC.RO_ACCESS_REPORT:
									handleROAccessReport(message);
									break;
								case messageC.KEEPALIVE:
									//send KEEPALIVE_ACK
									writeMessage(client, bKeepaliveAck);
									break;
								case messageC.ERROR_MESSAGE:
									break;
								default:
									break;
							}
							handleMessage(message);
							self.emit(messageType, message);
						}
					});
				});

				//the reader or client has ended the connection.
				client.on('end', function () {
					//the session has ended
					if (log)
						console.log('client disconnected');
					process.nextTick(function () {
						self.emit('disconnect', new Error('Client disconnected.'));
						connected = false;
					});
				});

				//cannot connect to the reader other than a timeout.
				client.on('error', function (err) {
					//error on the connection
					if (log)
						console.log(err);

					process.nextTick(function () {
						self.emit('error', err);
						connected = false;
					});
				});
			}
		};

		/**
		 * Use this message to send LLRP messages
		 *
		 * SET_READER_CONFIG only supports ResetToFactoryDefaults
		 *
		 * @param {string} message LLRP Messages Ex. START_ROSPEC, ENABLE_ROSPEC
		 * @param {Object | Object[]} data Optional extra data for the messages. Can be an array or one object
		 * @return {Promise} returns the response message
		 *
		 */
		this.sendMessage = function (message, data = null) {
			const promise = new Promise((resolve, reject) => {
				let response = 0;
				let messageBuffer = undefined;
				switch (messageC[message]) {
					case messageC.ADD_ROSPEC:
						if (data !== null) {
							if (log)
								console.log(data);
							messageBuffer = Buffer.from(makeMessage(20, 0, makeROSpec(data)), 'hex');
							response = messageC.ADD_ROSPEC_RESPONSE;
						}
						break;
					case messageC.DELETE_ROSPEC:
						if (data.ROSpecID !== undefined) {
							messageBuffer = Buffer.from(makeMessage(21, 0, [{ value: data.ROSpecID, bits: 32 }]), 'hex');
							response = messageC.DELETE_ROSPEC_RESPONSE;
						}
						break;
					case messageC.START_ROSPEC:
						if (data.ROSpecID !== undefined) {
							messageBuffer = Buffer.from(makeMessage(22, 0, [{ value: data.ROSpecID, bits: 32 }]), 'hex');
							response = messageC.START_ROSPEC_RESPONSE;
						}
						break;
					case messageC.STOP_ROSPEC:
						if (data.ROSpecID !== undefined) {
							messageBuffer = Buffer.from(makeMessage(23, 0, [{ value: data.ROSpecID, bits: 32 }]), 'hex');
							response = messageC.STOP_ROSPEC_RESPONSE;
						}
						break;
					case messageC.ENABLE_ROSPEC:
						if (data.ROSpecID !== undefined) {
							messageBuffer = Buffer.from(makeMessage(24, 0, [{ value: data.ROSpecID, bits: 32 }]), 'hex');
							response = messageC.ENABLE_ROSPEC_RESPONSE;
						}
						break;
					case messageC.DISABLE_ROSPEC:
						if (data.ROSpecID !== undefined) {
							messageBuffer = Buffer.from(makeMessage(25, 0, [{ value: data.ROSpecID, bits: 32 }]), 'hex');
							response = messageC.DISABLE_ROSPEC_RESPONSE;
						}
						break;
					case messageC.SET_READER_CONFIG:
						if (data.ResetToFactoryDefaults !== undefined) {
							messageBuffer = Buffer.from(makeMessage(3, 0, [{ value: parseInt(data.ResetToFactoryDefaults), bits: 1 }, { value: 0, bits: 7 }]), 'hex');
							response = messageC.SET_READER_CONFIG_RESPONSE;
						}
						break;
					case messageC.CLOSE_CONNECTION:
						messageBuffer = Buffer.from(makeMessage(14, 0), 'hex');
						response = messageC.CLOSE_CONNECTION_RESPONSE;
						break;
					case messageC.CUSTOM_MESSAGE:
						if (data !== null) {
							messageBuffer = Buffer.from(makeMessage(1023, 0, [
								{ value: data.vendorId, bits: 32 },
								{ value: data.subType, bits: 8 },
								...data.data
							]), 'hex');
							response = messageC.CUSTOM_MESSAGE;
						}
						break;
					default:
						if (log)
							console.log("Wrong message");
						break;
				}

				if (response === 0) {
					return;
				}

				writeMessage(client, messageBuffer);

				self.once(response, (message) => {
					resolve(message);
				});

				/*
				setTimeout(() => {
					console.log("TimeOut");
					reject();
				}, 10000);
				*/
			});

			return promise;
		};

		// ====================
		// Helper Methods
		// ====================
		/**
		 * Function to make to ROspec
		 * @param {Object} ROSpec RoSpec object
		 *
		 */
		function makeROSpec(ROSpec) {
			const rsv = { value: 0, bits: 6 };

			//ROSpec
			const ROSpecType = { value: 177, bits: 10 };

			const ROSpecId = { value: ROSpec.ROSpecID, bits: 32 };
			const ROSpecPriority = { value: ROSpec.Priority, bits: 8 };
			const ROSpecCurrentState = { value: ROSpec.CurrentState, bits: 8 };

			//ROBoundary
			const ROBoundaryType = { value: 178, bits: 10 };

			//ROSpecStartTrigger
			const ROSpecStartType = { value: 179, bits: 10 };
			const ROSpecStartTriggerType = { value: 0, bits: 8 };

			//ROSpecStopTrigger
			const ROSpecStopType = { value: 182, bits: 10 };
			const ROSpecStopTriggerType = { value: 0, bits: 8 };
			const ROSpecStopTriggerDuration = { value: 0, bits: 32 };

			//AISpec
			const AISpecType = { value: 183, bits: 10 };
			const AntennaCount = { value: 1, bits: 16 };
			const AntennaId = { value: 0, bits: 16 };

			const AISpecStopType = { value: 184, bits: 10 };
			const AISpecStopTriggerType = { value: 0, bits: 8 };
			const AISpecStopTriggerDuration = { value: 0, bits: 32 };

			//InventoryParameterSpec
			const InventoryParameterSpecType = { value: 186, bits: 10 };
			const InventoryParameterSpecId = { value: 1, bits: 16 };
			const InventoryParameterSpecProtocolId = { value: 1, bits: 8 };

			//AntennaConfiguration
			const AntennaConfigurationType = { value: 222, bits: 10 };
			const AntennaConfigurationId = { value: 0, bits: 16 };

			//RFTransmitterSettings
			const RFTransmitterSettingsType = { value: 224, bits: 10 };
			const RFTransmitterSettingsHopTableId = { value: 0, bits: 16 };
			const RFTransmitterSettingsChannelIndex = { value: 1, bits: 16 };
			const RFTransmitterSettingsTransmit = { value: ROSpec.Power, bits: 16 };

			//C1G2InventoryCommand
			const C1G2InventoryCommandType = { value: 330, bits: 10 };
			const C1G2InventoryCommandS = { value: 1, bits: 1 };
			const C1G2InventoryCommandRsv = { value: 0, bits: 7 };

			//C1G2SingulationControl
			const C1G2SingulationControlType = { value: 336, bits: 10 };
			const C1G2SingulationControlSession = { value: ROSpec.Session, bits: 2 };
			const C1G2SingulationControlRsv = { value: 0, bits: 6 };
			const C1G2SingulationControlTagPopulation = { value: ROSpec.TagPopulation, bits: 16 };
			const C1G2SingulationControlTagTransitTime = { value: ROSpec.TransitTime, bits: 32 };

			//ImpinjInventorySearchMode
			const ImpinjInventorySearchModeType = { value: 1023, bits: 10 };
			const ImpinjInventorySearchModeVendor = { value: 25882, bits: 32 };
			const ImpinjInventorySearchModeSubtype = { value: 23, bits: 32 };
			const ImpinjInventorySearchModeInventorySearchMode = { value: ROSpec.SearchMode, bits: 16 };

			//Data Arrays
			const ImpinjInventorySearchMode = [rsv, ImpinjInventorySearchModeType, { value: 0, bits: 16 }, ImpinjInventorySearchModeVendor, ImpinjInventorySearchModeSubtype, ImpinjInventorySearchModeInventorySearchMode];
			ImpinjInventorySearchMode[2].value = countBytes(ImpinjInventorySearchMode);

			const C1G2SingulationControl = [rsv, C1G2SingulationControlType, { value: 0, bits: 16 }, C1G2SingulationControlSession, C1G2SingulationControlRsv, C1G2SingulationControlTagPopulation, C1G2SingulationControlTagTransitTime];
			C1G2SingulationControl[2].value = countBytes(C1G2SingulationControl);

			const C1G2InventoryCommand = [rsv, C1G2InventoryCommandType, { value: 0, bits: 16 }, C1G2InventoryCommandS, C1G2InventoryCommandRsv, ...C1G2SingulationControl, ...ImpinjInventorySearchMode];
			C1G2InventoryCommand[2].value = countBytes(C1G2InventoryCommand);

			const RFTransmitterSettings = [rsv, RFTransmitterSettingsType, { value: 0, bits: 16 }, RFTransmitterSettingsHopTableId, RFTransmitterSettingsChannelIndex, RFTransmitterSettingsTransmit];
			RFTransmitterSettings[2].value = countBytes(RFTransmitterSettings);

			const AntennaConfiguration = [rsv, AntennaConfigurationType, { value: 0, bits: 16 }, AntennaConfigurationId, ...RFTransmitterSettings, ...C1G2InventoryCommand];
			AntennaConfiguration[2].value = countBytes(AntennaConfiguration);

			const InventoryParameterSpec = [rsv, InventoryParameterSpecType, { value: 0, bits: 16 }, InventoryParameterSpecId, InventoryParameterSpecProtocolId, ...AntennaConfiguration];
			InventoryParameterSpec[2].value = countBytes(InventoryParameterSpec);

			const AISpecStop = [rsv, AISpecStopType, { value: 0, bits: 16 }, AISpecStopTriggerType, AISpecStopTriggerDuration];
			AISpecStop[2].value = countBytes(AISpecStop);

			const AISpec = [rsv, AISpecType, { value: 0, bits: 16 }, AntennaCount, AntennaId, ...AISpecStop, ...InventoryParameterSpec];
			AISpec[2].value = countBytes(AISpec);

			const ROSpecStopTrigger = [rsv, ROSpecStopType, { value: 0, bits: 16 }, ROSpecStopTriggerType, ROSpecStopTriggerDuration];
			ROSpecStopTrigger[2].value = countBytes(ROSpecStopTrigger);

			const ROSpecStartTrigger = [rsv, ROSpecStartType, { value: 0, bits: 16 }, ROSpecStartTriggerType];
			ROSpecStartTrigger[2].value = countBytes(ROSpecStartTrigger);

			const ROBoundary = [rsv, ROBoundaryType, { value: 0, bits: 16 }, ...ROSpecStartTrigger, ...ROSpecStopTrigger];
			ROBoundary[2].value = countBytes(ROBoundary);

			const ROSpecData = [rsv, ROSpecType, { value: 0, bits: 16 }, ROSpecId, ROSpecPriority, ROSpecCurrentState, ...ROBoundary, ...AISpec];
			ROSpecData[2].value = countBytes(ROSpecData);

			return ROSpecData;
		}

		/**
		 * Returns number of bytes in data
		 *
		 * @param {Object[]} array Array of data object { value: 1, bits: 16 }
		 * @returns
		 */
		function countBytes(array) {
			let length = 0;
			for (let i = 0; i < array.length; i++) {
				length += array[i].bits;
			}
			return parseInt(length / 8);
		}

		/**
		 * Function to make binary encodings
		 *
		 * @example <caption>Example of usage</caption>
		 * const hex = makeMessage(21, 0, [{ value: 1, bits: 32 }])
		 *
		 * @param {int} messageType Messagetype
		 * @param {int} messageId Messageid. Can be anything ex. 0
		 * @param {Object[]} [messageData] Optional Array of object in the form of ex. {value: 1, bits: 32}
		 * @param {int} messageData[].value Data value
		 * @param {int} messageData[].bits Data size for the value
		   * @returns {string} Returns a hex string of the binary encoding
		 */
		function makeMessage(messageType, messageId, messageData = null) {
			const rsvd = "000";
			const ver = "001";

			const type = messageType.toString(2).padStart(10, "0");
			const id = messageId.toString(2).padStart(32, "0");

			let data = '';

			if (messageData !== null) {
				for (let i = 0; i < messageData.length; i++) {
					const tmpData = messageData[i].value.toString(2).padStart(messageData[i].bits, '0');
					data = data + tmpData;
				}
			}

			let length = (rsvd.length + ver.length + type.length + id.length + data.length + 32) / 8;
			length = length.toString(2).padStart(32, "0");

			const message = BigInt('0b' + rsvd + ver + type + length + id + data).toString(16);

			return '0' + message;
		}

		function handleMessage(message) {
			const parametersKeyValue = decode.parameter(message.getParameter());
			if (parametersKeyValue?.length !== undefined) {
				for (let i = 0; i < parametersKeyValue.length; i++) {
					if (parametersKeyValue[i].typeName === 'LLRPStatus') {
						parametersKeyValue[i].status = parametersKeyValue[i].value[1];
						parametersKeyValue[i].desc = parametersKeyValue[i].value.toString();
					}
				}
			}
			if (log)
				console.log(parametersKeyValue);
		}

		function handleReaderNotification(message) {
			var parametersKeyValue = decode.parameter(message.getParameter());

			parametersKeyValue.forEach(function (decodedParameters) {
				if (decodedParameters.type === parameterC.ReaderEventNotificationData) {
					var subParameters = mapSubParameters(decodedParameters);
					if (log)
						console.log(subParameters);
				}
			});
		}

		function handleROAccessReport(message) {
			process.nextTick(function () {
				//read Parameters
				//this contains the TagReportData
				var parametersKeyValue = decode.parameter(message.getParameter());
				if (parametersKeyValue) {
					parametersKeyValue.forEach(function (decodedParameters) {
						//read TagReportData Parameter only.
						if (decodedParameters.type === parameterC.TagReportData) {

							var subParameters = mapSubParameters(decodedParameters);

							var tag = {
								tagID: null,
								tagSeenCount: 0,
								AntennaID: 0,
								PeakRSSI: 0,
								firstSeenTime: 0
							};



							if (typeof subParameters[parameterC.EPC96] !== 'undefined') {
								tag.tagID = subParameters[parameterC.EPC96].toString('hex');
							}

							if (typeof subParameters[parameterC.TagSeenCount] !== 'undefined') {
								tag.tagSeenCount = subParameters[parameterC.TagSeenCount].readUInt16BE(0);
							}

							if (typeof subParameters[parameterC.AntennaID] !== 'undefined') {
								tag.AntennaID = subParameters[parameterC.AntennaID].readUInt16BE(0);
							}

							if (typeof subParameters[parameterC.PeakRSSI] !== 'undefined') {
								tag.PeakRSSI = subParameters[parameterC.PeakRSSI].readInt8();
							}

							if (typeof subParameters[parameterC.FirstSeenTimestampUTC] !== 'undefined') {
								tag.firstSeenTime = Number(subParameters[parameterC.FirstSeenTimestampUTC].readBigUInt64BE(0));
							}

							if (log) {
								//console.log('ID: ' + tag.tagID + '\tRead count: ' + tag.tagSeenCount);
							}

							if (tag.tagID) {
								process.nextTick(() => {
									self.emit('tagRead', tag);
								});
							}
						}
					});
				}
			});
		}

		/**
		 * Send message to rfid and write logs.
		 *
		 * @param  {[type]} client  rfid connection.
		 * @param  {Buffer} buffer  to write.
		 */
		function writeMessage(client, buffer) {
			process.nextTick(function () {
				if (log) {
					console.log('Sending ' + getMessageName(buffer));
				}
				client.write(buffer);
			});
		}

		/**
		 * Gets the name of the message using the encoded Buffer.
		 *
		 * @param  {Buffer} data
		 * @return {string} name of the message
		 */
		function getMessageName(data) {
			//get the message code
			//get the name from the constants.
			return messageC[getMessage(data)];
		}

		/**
		 * Gets the message type using the encoded Buffer.
		 *
		 * @param  {Buffer} data
		 * @return {int} corresponding message type code.
		 */
		function getMessage(data) {
			//message type resides on the first 2 bits of the first octet
			//and 8 bits of the second octet.
			return (data[0] & 3) << 8 | data[1];
		}

		/**
		 * Simple helper function to map key value pairs using the typeName and value.
		 * Probably should be built in with LLRPParameter class.
		 *
		 * @param  {Object} decodedParameters  object returned from decode.parameter.
		 * @return {Object}  the key value pair.
		 */
		function mapSubParameters(decodedParameters) {
			//create an object that will hold a key value pair.
			var properties = {};
			var subP = decodedParameters.subParameters;
			for (var tag in subP) {
				//where key is the Parameter type.
				//and value is the Parameter value as Buffer object.
				properties[subP[tag].type] = subP[tag].value;
			}

			return properties;
		}
	}
}

module.exports = llrpMain;