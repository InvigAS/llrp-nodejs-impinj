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

var messageC = require('./LLRPMessagesConstants.js');
var parameterC = require('./LLRPParametersConstants.js');
var LLRPMessage = require('./LLRPMessages.js');
var decode = require('./decode.js');

var net = require('net');
const { rootCertificates } = require('tls');
var EventEmitter = require('events').EventEmitter;

var llrpMain = function (config) {

	// ====================
	// Variables
	// ====================

	var ipaddress = config.ipaddress || '192.168.0.30';
	var port = config.port || 5084;
	var log = config.log || false;

	var socket = new net.Socket();
	var self = this;
	var client = null;

	var bKeepaliveAck = new Buffer('04480000000a00000000', 'hex');
	var bStopRoSpec = new Buffer(makeMessage(23, 0, [{ value: 1, bits: 32 }]), 'hex')
	var bCloseConnection = new Buffer(makeMessage(14, 0), 'hex');

	// ====================
	// Public Methods
	// ====================

	this.disconnect = function () {
		writeMessage(client, bStopRoSpec);
		writeMessage(client, bCloseConnection);
	}

	this.connect = function () {
		// timeout after 60 seconds.
		socket.setTimeout(60000, function () {
			if (log) {
				console.log('Connection timeout');
			}
			process.nextTick(function () {
				self.emit('timeout', new Error('Connection timeout'));
			});
		});

		// connect with reader
		client = socket.connect(port, ipaddress, function () {
			if (log) {
				console.log('Connected to: ' + ipaddress + ':' + port);
			}
		});

		// whenever reader sends data.
		client.on('data', function (data) {
			process.nextTick(function () {
				//check if there is data.
				if (data === undefined) {
					if (log) {
						console.log('Undefined data returned by the rfid.');
					}
				}

				//decoded message(s), passable to LLRPMessage class.
				var messagesKeyValue = decode.message(data);

				//loop through the message.
				for (var index in messagesKeyValue) {
					//possible we have more than 1 message in a reply.
					var message = new LLRPMessage(messagesKeyValue[index]);
					if (log) {
						console.log('Receiving: ' + message.getTypeName());
					}

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
			if (log) {
				console.log('client disconnected');
			}
			process.nextTick(function () {
				self.emit('disconnect', new Error('Client disconnected.'));
			});
		});

		//cannot connect to the reader other than a timeout.
		client.on('error', function (err) {
			//error on the connection
			if (log) {
				console.log(err);
			}
			process.nextTick(function () {
				self.emit('error', err);
			});
		});
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
					messageBuffer = Buffer.from(makeMessage(20, 0, makeROSpec({ ROSpecID: 1, Priority: 0, CurrentState: 0 })), 'hex');
					response = messageC.ADD_ROSPEC_RESPONSE;
					break;
				case messageC.DELETE_ROSPEC:
					if (data.ROSpecID !== undefined) {
						messageBuffer = Buffer.from(makeMessage(21, 0, [{ value: data.ROSpecID, bits: 32 }] ), 'hex');
						response = messageC.DELETE_ROSPEC_RESPONSE;
					}
					break;
				case messageC.START_ROSPEC:
					if (data.ROSpecID !== undefined) {
						messageBuffer = Buffer.from(makeMessage(22, 0, [{ value: data.ROSpecID, bits: 32 }] ), 'hex');
						response = messageC.START_ROSPEC_RESPONSE;
					}
					break;
				case messageC.STOP_ROSPEC:
					if (data.ROSpecID !== undefined) {
						messageBuffer = Buffer.from(makeMessage(23, 0, [{ value: data.ROSpecID, bits: 32 }] ), 'hex');
						response = messageC.STOP_ROSPEC_RESPONSE;
					}
					break;
				case messageC.ENABLE_ROSPEC:
					if (data.ROSpecID !== undefined) {
						messageBuffer = Buffer.from(makeMessage(24, 0, [{ value: data.ROSpecID, bits: 32 }] ), 'hex');
						response = messageC.ENABLE_ROSPEC_RESPONSE;
					}
					break;
				case messageC.DISABLE_ROSPEC:
					if (data.ROSpecID !== undefined) {
						messageBuffer = Buffer.from(makeMessage(25, 0, [{ value: data.ROSpecID, bits: 32 }] ), 'hex');
						response = messageC.DISABLE_ROSPEC_RESPONSE;
					}
					break;
				case messageC.SET_READER_CONFIG:
					if (data.ResetToFactoryDefaults !== undefined) {
						messageBuffer = Buffer.from(makeMessage(3, 0, [{ value: parseInt(data.ResetToFactoryDefaults), bits: 1 }, { value: 0, bits: 7 }] ), 'hex');
						response = messageC.SET_READER_CONFIG_RESPONSE;
					}
					break;
				case messageC.CUSTOM_MESSAGE:
					if (data !== null) {
						messageBuffer = Buffer.from(makeMessage(1023, 0, [ 
							{ value: data.vendorId, bits: 32},
							{ value: data.subType, bits: 8 }, 
							... data.data
							]), 'hex');
						response = messageC.CUSTOM_MESSAGE;
					}
					break;
				default:
					console.log("Wrong message");
					break;
			}

			if (response === 0) {
				return;
			}

			writeMessage(client, messageBuffer);

			self.on(response, (message) => {
				resolve(message)
			});

			/*
			setTimeout(() => {
				console.log("TimeOut");
				reject();
			}, 10000);
			*/
		});

		return promise;
	}

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

		//Tagobservation
		const TagObservationType = { value: 185, bits: 10 };
		const TagObservationTriggerType = { value: 0, bits: 8 };
		const TagObservationTriggerRsv = { value: 0, bits: 8 };
		const TagObservationTriggerNumber = { value: 1, bits: 16 };
		const TagObservationTriggerAttemps = { value: 0 , bits: 16 };
		const TagObservationTriggerT = { value: 0, bits: 16 };
		const TagObservationTriggerTimeout = { value: 0, bits: 32 };

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
		const RFTransmitterSettingsTransmit = { value: 10, bits: 16 };

		//Data Arrays
		const RFTransmitterSettings = [rsv, RFTransmitterSettingsType, { value: 0, bits: 16 }, RFTransmitterSettingsHopTableId, RFTransmitterSettingsChannelIndex, RFTransmitterSettingsTransmit]
		RFTransmitterSettings[2].value = countBytes(RFTransmitterSettings);

		const AntennaConfiguration = [rsv, AntennaConfigurationType, { value: 0, bits: 16 }, AntennaConfigurationId, ...RFTransmitterSettings];
		AntennaConfiguration[2].value = countBytes(AntennaConfiguration);

		const InventoryParameterSpec = [rsv, InventoryParameterSpecType, { value: 0, bits: 16 }, InventoryParameterSpecId, InventoryParameterSpecProtocolId, ...AntennaConfiguration];
		InventoryParameterSpec[2].value = countBytes(InventoryParameterSpec);
		
		const Tagobservation = [rsv, TagObservationType, { value: 0, bits: 16 }, TagObservationTriggerType, TagObservationTriggerRsv, TagObservationTriggerNumber, TagObservationTriggerAttemps, TagObservationTriggerT, TagObservationTriggerTimeout];
		Tagobservation[2].value = countBytes(Tagobservation);

		const AISpecStop = [rsv, AISpecStopType, { value: 0, bits: 16}, AISpecStopTriggerType, AISpecStopTriggerDuration]//, ...Tagobservation];
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

		console.log('0' + message);

		return '0' + message;
	}

	function handleMessage(message) {
		const parametersKeyValue = decode.parameter(message.getParameter());
		if (parametersKeyValue.length !== undefined) {
			for (let i = 0; i < parametersKeyValue.length; i++) {
				if (parametersKeyValue[i].typeName === 'LLRPStatus') {
					parametersKeyValue[i].status = parametersKeyValue[i].value[1];
					parametersKeyValue[i].desc = parametersKeyValue[i].value.toString();
				}
			}
		}
		console.log(parametersKeyValue);
	}

	function handleReaderNotification(message) {
		var parametersKeyValue = decode.parameter(message.getParameter());

		parametersKeyValue.forEach(function (decodedParameters) {
			if (decodedParameters.type === parameterC.ReaderEventNotificationData) {
				var subParameters = mapSubParameters(decodedParameters);
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
							tagSeenCount: 0
						};

						if (typeof subParameters[parameterC.EPC96] !== 'undefined') {
							tag.tagID = subParameters[parameterC.EPC96].toString('hex');
						}

						if (typeof subParameters[parameterC.TagSeenCount] !== 'undefined') {
							tag.tagSeenCount = subParameters[parameterC.TagSeenCount].readUInt16BE(0);
						}

						if (log) {
							//console.log('ID: ' + tag.tagID + '\tRead count: ' + tag.tagSeenCount);
						}

						if (tag.tagID) {
							process.nextTick(function () {
								self.emit('didSeeTag', tag);
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
};

llrpMain.prototype = new EventEmitter();

module.exports = llrpMain;