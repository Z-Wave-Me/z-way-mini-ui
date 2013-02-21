/*
# This file is part of Z-Wave.Me Z-Way Demo UI.
#
# Copyright (C) 2013 Poltorak Serguei, Z-Wave.Me
#
# Z-Way Demo UI is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# Z-Way Demo UI is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with Z-Way Demo UI.  If not, see <http://www.gnu.org/licenses/>.
*/

var tbl;

// Holder for Z-Wave data tree comming from Z-Way server
var ZWaveAPIData = { updateTime: 0 };

// Init
$(document).ready(function() {
	// Set periodical updates
	setInterval(getDataUpdate, 500);


	// Init ZWaveAPIData structure
	$.triggerPath.init(ZWaveAPIData);

	// Set triggers on devices, instances and commandCasses list change
	$.triggerPath.bindPathNoEval('devices,devices[*],devices[*].instances,devices[*].instances[*],devices[*].instances[*].commandClasses,devices[*].instances[*].commandClasses[*]', function(obj, path) {
		showDevices();
	});

	// shortcut to table object
	tbl = $('table.devices');
	
	showDevices();

	// On Server Change button press update server URL and login/password
	$('#change_server').bind('click', function() {
		ZWayServerChange($('#server_url').val(), $('#server_user').val(), $('#server_password').val());
	});
	
	// Apply jQuery button design
	$('button').button();
});

// Render list of all devices and their functions
function showDevices() {
	tbl.empty();
	
	if (ZWaveAPIData.devices == undefined) {
		tbl.append($('<tr><td>Server unreachable or has not started yet</td><tr>'));
		return;
	}
                                
	$.each(ZWaveAPIData.devices, function (nodeId, node) {
		var controllerNodeId = ZWaveAPIData.controller.data.nodeId.value;
		if (nodeId == 255 || nodeId == controllerNodeId)
			// We skip broadcase and self
			return;

		// Device status and battery
		var basicType = node.data.basicType.value;
		var genericType = node.data.genericType.value;
		var specificType = node.data.specificType.value;
		var isListening = node.data.isListening.value;
		var isFLiRS = !isListening && (node.data.sensor250.value || node.data.sensor1000.value);
		var hasWakeup = 0x84 in node.instances[0].commandClasses;
		var hasBattery = 0x80 in node.instances[0].commandClasses;

		// Add line with general device info
		var nodeTr = $('<tr device="' + nodeId + '" class="device_header"><td class="center not_important">' + nodeId + '</td><td class="icon"></td><td class="right" id="sleeping"></td><td id="awake"></td><td id="operating"></td><td id="battery"></td><td id="interview"></td><td class="geek"><button id="pingDevice"></button></td></tr>');
		nodeTr.find('td.icon').append(device_icon(nodeId));

		// Bind trigger events
		var prefixD = 'devices.' + nodeId + '.data.';
		var prefixIC = 'devices.' + nodeId + '.instances[0].commandClasses'
		nodeTr.bindPath(prefixD + 'isFailed,' + prefixD + 'isAwake,' + prefixD + 'lastSend,' + prefixD + 'lastReceived,' + prefixD + 'queueLength,devices.' + nodeId + '.instances[*].commandClasses[*].data.interviewDone,' + prefixIC + '[' + 0x84 + '].data.lastWakeup,' + prefixIC + '[' + 0x84 + '].data.lastSleep,' + prefixIC + '[' + 0x84 + '].data.interval,' + prefixIC + '[' + 0x80 + '].data.last', updateDeviceInfo, basicType, genericType, specificType, isFLiRS, hasWakeup, hasBattery, isListening);

		// Bind button clicks
		nodeTr.find('#interviewShow').bind('click', function() { showInterviewResults(parseInt($(this).closest('[device]').attr('device'), 10)); } );
		nodeTr.find('#pingDevice').bind('click', function() { runCmd('devices[' + parseInt($(this).closest('[device]').attr('device'), 10) + '].SendNoOperation()'); }).html('Ping device');

		// Append it to the table
		tbl.append(nodeTr);

		// For all instances
		$.each(node.instances, function(instanceId, instance) {
			if (instanceId == 0 && $.objLen(node.instances) > 1)
				return; // We skip instance 0 if there are more, since it should be mapped to other instances or their superposition

			// Switches
			// We choose SwitchMultilevel first, if not available, SwhichBinary is choosen
			if (0x26 in instance.commandClasses) {
				insertSwitch(nodeId, instanceId, 0x26, '<button class="off">Off</button><button class="minus">-</button><button class="plus">+</button><button class="on">On</button><button class="max">Max</button>');
			} else if (0x25 in instance.commandClasses) {
				insertSwitch(nodeId, instanceId, 0x25, '<button class="off">Off</button><button class="on">On</button>');
			}

			// Add SensorMultilevel
			if (0x30 in instance.commandClasses)
				insertSensorMeter(nodeId, instanceId, 0x30, 0, 'level', updateSensor);
			
			if (0x31 in instance.commandClasses)
				insertSensorMeter(nodeId, instanceId, 0x31, 0, 'val', updateSensor);

			// Meters which are supposed to be sensors (measurable)
			if (0x32 in instance.commandClasses)
				$.each(instance.commandClasses[0x32].data, function(key, scale_val) {
					var scaleId = parseInt(key, 10);
					if (isNaN(scaleId))
						return; // not a scale
					if ((scaleId == 2 || scaleId == 4 || scaleId == 6) && scale_val.sensorType.value == 1)
						insertSensorMeter(nodeId, instanceId, 0x32, scaleId, scaleId, updateMeter);
				});

			// Meters (true meter values)
			if (0x32 in instance.commandClasses)
				$.each(instance.commandClasses[0x32].data, function(key, scale_val) {
					var scaleId = parseInt(key, 10);
					if (isNaN(scaleId))
						return; // not a scale
					if ((scaleId == 2 || scaleId == 4 || scaleId == 6) && scale_val.sensorType.value == 1)
						return; // we don't want to have measurable here (W, V, PowerFactor)

					insertMeter(nodeId, instanceId, scaleId);
				});


			/*
			 *
			 * not finished in this demo - Thermostats and DoorLocks
			 *
			 
			if (0x43 in instance.commandClasses || 0x40 in instance.commandClasses) {
				function getCurrentThermostatMode(_instance) {
					var hasThermostatMode = 0x40 in _instance.commandClasses;
					
					var _curThermMode;
					if (hasThermostatMode) {
						_curThermMode = _instance.commandClasses[0x40].data.mode.value;
						if (isNaN(parseInt(_curThermMode, 10)))
							_curThermMode = null; // Mode not retrieved yet
					} else {
						// we pick up first available mode, since not ThermostatMode is supported to change modes
						_curThermMode = null;
						$.each(_instance.commandClasses[0x43].data, function(name) { if (!isNaN(parseInt(name, 10))) { _curThermMode = parseInt(name, 10); return false; } });
					};
					return _curThermMode;
				}

				function updateTemp(obj, path, nodeId, instanceId, areaId) {
					var _instance = ZWaveAPIData.devices[nodeId].instances[instanceId];
					var hasThermostatMode = 0x40 in _instance.commandClasses;
					var hasThermostatSetpoint = 0x43 in _instance.commandClasses;
					var hasThermostatSetback = 0x47 in _instance.commandClasses;
					var hasClimateControlSchedule = 0x46 in _instance.commandClasses;

					if (!(hasThermostatSetpoint) && !(hasThermostatMode)) // to include more Thermostat* CCs
						return; // we don't want devices without ThermostatSetpoint AND ThermostatMode CCs

					var curThermMode = getCurrentThermostatMode(_instance);
					var curThermModeName; 
					if (hasThermostatMode)
						curThermModeName = (curThermMode in _instance.commandClasses[0x40].data) ? _instance.commandClasses[0x40].data[curThermMode].modeName.value : "???";
					else
						curThermModeName = ""; // one mode only, so don't show it

					$(this).find('.curThermMode').html(curThermModeName);

					if (hasThermostatMode && curThermMode === 0) {
						$(this).find('.curTemp').html('');
						$(this).find('.temperature_change').hide();
						return; // Mode = Off
					};

					if (curThermMode === null) {
						$(this).find('.curTemp').html('');
						$(this).find('.temperature_change').hide();
						$(this).find('.thermostat_mode_change').hide();
						return; // interview is not finished
					};
					
					var curTempSP = _instance.commandClasses[0x43].data[curThermMode].setVal.value;
					var curTempSPReal = _instance.commandClasses[0x43].data[curThermMode].val.value;
					var curTempUnit = _instance.commandClasses[0x43].data[curThermMode].scaleString.value;

					$(this).find('.curTemp').html(curTempSP + ' ' + curTempUnit);
					if (curTempSP == curTempSPReal)
						$(this).find('.curTemp').removeClass('red');
					else
						$(this).find('.curTemp').addClass('red');
				};

				var nodeTr = $('<tr device="' + nodeId + '" instance="' + instanceId + '" class="device_header"><td class="center not_important">' + nodeId + '</td><td class="icon">' + (instanceId != 0?('(#' + instanceId + ')'):'') + '</td><td class="right curThermMode" title="Current Thermostat Mode"></td><td class="right curTemp" title="Current Temperature"></td><td class="control_mode"><button id="thermostat_mode_change" class="intl thermostat_mode_change"></button></td><td><span class="temperature_change"></span></td></tr>');
				nodeTr.find('td.icon').prepend(device_icon(nodeId, true));

				(function(nId, iId, aId) {
					var ccPath = 'devices[' + nId + '].instances[' + iId + '].commandClasses';
					nodeTr.bindPath(ccPath + '[' + 0x40 + '].data.mode,' + ccPath + '[' + 0x43 + '].data[*].setVal', updateTemp, nId, iId, aId);
				})(nodeId, instanceId, areaId);

					var devId = $(this).closest('[device]').attr('device');
					var instId = $(this).closest('[device]').attr('instance');
					var area = device_area(devId);

					var _instance = ZWaveAPIData.devices[devId].instances[instId];
					var hasThermostatSetback = 0x47 in _instance.commandClasses;
					var hasClimateControlSchedule = 0x46 in _instance.commandClasses;

				*/

				/*
					var _instance = ZWaveAPIData.devices[devId].instances[instId];
					var curThermMode = getCurrentThermostatMode(_instance);

					try {
						runCmd('devices[' + devId + '].instances[' + instId + '].commandClasses[' + 0x43 + '].Set(' + curThermMode + ', ' + (newTemp).toString(10) + ')');
					} catch(e) {
						error_msg('error_in_setpoint_value', e);
					}
				/////////////
					var devId = $(this).closest('[device]').attr('device');
					var instId = $(this).closest('[device]').attr('instance');

					var _instance = ZWaveAPIData.devices[devId].instances[instId];
					var curThermMode = getCurrentThermostatMode(_instance);

					return ZWaveAPIData.devices[devId].instances[instId].commandClasses[0x43].data[curThermMode].setVal.value;
				*/

				/*
				nodeTr.find('#thermostat_mode_change').
					jeegoocontext('thermostat_mode_change_list', {
						onShow: function(event,context) {
							var devId = parseInt($(context).closest('.device_header').attr('device'), 10);
							var instId = parseInt($(context).closest('.device_header').attr('instance'), 10);
							var _instance = ZWaveAPIData.devices[devId].instances[instId];
							var curThermMode = getCurrentThermostatMode(_instance);
							
							$(this).find('li').each(function() {
								var mode = parseInt($(this).attr('mode'), 10);
								if (mode in _instance.commandClasses[0x40].data) {
									$(this).find('.modename').html(_instance.commandClasses[0x40].data[mode].modeName.value);
									$(this).show();
								} else {
									$(this).hide();
								}
							});
							$(this).find('> li').find('.icon').css({opacity: 0});
							$(this).find('> li[mode="' + curThermMode + '"]').find('.icon').css({opacity: 100});
						},
						onSelect: function(event,context) {
							var devId = parseInt($(context).closest('.device_header').attr('device'), 10);
							var instId = parseInt($(context).closest('.device_header').attr('instance'), 10);
							
							runCmd('devices[' + devId + '].instances[' + instId + '].commandClasses[0x40].Set(' + $(this).attr('mode') + ')');
						}
					})
					.bind('mousedown',function(event){event.type='contextmenu';$(this).trigger(event)});

				*/
			/*				
				tbl.append(nodeTr);
			
			}
			*/

			/*
			if (0x62 in instance.commandClasses) {
				var nodeTr = $('<tr device="' + nodeId + '" class="device_header"><td class="center not_important">' + nodeId + '</td><td class="icon">' + (instanceId != 0?(' (#' + instanceId + ')'):'') + '</td><td id="state" class="right"></td><td class="right"><span title="Last update" id="updateTime"></span></td><td class="center"><button id="update">Update</button></td><td class="right"><span class="value parameter"></span></td></tr>');
				nodeTr.find('td.icon').prepend(device_icon(nodeId, true));

				nodeTr.find('#state').bindPath('devices[' + nodeId + '].instances[' + instanceId + '].commandClasses[' + doorLockCCId + '].data.mode', updateState);

				// CC gui
				var mode = instance.commandClasses[doorLockCCId].data.mode.value;
				if (mode === '' || mode === null)
					mode = 0;
					
				nodeTr.find('.value.parameter').attr('value','[' + mode + ']');
				method_gui.call(nodeTr.find('.value.parameter').get(0), {
					device: nodeId,
					instance: instanceId,
					commandclass: doorLockCCId,
					method: 'Set', // here it is always Set
					methodclass: 'userSet', // here it is always userSet
					immediate: true,
					immediatekeepbutton: false
				});

				(function(nodeId, instanceId) {
					nodeTr.find('#update').bind('click', function() { runCmd('devices[' + nodeId + '].instances[' + instanceId + '].commandClasses[' + doorLockCCId + '].Get()'); } );
				})(nodeId, instanceId);

				tbl.append(nodeTr);
			}
			*/
		});
	});
	$('button').button();
};

// Insert row for SwitchBinary and SwitchMultilevel
function insertSwitch(nodeId, instanceId, ccId, control_html) {
	// Add new line
	var nodeTr = $('<tr device="' + nodeId + '" class="device_header"><td class="center not_important">' + nodeId + '</td><td class="icon">' + (instanceId != 0?(' (#' + instanceId + ')'):'') + '</td><td id="level" class="right"></td><td class="right"><span title="Last update" id="updateTime"></span></td><td class="center"><button id="update">Update</button></td><td class="right"><span class="control"></span></td></tr>');
	nodeTr.find('td.icon').prepend(device_icon(nodeId));

	// Trigger update on changes
	nodeTr.find('#level').bindPath('devices[' + nodeId + '].instances[' + instanceId + '].commandClasses[' + ccId + '].data.level', updateLevel, ccId);

	// Add button actions
	nodeTr.find('.control').append($(control_html).attr('device', nodeId).attr('instance', instanceId).attr('commandClass', ccId).bind('click', switchButtonAction));

	// Action for Update button
	nodeTr.find('#update').bind('click', function() { runCmd('devices[' + nodeId + '].instances[' + instanceId + '].commandClasses[' + ccId + '].Get()'); } );

	// Append it
	tbl.append(nodeTr);
};

// Insert row for SensorBinary, SensroMultilevel and Meter
function insertSensorMeter(nodeId, instanceId, ccId, scaleId, path, updFunc) {
	// Add new line
	var nodeTr = $('<tr device="' + nodeId + '" instance="' + instanceId + '" scale="' + scaleId + '" class="device_header"><td class="center not_important">' + nodeId + '</td><td class="icon">' + (instanceId != 0?('(#' + instanceId + ')'):'') + '</td><td id="sensor_name"></td><td id="level" class="right"></td><td class="right"><span title="Last update" id="last_update"></span></td><td class="center"><button id="update">Update</button></td></tr>');
	nodeTr.find('td.icon').prepend(device_icon(nodeId, true));

	// Trigger update on changes
	nodeTr.bindPath('devices[' + nodeId + '].instances[' + instanceId + '].commandClasses[' + ccId + '].data.' + path, updFunc, ccId);

	// Action for Update button
	nodeTr.find('#update').bind('click', function() { runCmd('devices[' + nodeId + '].instances[' + instanceId + '].commandClasses[' + ccId + '].Get()'); } );

	// Append it
	tbl.append(nodeTr);
};

function insertMeter(nodeId, instanceId, ccId, scaleId) {
	// Add new line
	var nodeTr = $('<tr device="' + nodeId + '" instance="' + instanceId + '" scale="' + scaleId + '" class="device_header"><td class="center not_important">' + nodeId + '</td><td class="icon">' + (instanceId != 0?('(#' + instanceId + ')'):'') + '</td><td id="sensor_name"></td><td id="level" class="right"></td><td class="right"><span title="Last update" id="last_update"></span></td><td class="center"><button id="update">Update</button><button id="reset">Reset</button></td></tr>');
	nodeTr.find('td.icon').prepend(device_icon(nodeId, true));
	
	// Trigger update on changes
	nodeTr.bindPath('devices[' + nodeId + '].instances[' + instanceId + '].commandClasses[' + 0x32 + '].data[' + scaleId + ']', updateMeter);

	// If it is Meter with version < V2 or it is not resettable, hide Reset button (it does not support reset function
	if (ZWaveAPIData.devices[nodeId].instances[instanceId].commandClasses[0x32].data.version.value < 2 || !ZWaveAPIData.devices[nodeId].instances[instanceId].commandClasses[0x32].data.resettable.value)
		nodeTr.find('#reset').hide();

	// Actions on buttons
	nodeTr.find('#update').bind('click', function() { runCmd('devices[' + nodeId + '].instances[' + instanceId + '].commandClasses[' + 0x32 + '].Get()'); });
	nodeTr.find('#reset').bind('click', function() { confirm_dialog('Are you sure to reset the meter?', 'Reset meter value', function() { runCmd('devices[' + nodeId + '].instances[' + instanceId + '].commandClasses[' + 0x32 + '].Reset()'); }) });

	// Append it
	tbl.append(nodeTr);
}

// Callback on button press for a Switch
function switchButtonAction() {
	var nodeId = $(this).attr('device');
	var instanceId = $(this).attr('instance');
	var ccId = $(this).attr('commandClass');
	
	var val = 0;
	var cur = ZWaveAPIData.devices[nodeId].instances[instanceId].commandClasses[ccId].data.level.value;
	
	if ($(this).hasClass('off'))
		val = 0;
	else if ($(this).hasClass('on'))
		val = 255;
	else if ($(this).hasClass('max'))
		val = 99;
	else if ($(this).hasClass('plus'))
		val = ((cur + 10) <= 100) ? cur + 10 : 100;
	else if ($(this).hasClass('minus'))
		val = ((cur - 10) >= 0) ? cur - 10 : 0;
		
	runCmd('devices[' + nodeId + '].instances[' + instanceId + '].commandClasses[' + ccId +'].Set(' + val +')');
};

// Binding function for device status update
function updateDeviceInfo(obj, path, basicType, genericType, specificType, isFLiRS, hasWakeup, hasBattery, isListening) {
	var nodeId = $(this).attr('device');
	var node = ZWaveAPIData.devices[nodeId];
	var lastReceive = parseInt(node.data.lastReceived.updateTime, 10) || 0;
	var lastSend = parseInt(node.data.lastSend.updateTime, 10) || 0;
	var lastCommunication = (lastSend > lastReceive)? lastSend : lastReceive;
	var isFailed = node.data.isFailed.value;
	var isAwake = node.data.isAwake.value;

	// Sleeping state
	var sleeping_html;
	if (isListening)
		sleeping_html = ''; // Mains powered device
	else if (!isListening && hasWakeup) {
		var approx = '';
		var sleepingSince = parseInt(node.instances[0].commandClasses[0x84].data.lastSleep.value, 10);
		var lastWakeup = parseInt(node.instances[0].commandClasses[0x84].data.lastWakeup.value, 10);
		if (isNaN(sleepingSince) || sleepingSince < lastWakeup) {
			sleepingSince = lastWakeup
			if (!isNaN(lastWakeup))
				approx = '<span title="Sleeping since approximately">~</span> ';
		};
		var interval = parseInt(node.instances[0].commandClasses[0x84].data.interval.value, 10);
		if (interval == 0)
			interval = NaN; // To indicate that interval and hence next wakeup are unknown
		var lastSleep = getTime(sleepingSince, '?');
		var nextWakeup = getTime(sleepingSince + interval, '?');
		sleeping_html = '<span title="Sleeping since" class="not_important">' + approx + lastSleep + '</span> &#8594; <span title="Next wakeup">' + approx + nextWakeup + '</span> <img src="pics/icons/type_battery_with_wakeup.png" title="Battery operated device with wakeup"/>';
	} else if (!isListening && isFLiRS)
		sleeping_html = '<img src="pics/icons/type_flirs.png" title="FLiRS device"/>';
	else
		sleeping_html = '<img src="pics/icons/type_remote.png" title="Battery operated remote control"/>';

	// Awake info
	var awake_html = '';
	if (!isListening && !isFLiRS)
		awake_html = isAwake?('<img src="pics/icons/status_awake.png" title="Device is active"/>'):('<img src="pics/icons/status_sleep.png" title="Device is sleeping"/>');
	
	// Failed node status
	var operating_html = (isFailed?('<img src="pics/icons/status_dead.png" title="Device is dead"/>'):('<img src="pics/icons/status_ok.png" title="Device is operating"/>')) + ' <span title="Last communication" class="not_important">' + getTime(lastCommunication, '?') + '</span>';

	// Interview results
	var _interview_html = '<img src="pics/icons/status_ok.png" title="Device is interviewed"/>';
	var __interview_html = '<img src="pics/icons/interview_unfinished.png" title="Device is not fully interviewed"/>';
	if (ZWaveAPIData.devices[nodeId].data.nodeInfoFrame.value && ZWaveAPIData.devices[nodeId].data.nodeInfoFrame.value.length) {
		for (var iId in ZWaveAPIData.devices[nodeId].instances)		
			for (var ccId in ZWaveAPIData.devices[nodeId].instances[iId].commandClasses)
				if (!ZWaveAPIData.devices[nodeId].instances[iId].commandClasses[ccId].data.interviewDone.value)  {
					_interview_html = __interview_html;
				}
	} else
		_interview_html = __interview_html;
	
	interview_html = '<a href="#" id="interviewShow">' + _interview_html + '</a>';

	// Battery status
	var battery_html = '';
	if (hasBattery) {
		var battery_charge = parseInt(node.instances[0].commandClasses[0x80].data.last.value);
		var battery_updateTime = getTime(node.instances[0].commandClasses[0x80].data.last.updateTime);
		var battery_warn;
		var battery_charge_icon;
		var battery_charge_text;
		if (battery_charge != null) {
			if (battery_charge == 255) // by CC Battery specs
				battery_charge = 0;
			battery_warn = (battery_charge < 10)
			battery_charge_text = battery_charge.toString() + '%';
			battery_charge_icon = (battery_charge < 10) ? '0' : ((battery_charge < 50) ? '50' : '100');
		} else {
			battery_warn = true;
			battery_charge_text = '?';
			battery_charge_icon = '0';
		};
		battery_html = '<img src="pics/icons/battery_' + battery_charge_icon + '.png" title="Battery powered device"/> <span class="' + (battery_warn?'red':'') + '" title="' + battery_updateTime + '">' + battery_charge_text + '</span>';
	};

	// Update HTML objects
	$(this).find('#sleeping').html(sleeping_html);
	$(this).find('#awake').html(awake_html);
	$(this).find('#operating').html(operating_html);
	$(this).find('#battery').html(battery_html);
	$(this).find('#interview').html(interview_html);
	if (isListening || isFLiRS)
		$(this).find('#pingDevice').show();
	else
		$(this).find('#pingDevice').hide();
};

// Binding function for switches level update
function updateLevel(obj, path, ccId) {
	var level_html;
	var level_color;

	var level = obj.value;

	if (level === '' || level === null) {
		level_html = '?';
		level_color = 'gray';
	} else {
		level = parseInt(level, 10);
		if (level == 0) {
			level_html = 'Off';
			level_color = 'black';
		} else if (level == 255 || level == 99) {
			level_html = 'On';
			level_color = '#FFCF00';
		} else {
			level_html = level.toString() + ((ccId == 0x26) ? '%' : '');
			var lvlc_r = ('00' + parseInt(0x9F + 0x60 * level / 99).toString(16)).slice(-2);
			var lvlc_g = ('00' + parseInt(0x7F + 0x50 * level / 99).toString(16)).slice(-2);
			level_color = '#' + lvlc_r + lvlc_g + '00';
		}
	};
	$(this).html(level_html).css('color', level_color);
	$(this).parent().find('#updateTime').html(getUpdated(obj));
};

// Binding function for DoorLock update
function updateLockState(obj, path) {
	var mode = obj.value;
	var mode_lbl;

	if (mode === '' || mode === null) {
		mode_lbl = '?';
	} else {
		mode_lbl = mode;
	};
	$(this).html(mode_lbl);
	$(this).parent().find('#updateTime').html(getUpdated(obj));
};

// Binding function for SensorsBinary and SensorMultilevel update
function updateSensor(obj, path, ccId) {
	var nodeId = $(this).attr('device');
	var instanceId = $(this).attr('instance');
	var instance = ZWaveAPIData.devices[nodeId].instances[instanceId];
	var sensorName = '';
	var level_html;
	var level_color = 'black';
	var updatedTime;
	if (ccId == 0x31) {
		if (typeof instance.commandClasses[0x31].data.scaleString === "undefined")
			return; // not interviewed yet
		sensorName = instance.commandClasses[0x31].data.sensorTypeString.value;
		var scale = instance.commandClasses[0x31].data.scaleString.value;
		var val = obj.value;
		updatedTime = getUpdated(obj);
		if (val === '' || val === null) {
			level_html = '?';
			level_color = 'gray';
		} else
			level_html = val + ' ' + scale;
	} else if (ccId == 0x30) {
		var level = obj.value;
		sensorName = 'Sensor state';
		updatedTime = getUpdated(obj);
		if (level === '' || level === null) {
			level_html = '?';
			level_color = 'gray';
		} else {
			level_html = level ? 'Sensor triggered' : 'Sensor idle';
			level_color = level ? '#FFCF00' : 'black';
		}
	};
	$(this).find('#sensor_name').html(sensorName);
	$(this).find('#level').html(level_html).css('color', level_color);
	$(this).find('#last_update').html(updatedTime);
};

// Binding function for Meter update
function updateMeter(obj, path, ccId) {
	var level_html;
	var level_color = 'black';

	var sensorName = obj.sensorTypeString.value;
	var scale = obj.scaleString.value;
	var val = obj.val.value;
	var updatedTime = getUpdated(obj);
	if (val === '' || val === null) {
		level_html = '?';
		level_color = 'gray';
	} else
		level_html = val + ' ' + scale;
	$(this).find('#sensor_name').html(sensorName);
	$(this).find('#level').html(level_html).css('color', level_color);
	$(this).find('#last_update').html(updatedTime);
};

// Render device icon depending on device status
function device_icon(nodeId) {
	ico = $('<div device="' + nodeId + '" class="device_icon"><img class="device_icon_img"/></div>');
	ico.find('.device_icon_img').bind('error', function() {
		// in case the image is not found on the server
		if ($(this).attr('src') != 'pics/icons/device_icon_unknown.png')
			$(this).attr('src', 'pics/icons/device_icon_unknown.png');
	}).bindPath('devices[' + nodeId + '].instances[0].commandClasses[' + 0x25 + '].data.level,devices[' + nodeId + '].instances[0].commandClasses[' + 0x26 + '].data.level,devices[' + nodeId + '].instances[0].commandClasses[' + 0x30 + '].data.level,devices[' + nodeId + '].instances[0].commandClasses[' + 0x31 + '].data.val', function(obj, path, icon_nodeId) {
		// We bind changes of level of some Command Classes. Add more if you need to update icon on other DataHolders
		var icon_name_suffix = 'unregistered';
		var extension = 'png'; // default - can be changed to gif to for animated icons
		
		var custom_icon, custom_type;
		if (icon_nodeId == 255)
			icon_name_suffix = 'broadcast';
		else if (icon_nodeId in ZWaveAPIData.devices) {
			var genericType = ZWaveAPIData.devices[icon_nodeId].data.genericType.value;
			var specificType = ZWaveAPIData.devices[icon_nodeId].data.specificType.value;
			icon_name_suffix = genericType + '_' + specificType;
			switch (genericType) {
				case 0x08:
					/* some condition to get thermostat mode
					if (0x in ZWaveAPIData.devices[icon_nodeId].instances[0].commandClasses && ZWaveAPIData.devices[icon_nodeId].instances[0].commandClasses[0x].data.level.value)
						icon_name_suffix += '_255';
					else
					_0 = cool
					_1 = warm
					_2 = hot
					*/
					icon_name_suffix += '_0';
					break;

				case 0x09:
					/* some condition to get window blind state
					if (0x in ZWaveAPIData.devices[icon_nodeId].instances[0].commandClasses && ZWaveAPIData.devices[icon_nodeId].instances[0].commandClasses[0x].data.level.value)
						icon_name_suffix += '_255';
					else
					_0 = open
					_50 = intermedium
					_255 = closed
					*/
					icon_name_suffix += '_50';
					break;
					
				case 0x10:
					if (0x25 in ZWaveAPIData.devices[icon_nodeId].instances[0].commandClasses && ZWaveAPIData.devices[icon_nodeId].instances[0].commandClasses[0x25].data.level.value)
						icon_name_suffix += '_255';
					else
						icon_name_suffix += '_0';
					break;

				case 0x11:
					if (0x26 in ZWaveAPIData.devices[icon_nodeId].instances[0].commandClasses && ZWaveAPIData.devices[icon_nodeId].instances[0].commandClasses[0x26].data.level.value > 50)
						icon_name_suffix += '_255';
					else if (0x26 in ZWaveAPIData.devices[icon_nodeId].instances[0].commandClasses && ZWaveAPIData.devices[icon_nodeId].instances[0].commandClasses[0x26].data.level.value > 0)
						icon_name_suffix += '_50';
					else
						icon_name_suffix += '_0';
					break;

				case 0x20:
					if (0x30 in ZWaveAPIData.devices[icon_nodeId].instances[0].commandClasses && ZWaveAPIData.devices[icon_nodeId].instances[0].commandClasses[0x30].data.level.value)
						icon_name_suffix += '_255';
					else
						icon_name_suffix += '_0';
					break;

				/* SensorMultilevel is represented by one icon for all states
				case 0x21:
					if (0x31 in ZWaveAPIData.devices[icon_nodeId].instances[0].commandClasses && ZWaveAPIData.devices[icon_nodeId].instances[0].commandClasses[0x31].data.val.value)
						icon_name_suffix += '_255';
					break;
				*/

				case 0x40:
					/* some condition to get alarm
					if (0x in ZWaveAPIData.devices[icon_nodeId].instances[0].commandClasses && ZWaveAPIData.devices[icon_nodeId].instances[0].commandClasses[0x].data.level.value)
						icon_name_suffix += '_255';
					else
					_0 = open
					_1 = closed
					_2 = locked
					*/
					icon_name_suffix += '_1';
					break;

				case 0xA1:
					/* some condition to get alarm
					if (0x in ZWaveAPIData.devices[icon_nodeId].instances[0].commandClasses && ZWaveAPIData.devices[icon_nodeId].instances[0].commandClasses[0x].data.level.value) {
						icon_name_suffix += '_255';
						extension = 'gif'; // animated icon
					} else
					*/
					icon_name_suffix += '_0';
					break;

			}
		};
		$(this).attr('src', 'pics/icons/device_icon_' + icon_name_suffix + ((extension != '') ? ('.' + extension) : ''));
	}, nodeId);
	return ico;
};

// POST JSON function
$.postJSON = function(url, data, callback, sync) {
	// shift arguments if data argument was omited
	if ( jQuery.isFunction( data ) ) {
		sync = sync || callback;
		callback = data;
		data = {};
	};
	$.ajax({
		type: 'POST',
		url: server_host + url,
		data: data,
		dataType: 'json',
		success: callback,
		error: callback,
		async: (sync!=true),
		beforeSend : function(req) {
			if (server_auth)
				req.setRequestHeader('Authorization', server_auth);
		}
       	});
};

// Prepare token for Basic Auth
function make_basic_auth(user, password) {
	if (user == '')
		return '';
	
	var tok = user + ':' + password;
	var hash = Base64.encode(tok);
	return "Basic " + hash;
}

// Prepare new server URL and login/passwd
var server_host = '';
var server_auth = '';
ZWayServerChange = function(host, user, pwd) {
	server_host = host;
	server_auth = make_basic_auth(user, pwd);
	ZWaveAPIData.updateTime = 0; // Fetch all data from server
};

// len function
$.objLen = function objLen(obj) { var l = 0; for (name in obj) l++; return l; };

// holder for all data
var ZWaveAPIData = { updateTime: 0 };

// Get data holder element
function getDataHolder(data) {
	var r = '<div class="Data">';
	r += '<div class="DataElement">' + data.name+': <font color="' + ((data.updateTime > data.invalidateTime) ? 'green' : 'red') + '">'+((typeof(data.value) !== 'undefined' && data.value != null)?data.value.toString():'None')+'</font>' + ' (' + getUpdated(data) + ')</div>';

	$.each(data, function (key, el) {
		if (key != 'name' && key != 'type' && key != 'updateTime' && key != 'invalidateTime' && key != 'value' && // these are internal values - skip them
				key != 'ZDDXML' && key != 'ZDDXMLLang' && key != 'capabilitiesNames') // these make the dialog monstrious - skip them
			r += getDataHolder(el);
	});

	r += '</div>';
	return r
};

// Shows Data Holder in a dialog
function showDataHolder(data) {	
	$('div.DataHolder').html(getDataHolder(data))
		.css({'max-height': $(document.body).height()-128, height: 'auto'})
		.dialog({
			modal: true,
		       	title: 'Command class data',
		       	width: 'auto',
		       	buttons: {
		       		ok : function() {
			       		$(this).dialog("close");
				}
			}
		});
};

// Show interview results in a dialog
function showInterviewResults(nodeId) {	
	var interviewResults;
	$('#interview_result')
		.bindPath('devices[' + nodeId + '].instances[*].commandClasses,devices[' + nodeId + '].instances[*].commandClasses[*].data.interviewDone', function() {
			interviewResults = $('<table id="interviewResultsTable"><tr><td>Instance</td><td>Command Class</td><td>Result</td></tr></table>');
			for (var iId in ZWaveAPIData.devices[nodeId].instances)
				for (var ccId in ZWaveAPIData.devices[nodeId].instances[iId].commandClasses) {
					ccResult = $('<tr><td align="center"><a href="#" class="a_instance">' + iId + '</a></td><td><a href="#" class="a_command_class">' + ZWaveAPIData.devices[nodeId].instances[iId].commandClasses[ccId].name + '</a></td><td>' + (ZWaveAPIData.devices[nodeId].instances[iId].commandClasses[ccId].data.interviewDone.value? 'Done': '<button class="run geek"></button>') + '</td></tr>');
					(function(nodeId, iId) {
						ccResult.find('a.a_instance').bind("click", function() { showDataHolder(ZWaveAPIData.devices[nodeId].instances[iId].data); });
					})(nodeId, iId);
					(function(nodeId, iId, ccId) {
						ccResult.find('a.a_command_class').bind("click", function() { showDataHolder(ZWaveAPIData.devices[nodeId].instances[iId].commandClasses[ccId].data); });
						ccResult.find('.run').bind("click", function() { runCmd('devices[' + nodeId + '].instances[' + iId + '].commandClasses[' + ccId + '].Interview()'); }).html('Force interview').button();
					})(nodeId, iId, ccId);
					interviewResults.append(ccResult);
				}
			 $(this).html('Interview results' + ': <a href="#" class="a_device">' + nodeId + '</a><br /><br />').append(interviewResults);
			 $('#interview_result').find('a.a_device').bind("click", function() { showDataHolder(ZWaveAPIData.devices[nodeId].data); });
		})
		.append(interviewResults) // hack to render dialog size
		.css({'max-height': $(document.body).height()-128})
		.dialog({
			modal: true,
		       	title: 'Interview results',
			width: 'auto',
		       	buttons: {
				ok : function() {
					$(this).dialog("close");
				}
			}
		});

};

// Run ZWaveAPI command via HTTP POST
function runCmd(cmd, success_cbk) {
	$.postJSON('/ZWaveAPI/Run/'+ cmd, function (data, status) {
		if (status == 'success' || status == '') {
			if (success_cbk) success_cbk();
			if (data) console.log(data);
		} else
			alert_dialog('Command execution failed: ' + data.statusText);
	});
	return 'sent';
};

// Get updates data from ZWaveAPI via HTTP POST
var running_getDataUpdate = false; // in case request would take more than interval between subsequent requests
function getDataUpdate(sync) {
	if (!running_getDataUpdate) {
		running_getDataUpdate = true; // begin task
		$('.updateTimeTick').addClass('red');
		$.postJSON('/ZWaveAPI/Data/' + ZWaveAPIData.updateTime, handlerDataUpdate, sync);
	}
};

// Callback of getDataUpdate: handles diff changes returned by server
function handlerDataUpdate(data, status) {
	if (status != 'success' || data == null) {
		running_getDataUpdate = false; // task done
		error_msg('Error connecting to server: ' + status + ' ' + data.status);
		return;
	};
	
	error_msg('');

	try {
		// handle data
		$.each(data, function (path, obj) {
			var pobj = ZWaveAPIData;
			var pe_arr = path.split('.');
			for (var pe in pe_arr.slice(0, -1))
				pobj = pobj[pe_arr[pe]];
			pobj[pe_arr.slice(-1)] = obj;
			
			$.triggerPath.update(path);
		});
	} catch(err) {
		error_msg('Error during data update', err.stack);
	};
	
	running_getDataUpdate = false; // task done

	// update time button. we are doing it here and not using bindPath to save resources
	$('.updateTimeTick').removeClass('red').html((new Date(parseInt(ZWaveAPIData.updateTime, 10)*1000)).format('HH:MM:ss'));
};

function error_msg(message) {
	$('#server_connection_status').html(message);
};

// Calculates difference between two dates in days
function days_between(date1, date2) {
	return Math.round(Math.abs(date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
};

// Return string with date in smart format: "hh:mm" if current day, "hh:mm dd" if this week, "hh:mm dd mmmm" if this year, else "hh:mm dd mmmm yyyy"
function getTime(timestamp, invalidReturn) {
	var d = new Date(parseInt(timestamp, 10)*1000);
	if (timestamp === 0 || isNaN(d.getTime()))
		return invalidReturn

	var cd = new Date();

	var fmt;
	if (days_between(cd, d) < 1 && cd.getDate() == d.getDate()) // this day
		fmt = 'HH:MM';
	else if (days_between(cd, d)  < 7 && ((cd < d) ^ (cd.getDay() >= d.getDay()))) // this week
		fmt = 'dddd HH:MM';
	else if (cd.getFullYear() == d.getFullYear()) // this year
		fmt = 'dddd, d mmmm HH:MM';
	else // one upon a time
		fmt = 'dddd, d mmmm yyyy HH:MM';

	return d.format(fmt);
};

// Return span with current date in smart format and class="red" if the data is outdated or class="" if up to date
function getUpdated(data) {
	return '<span class="' + ((data.updateTime > data.invalidateTime) ?'':'red') + '">' + getTime(data.updateTime, '?') + '</span>';
};
