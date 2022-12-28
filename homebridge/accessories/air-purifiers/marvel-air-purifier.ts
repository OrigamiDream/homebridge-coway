import {Accessory, AccessoryResponses} from "../accessory";
import {
    API,
    CharacteristicEventTypes,
    CharacteristicGetCallback,
    CharacteristicSetCallback,
    CharacteristicValue, Formats,
    Logging,
    PlatformAccessory,
    Service
} from "homebridge";
import {Device} from "../../interfaces/device";
import {CowayService, PayloadCommand} from "../../coway";
import {AirQuality, FanSpeed, Field, Light, Mode, Power} from "./enumerations";
import {DeviceType, Endpoint} from "../../enumerations";
import {ControlInfo, FilterInfo, IndoorAirQuality, MarvelAirPurifierInterface} from "./interfaces";

// Refer to https://github.com/homebridge/HAP-NodeJS/releases/tag/v0.10.3
// Fix rounding algorithm by @OrigamiDream in #956 and #958
const LIGHTBULB_BRIGHTNESS_UNIT = 100 / 3.0;
const ROTATION_SPEED_UNIT = 100 / 6.0;

// MARVEL Air Purifier
export class MarvelAirPurifier extends Accessory<MarvelAirPurifierInterface> {

    private airPurifierService?: Service;
    private airQualityService?: Service;
    private humiditySensorService?: Service;
    private temperatureSensorService?: Service;
    private lightbulbService?: Service;

    constructor(log: Logging, api: API, deviceInfo: Device, service: CowayService, platformAccessory: PlatformAccessory) {
        super(log, api, DeviceType.MARVEL_AIR_PURIFIER, deviceInfo, service, platformAccessory);

        this.endpoints.push(Endpoint.GET_DEVICE_CONTROL_INFO);
        this.endpoints.push(Endpoint.GET_DEVICE_STATUS_INFO);
        this.endpoints.push(Endpoint.GET_DEVICE_FILTER_INFO);
    }

    async refresh(responses: AccessoryResponses): Promise<void> {
        await super.refresh(responses);

        const filterInfo = responses[Endpoint.GET_DEVICE_FILTER_INFO];
        const statusInfo = responses[Endpoint.GET_DEVICE_STATUS_INFO];
        const controlInfo = responses[Endpoint.GET_DEVICE_CONTROL_INFO];

        const ctx = this.platformAccessory.context as MarvelAirPurifierInterface;
        try {
            ctx.filterInfos = this.getFilterInfos(filterInfo);
            ctx.indoorAirQuality = this.getIndoorAirQuality(statusInfo);
            ctx.controlInfo = this.getControlInfo(controlInfo);
        } catch(e: any) {
            this.log.error(`${e.name}: ${e.message}`);
            this.log.debug("An error has occurred with fetched responses:");
            this.log.debug("Filter Info", filterInfo);
            this.log.debug("Status Info", statusInfo);
            this.log.debug("Control Info", controlInfo);
        }

        await this.refreshCharacteristics(() => {
            // Air Purifiers
            this.airPurifierService?.setCharacteristic(this.api.hap.Characteristic.Active, ctx.controlInfo.on);
            this.airPurifierService?.setCharacteristic(this.api.hap.Characteristic.CurrentAirPurifierState, this.getCurrentAirPurifierState(ctx));
            this.airPurifierService?.setCharacteristic(this.api.hap.Characteristic.TargetAirPurifierState, this.getPurifierDrivingStrategy(ctx));
            this.airPurifierService?.setCharacteristic(this.api.hap.Characteristic.RotationSpeed, this.getRotationSpeedPercentage(ctx));

            // Lightbulbs
            this.lightbulbService?.setCharacteristic(this.api.hap.Characteristic.On, ctx.controlInfo.on && ctx.controlInfo.lightbulbInfo.on);
            this.lightbulbService?.setCharacteristic(this.api.hap.Characteristic.Brightness, this.getLightbulbBrightnessPercentage(ctx));

            // Air Quality
            this.airQualityService?.setCharacteristic(this.api.hap.Characteristic.AirQuality, this.getCurrentAirQuality(ctx));
            this.airQualityService?.setCharacteristic(this.api.hap.Characteristic.PM10Density, ctx.indoorAirQuality.pm10Density);
            this.airQualityService?.setCharacteristic(this.api.hap.Characteristic.PM2_5Density, ctx.indoorAirQuality.pm25Density);
            this.airQualityService?.setCharacteristic(this.api.hap.Characteristic.VOCDensity, ctx.indoorAirQuality.vocDensity);

            // Humidity Sensors
            this.humiditySensorService?.setCharacteristic(this.api.hap.Characteristic.CurrentRelativeHumidity, ctx.indoorAirQuality.humidity);

            // Temperature Sensors
            this.temperatureSensorService?.setCharacteristic(this.api.hap.Characteristic.CurrentTemperature, ctx.indoorAirQuality.temperature);
        });
    }

    async configure() {
        await super.configure();

        const responses = await this.refreshDevice();
        const filterInfo = responses[Endpoint.GET_DEVICE_FILTER_INFO];
        const statusInfo = responses[Endpoint.GET_DEVICE_STATUS_INFO];
        const controlInfo = responses[Endpoint.GET_DEVICE_CONTROL_INFO];

        this.replace({
            deviceType: this.deviceType,
            deviceInfo: this.deviceInfo,
            init: false,
            configured: true,
            filterInfos: this.getFilterInfos(filterInfo),
            indoorAirQuality: this.getIndoorAirQuality(statusInfo),
            controlInfo: this.getControlInfo(controlInfo)
        });

        this.airPurifierService = this.registerAirPurifierService();

        this.airQualityService = this.registerAirQualityService();
        this.humiditySensorService = this.registerHumiditySensorService();
        this.temperatureSensorService = this.registerTemperatureSensorService();
        this.lightbulbService = this.registerLightbulbService();
    }

    getControlInfo(controlInfo: any): ControlInfo {
        const status = controlInfo["controlStatus"];
        return {
            on: status[Field.POWER] === "1", // 1 → ON, 0 → OFF
            lightbulbInfo: {
                on: status[Field.LIGHT] === "0", // 0 → ON, 3 → OFF
                brightness: parseInt(status[Field.LIGHT_BRIGHTNESS]), // 0 → AUTO, 1 → LV1, 2 → LV2, 3 → LV3
            },
            airQuality: parseInt(status[Field.AIR_QUALITY]) as AirQuality,
            mode: status[Field.MODE] as Mode,
            fanSpeed: status[Field.FAN_SPEED] as FanSpeed
        };
    }

    getIndoorAirQuality(statusInfo: any): IndoorAirQuality {
        const response = statusInfo["IAQ"][0];
        return {
            humidity: parseFloat(response["humidity"]),
            pm25Density: parseFloat(response["dustpm25"]),
            pm10Density: parseFloat(response["dustpm10"]),
            temperature: parseFloat(response["temperature"]),
            vocDensity: parseFloat(response["vocs"])
        };
    }

    getFilterInfos(filterInfo: any): FilterInfo[] {
        const filters = filterInfo["filterList"] as any[];
        return filters.map(filter => {
            return {
                filterName: filter["filterName"],
                filterCode: filter["filterCode"],
                filterPercentage: filter["filterPer"]
            };
        });
    }

    registerLightbulbService(): Service {
        const service = this.ensureServiceAvailability(this.api.hap.Service.Lightbulb);
        service.getCharacteristic(this.api.hap.Characteristic.On)
            .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                const ctx = this.platformAccessory.context as MarvelAirPurifierInterface;
                callback(undefined, ctx.controlInfo.on && ctx.controlInfo.lightbulbInfo.on);
            }))
            .on(CharacteristicEventTypes.SET, this.wrapSet(async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                const ctx = this.platformAccessory.context as MarvelAirPurifierInterface;
                const enabled = !!value;
                if(ctx.controlInfo.lightbulbInfo.on === enabled) {
                    callback(undefined);
                    return;
                }

                if(!ctx.controlInfo.on && enabled) {
                    // Turn the Air Purifier on
                    await this.executeSetPayload(ctx.deviceInfo, Field.POWER, Power.ON, this.accessToken);
                    callback(undefined);
                    return;
                }
                ctx.controlInfo.lightbulbInfo.on = enabled;

                await this.executeSetPayload(ctx.deviceInfo, Field.LIGHT, enabled ? Light.ON : Light.OFF, this.accessToken);
                callback(undefined);
            }));

        service.getCharacteristic(this.api.hap.Characteristic.Brightness)
            .setProps({
                format: Formats.FLOAT,
                minValue: 0.0, // auto-driving brightness state (only available with direct hardware control)
                maxValue: 100.0, // Up to level 3
                minStep: LIGHTBULB_BRIGHTNESS_UNIT
            })
            .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                const ctx = this.platformAccessory.context as MarvelAirPurifierInterface;
                if(!ctx.controlInfo.on) {
                    callback(undefined, 0); // zero brightness when the purifier turned off
                    return;
                }
                let brightness = ctx.controlInfo.lightbulbInfo.brightness * LIGHTBULB_BRIGHTNESS_UNIT;
                callback(undefined, brightness);
            }))
            .on(CharacteristicEventTypes.SET, this.wrapSet(async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                const ctx = this.platformAccessory.context as MarvelAirPurifierInterface;
                const brightness = Math.round((value as number) / LIGHTBULB_BRIGHTNESS_UNIT);

                if(ctx.controlInfo.lightbulbInfo.brightness === brightness) {
                    callback(undefined);
                    return;
                }
                ctx.controlInfo.lightbulbInfo.brightness = brightness;

                if(brightness === 0) {
                    // If the brightness goes zero, turn the light off.
                    ctx.controlInfo.lightbulbInfo.on = false;

                    await this.executeSetPayload(ctx.deviceInfo, Field.LIGHT, Light.OFF, this.accessToken);
                    callback(undefined);
                    return;
                }

                const commands: PayloadCommand[] = [];
                if(!ctx.controlInfo.on) {
                    // If the user attempts to light up and the purifier is offline
                    commands.push({
                        key: Field.POWER,
                        value: Power.ON
                    });
                }
                commands.push({
                    key: Field.LIGHT_BRIGHTNESS,
                    value: brightness.toFixed(0)
                });
                await this.executeSetPayloads(ctx.deviceInfo, commands, this.accessToken);
                callback(undefined);
            }));
        return service;
    }

    registerAirPurifierService(): Service {
        const service = this.ensureServiceAvailability(this.api.hap.Service.AirPurifier);
        service.getCharacteristic(this.api.hap.Characteristic.Active)
            .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                const ctx = this.platformAccessory.context as MarvelAirPurifierInterface;
                callback(undefined, ctx.controlInfo.on ? this.api.hap.Characteristic.Active.ACTIVE : this.api.hap.Characteristic.Active.INACTIVE);
            }))
            .on(CharacteristicEventTypes.SET, this.wrapSet(async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                const ctx = this.platformAccessory.context as MarvelAirPurifierInterface;
                const enabled = !!value;
                if(enabled === ctx.controlInfo.on) {
                    callback(undefined);
                    return;
                }
                ctx.controlInfo.on = enabled;
                if(!enabled) {
                    ctx.controlInfo.lightbulbInfo.on = false;
                    ctx.controlInfo.lightbulbInfo.brightness = 0;
                    setTimeout(() => {
                        this.lightbulbService?.setCharacteristic(this.api.hap.Characteristic.On, ctx.controlInfo.on && ctx.controlInfo.lightbulbInfo.on);
                        this.lightbulbService?.setCharacteristic(this.api.hap.Characteristic.Brightness, this.getLightbulbBrightnessPercentage(ctx));
                    }, 0);
                }

                await this.executeSetPayload(ctx.deviceInfo, Field.POWER, enabled ? Power.ON : Power.OFF, this.accessToken);
                callback(undefined);
            }));

        service.getCharacteristic(this.api.hap.Characteristic.CurrentAirPurifierState)
            .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                const ctx = this.platformAccessory.context as MarvelAirPurifierInterface;
                callback(undefined, this.getCurrentAirPurifierState(ctx));
            }));

        service.getCharacteristic(this.api.hap.Characteristic.TargetAirPurifierState)
            .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                const ctx = this.platformAccessory.context as MarvelAirPurifierInterface;
                callback(undefined, this.getPurifierDrivingStrategy(ctx));
            }))
            .on(CharacteristicEventTypes.SET, this.wrapSet(async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                const ctx = this.platformAccessory.context as MarvelAirPurifierInterface;
                if(!ctx.controlInfo.on || ctx.controlInfo.fanSpeed == FanSpeed.SHUTDOWN) {
                    callback(undefined);
                    return;
                }
                const wasAuto = ctx.controlInfo.mode === Mode.AUTO_DRIVING;
                const isAuto = value === this.api.hap.Characteristic.TargetAirPurifierState.AUTO;
                if(wasAuto === isAuto) {
                    callback(undefined);
                    return;
                }

                if(isAuto) {
                    await this.driveAutomatically(ctx);
                } else {
                    const result = await this.driveManually(ctx);
                    if(!result) {
                        callback(new Error("INVALID ROTATION SPEED"));
                        return;
                    }
                }
                callback(undefined);
            }));

        service.getCharacteristic(this.api.hap.Characteristic.RotationSpeed)
            .setProps({
                format: Formats.FLOAT,
                minValue: 0,
                maxValue: 100, // Up to level 6
                minStep: ROTATION_SPEED_UNIT
            })
            .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                const ctx = this.platformAccessory.context as MarvelAirPurifierInterface;
                callback(undefined, this.getRotationSpeedPercentage(ctx));
            }))
            .on(CharacteristicEventTypes.SET, this.wrapSet(async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                const ctx = this.platformAccessory.context as MarvelAirPurifierInterface;
                const oldRotationSpeed = this.getRotationSpeed(ctx);
                const newRotationSpeed = parseInt(((value as number) / ROTATION_SPEED_UNIT).toFixed(0));
                if(ctx.controlInfo.mode == Mode.AUTO_DRIVING && this.characteristicRefreshing) {
                    // When it's on refreshing and auto driving mode, ignore the updates
                    callback(undefined);
                    return;
                }
                if(oldRotationSpeed === newRotationSpeed) {
                    callback(undefined);
                    return;
                }
                const commands: PayloadCommand[] = [];
                // If the air purifier is offline, make sure wake them up
                if(!ctx.controlInfo.on) {
                    commands.push({
                        key: Field.POWER,
                        value: Power.ON
                    });
                } else if(newRotationSpeed === 0) {
                    callback(undefined);
                    return;
                }
                const command = this.createCommandFromRotationSpeed(newRotationSpeed);
                if(command) {
                    commands.push(command);
                    await this.executeSetPayloads(ctx.deviceInfo, commands, this.accessToken);
                    callback(undefined);
                } else {
                    this.log.error("Characteristic: Invalid fan rotation speed (current rotation speed: %d, 0003=%s)", newRotationSpeed, ctx.controlInfo.fanSpeed);
                    callback(new Error("INVALID ROTATION SPEED"));
                }
            }));
        return service;
    }

    async driveAutomatically(ctx: MarvelAirPurifierInterface) {
        ctx.controlInfo.mode = Mode.AUTO_DRIVING;
        await this.executeSetPayload(ctx.deviceInfo, Field.MODE, Mode.AUTO_DRIVING, this.accessToken);
    }

    async driveManually(ctx: MarvelAirPurifierInterface) {
        // Find out same output speed during auto-driving mode
        const rotationSpeed = this.getRotationSpeed(ctx);
        const command = this.createCommandFromRotationSpeed(rotationSpeed);
        if(command) {
            await this.executeRotationCommand(ctx, command);
        } else {
            this.log.error("driveManually(): Invalid fan rotation speed (current rotation speed: %d, 0003=%s)", rotationSpeed, ctx.controlInfo.fanSpeed);
            return false;
        }
        return true;
    }

    registerAirQualityService(): Service {
        const service = this.ensureServiceAvailability(this.api.hap.Service.AirQualitySensor);
        service.getCharacteristic(this.api.hap.Characteristic.AirQuality)
            .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                const ctx = this.platformAccessory.context as MarvelAirPurifierInterface;

                callback(undefined, this.getCurrentAirQuality(ctx));
            }));
        service.getCharacteristic(this.api.hap.Characteristic.PM10Density)
            .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                const ctx = this.platformAccessory.context as MarvelAirPurifierInterface;
                const airQuality = ctx.indoorAirQuality;

                callback(undefined, airQuality.pm10Density);
            }));
        service.getCharacteristic(this.api.hap.Characteristic.PM2_5Density)
            .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                const ctx = this.platformAccessory.context as MarvelAirPurifierInterface;
                const airQuality = ctx.indoorAirQuality;

                callback(undefined, airQuality.pm25Density);
            }));
        service.getCharacteristic(this.api.hap.Characteristic.VOCDensity)
            .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                const ctx = this.platformAccessory.context as MarvelAirPurifierInterface;
                const airQuality = ctx.indoorAirQuality;

                callback(undefined, airQuality.vocDensity);
            }));
        return service;
    }

    registerHumiditySensorService(): Service {
        const service = this.ensureServiceAvailability(this.api.hap.Service.HumiditySensor);
        service.getCharacteristic(this.api.hap.Characteristic.CurrentRelativeHumidity)
            .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                const ctx = this.platformAccessory.context as MarvelAirPurifierInterface;
                const airQuality = ctx.indoorAirQuality;

                callback(undefined, airQuality.humidity);
            }));
        return service;
    }

    registerTemperatureSensorService(): Service {
        const service = this.ensureServiceAvailability(this.api.hap.Service.TemperatureSensor);
        service.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature)
            .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                const ctx = this.platformAccessory.context as MarvelAirPurifierInterface;
                const airQuality = ctx.indoorAirQuality;

                callback(undefined, airQuality.temperature);
            }));
        return service;
    }

    /*
    registerFilterMaintenanceService(): Service[] {
        function _getPercentage(ctx: MarvelAirPurifierInterface, filterName: string): number {
            const filter = ctx.filterInfos.find(filter => filter.filterName === filterName);
            return filter?.filterPercentage ?? 100;
        }

        const services = [];
        for(const filter of this.platformAccessory.context.filterInfos) {
            const filterName = filter.filterName;

            // Setup Filter Maintenance Service with Specific Filter Codes
            // const service = this.ensureServiceAvailability(
            //     this.api.hap.Service.FilterMaintenance,
            //     filterName, filter.filterCode);
            const service = new this.api.hap.Service.FilterMaintenance(filterName, filter.filterCode);

            service.getCharacteristic(this.api.hap.Characteristic.FilterChangeIndication)
                .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                    // Filter Change Indication GET
                    const percentage = _getPercentage(this.platformAccessory.context as MarvelAirPurifierInterface, filterName);

                    let indication;
                    if(percentage <= 20) {
                        indication = this.api.hap.Characteristic.FilterChangeIndication.CHANGE_FILTER;
                    } else {
                        indication = this.api.hap.Characteristic.FilterChangeIndication.FILTER_OK;
                    }
                    callback(undefined, indication);
                }));
            service.getCharacteristic(this.api.hap.Characteristic.FilterLifeLevel)
                .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                    // Filter Life Level GET
                    const percentage = _getPercentage(this.platformAccessory.context as MarvelAirPurifierInterface, filterName);
                    callback(undefined, percentage);
                }));
            services.push(service);
        }
        return services;
    }
    */

    getPurifierDrivingStrategy(ctx: MarvelAirPurifierInterface): CharacteristicValue {
        if(ctx.controlInfo.mode == Mode.AUTO_DRIVING) {
            return this.api.hap.Characteristic.TargetAirPurifierState.AUTO;
        } else {
            return this.api.hap.Characteristic.TargetAirPurifierState.MANUAL;
        }
    }

    getCurrentAirPurifierState(ctx: MarvelAirPurifierInterface): CharacteristicValue {
        if(!ctx.controlInfo.on) {
            return this.api.hap.Characteristic.CurrentAirPurifierState.INACTIVE;
        }
        if(ctx.controlInfo.mode == Mode.SILENT) {
            return this.api.hap.Characteristic.CurrentAirPurifierState.IDLE;
        }
        return this.api.hap.Characteristic.CurrentAirPurifierState.PURIFYING_AIR;
    }

    getCurrentAirQuality(ctx: MarvelAirPurifierInterface) {
        const pm25 = ctx.indoorAirQuality.pm25Density;
        const pm10 = ctx.indoorAirQuality.pm10Density;
        if(!ctx.controlInfo.on) {
            return this.api.hap.Characteristic.AirQuality.UNKNOWN;
        }

        // PM10 Air Quality
        let pm10Level;
        if(pm10 < 0) {
            pm10Level = this.api.hap.Characteristic.AirQuality.UNKNOWN;
        } else if(pm10 <= 10) {
            pm10Level = this.api.hap.Characteristic.AirQuality.EXCELLENT;
        } else if(pm10 <= 30) {
            pm10Level = this.api.hap.Characteristic.AirQuality.GOOD;
        } else if(pm10 <= 80) {
            pm10Level = this.api.hap.Characteristic.AirQuality.FAIR;
        } else if(pm10 <= 150) {
            pm10Level = this.api.hap.Characteristic.AirQuality.INFERIOR;
        } else {
            pm10Level = this.api.hap.Characteristic.AirQuality.POOR;
        }
        // PM2.5 Air Quality
        let pm25Level;
        if(pm25 < 0) {
            pm25Level = this.api.hap.Characteristic.AirQuality.UNKNOWN;
        } else if(pm25 <= 5) {
            pm25Level = this.api.hap.Characteristic.AirQuality.EXCELLENT;
        } else if(pm25 <= 15) {
            pm25Level = this.api.hap.Characteristic.AirQuality.GOOD;
        } else if(pm25 <= 35) {
            pm25Level = this.api.hap.Characteristic.AirQuality.FAIR;
        } else if(pm25 <= 75) {
            pm25Level = this.api.hap.Characteristic.AirQuality.INFERIOR;
        } else {
            pm25Level = this.api.hap.Characteristic.AirQuality.POOR;
        }
        return Math.max(pm10Level, pm25Level) as CharacteristicValue;
    }

    getRotationSpeed(ctx: MarvelAirPurifierInterface) {
        const values: string[] = Object.values(FanSpeed);
        const fanSpeed = ctx.controlInfo.fanSpeed;
        if(fanSpeed === FanSpeed.SHUTDOWN) {
            return 0; // Invalid
        }
        return values.indexOf(fanSpeed) + 1; // 0 - invalid, 1 ~ 6 - valid
    }

    async executeRotationCommand(ctx: MarvelAirPurifierInterface, command: PayloadCommand) {
        if(command.key === Field.MODE) {
            ctx.controlInfo.mode = <Mode> command.value;
        } else if(command.key === Field.FAN_SPEED) {
            ctx.controlInfo.fanSpeed = <FanSpeed> command.value;
        }
        await this.executeSetPayloads(ctx.deviceInfo, [ command ], this.accessToken);
    }

    createCommandFromRotationSpeed(rotationSpeed: number): PayloadCommand | undefined {
        switch (rotationSpeed) {
            case 1: return { key: Field.MODE, value: Mode.SILENT };
            case 2: return { key: Field.FAN_SPEED, value: FanSpeed.WEAK };
            case 3: return { key: Field.FAN_SPEED, value: FanSpeed.MEDIUM };
            case 4: return { key: Field.FAN_SPEED, value: FanSpeed.STRONG };
            case 5: return { key: Field.MODE, value: Mode.TURBO };
            case 6: return { key: Field.MODE, value: Mode.MY_PET };
        }
        return undefined;
    }

    getLightbulbBrightnessPercentage(ctx: MarvelAirPurifierInterface): number {
        return ctx.controlInfo.lightbulbInfo.brightness * LIGHTBULB_BRIGHTNESS_UNIT; // int32
    }

    getRotationSpeedPercentage(ctx: MarvelAirPurifierInterface): number {
        return this.getRotationSpeed(ctx) * ROTATION_SPEED_UNIT; // float32
    }
}