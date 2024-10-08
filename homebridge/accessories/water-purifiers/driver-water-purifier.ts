import {Accessory, AccessoryResponses} from "../accessory";
import {
    API,
    CharacteristicEventTypes,
    CharacteristicGetCallback,
    CharacteristicSetCallback,
    CharacteristicValue,
    Logging,
    PlatformAccessory,
    Service
} from "homebridge";
import {DeviceType, EndpointPath} from "../../enumerations";
import {Device} from "../../interfaces/device";
import {CowayService} from "../../coway";
import {ControlInfo, DriverWaterPurifierInterface} from "./interfaces";
import {ButtonLock, ColdWaterLock, FaucetState, Field, HotWaterLock} from "./enumerations";

interface WaterPurifierLockState {
    currentState: CharacteristicValue;
    targetState: CharacteristicValue;
}

// DRIVER Water Purifier
export class DriverWaterPurifier extends Accessory<DriverWaterPurifierInterface> {

    private valveService?: Service;
    private coldWaterLockService?: Service;
    private hotWaterLockService?: Service;

    constructor(log: Logging, api: API, deviceInfo: Device, service: CowayService, platformAccessory: PlatformAccessory) {
        super(log, api, DeviceType.DRIVER_WATER_PURIFIER, deviceInfo, service, platformAccessory);

        this.endpoints.push(EndpointPath.DEVICES_CONTROL);
    }

    async refresh(responses: AccessoryResponses): Promise<void> {
        await super.refresh(responses);

        if(!this.isConnected) {
            this.log.debug('Cannot refresh the accessory: %s', this.getPlatformAccessory().displayName);
            this.log.debug('The accessory response:', responses);
            return;
        }

        const controlInfo = responses[EndpointPath.DEVICES_CONTROL];

        const ctx = this.platformAccessory.context as DriverWaterPurifierInterface;
        ctx.controlInfo = this.getControlInfo(controlInfo);

        await this.refreshCharacteristics(() => {
            // Valve
            this.valveService?.setCharacteristic(this.api.hap.Characteristic.Active, this.getValveActivity(ctx));
            this.valveService?.setCharacteristic(this.api.hap.Characteristic.InUse, this.getValveState(ctx));

            // Locks
            const coldWaterState = this.getColdWaterLockState(ctx);
            const hotWaterState = this.getHotWaterLockState(ctx);

            this.coldWaterLockService?.setCharacteristic(this.api.hap.Characteristic.LockTargetState, coldWaterState.targetState);
            this.coldWaterLockService?.setCharacteristic(this.api.hap.Characteristic.LockCurrentState, coldWaterState.currentState);
            this.hotWaterLockService?.setCharacteristic(this.api.hap.Characteristic.LockTargetState, hotWaterState.targetState);
            this.hotWaterLockService?.setCharacteristic(this.api.hap.Characteristic.LockCurrentState, hotWaterState.currentState);
        });
    }

    async configure() {
        await super.configure();

        const responses = await this.refreshDevice();
        if(this.isConnected) {
            const controlInfo = responses[EndpointPath.DEVICES_CONTROL];

            this.replace({
                deviceType: this.deviceType,
                deviceInfo: this.deviceInfo,
                init: false,
                configured: true,
                controlInfo: this.getControlInfo(controlInfo)
            });
        }

        this.valveService = this.registerValveService();
        this.coldWaterLockService = this.registerColdWaterLockService();
        this.hotWaterLockService = this.registerHotWaterLockService();
    }

    getControlInfo(controlInfo: any): ControlInfo {
        const status = controlInfo["controlStatus"];
        return {
            coldWaterLock: status[Field.COLD_WATER_LOCK] as ColdWaterLock, // 1 → UNLOCK, 0 → LOCKED
            hotWaterLock: status[Field.HOT_WATER_LOCK] as HotWaterLock, // 1 → UNLOCK, 2 → LOCKED
            buttonLock: status[Field.BUTTON_LOCK] as ButtonLock, // 0 → UNLOCK, 1 → LOCKED
            faucetState: status[Field.FAUCET_STATE] as FaucetState, // 0 → IDLE, 1 → UNK, 2 → UV_STERILIZATION
            flowingMilliliter: parseInt(status[Field.FLOWING_MILLILITER])
        };
    }

    registerValveService(): Service {
        const service = this.ensureServiceAvailability(this.api.hap.Service.Valve);
        service.getCharacteristic(this.api.hap.Characteristic.Active)
            .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                const ctx = this.platformAccessory.context as DriverWaterPurifierInterface;
                callback(undefined, this.getValveActivity(ctx));
            }))
            .on(CharacteristicEventTypes.SET, this.wrapSet((value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                // TODO: Implement the SET characteristic handler
                callback(new Error("NOT IMPLEMENTED"));
            }));
        service.getCharacteristic(this.api.hap.Characteristic.InUse)
            .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                const ctx = this.platformAccessory.context as DriverWaterPurifierInterface;
                callback(undefined, this.getValveState(ctx));
            }));
        service.getCharacteristic(this.api.hap.Characteristic.ValveType)
            .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                callback(undefined, this.api.hap.Characteristic.ValveType.WATER_FAUCET);
            }));
        return service;
    }

    registerColdWaterLockService(): Service {
        const service = this.ensureServiceAvailability(this.api.hap.Service.LockMechanism, "Cold Water", "cold");
        service.getCharacteristic(this.api.hap.Characteristic.LockCurrentState)
            .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                const ctx = this.platformAccessory.context as DriverWaterPurifierInterface;
                callback(undefined, this.getColdWaterLockState(ctx).currentState);
            }));
        service.getCharacteristic(this.api.hap.Characteristic.LockTargetState)
            .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                const ctx = this.platformAccessory.context as DriverWaterPurifierInterface;
                callback(undefined, this.getColdWaterLockState(ctx).targetState);
            }))
            .on(CharacteristicEventTypes.SET, this.wrapSet(async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                const ctx = this.platformAccessory.context as DriverWaterPurifierInterface;
                let locked;
                if(value === this.api.hap.Characteristic.LockTargetState.SECURED) {
                    locked = ColdWaterLock.LOCKED;
                } else {
                    locked = ColdWaterLock.UNLOCKED;
                }
                if(ctx.controlInfo.coldWaterLock === locked) {
                    callback(undefined);
                    return;
                }
                await this.executeSetPayload(ctx.deviceInfo, Field.COLD_WATER_LOCK, locked, this.accessToken);
                callback(undefined);
            }));
        return service;
    }

    registerHotWaterLockService(): Service {
        const service = this.ensureServiceAvailability(this.api.hap.Service.LockMechanism, "Hot Water", "hot");
        service.getCharacteristic(this.api.hap.Characteristic.LockCurrentState)
            .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                const ctx = this.platformAccessory.context as DriverWaterPurifierInterface;
                callback(undefined, this.getHotWaterLockState(ctx).currentState);
            }));
        service.getCharacteristic(this.api.hap.Characteristic.LockTargetState)
            .on(CharacteristicEventTypes.GET, this.wrapGet((callback: CharacteristicGetCallback) => {
                const ctx = this.platformAccessory.context as DriverWaterPurifierInterface;
                callback(undefined, this.getHotWaterLockState(ctx).targetState);
            }))
            .on(CharacteristicEventTypes.SET, this.wrapSet(async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                const ctx = this.platformAccessory.context as DriverWaterPurifierInterface;
                let locked;
                if(value === this.api.hap.Characteristic.LockTargetState.SECURED) {
                    locked = HotWaterLock.LOCKED;
                } else {
                    locked = HotWaterLock.UNLOCKED;
                }
                if(ctx.controlInfo.hotWaterLock === locked) {
                    callback(undefined);
                    return;
                }
                await this.executeSetPayload(ctx.deviceInfo, Field.HOT_WATER_LOCK, locked, this.accessToken);
                callback(undefined);
            }));
        return service;
    }

    getValveState(ctx: DriverWaterPurifierInterface): CharacteristicValue {
        const controlInfo = ctx.controlInfo;
        if(controlInfo.faucetState == FaucetState.IDLE && controlInfo.flowingMilliliter > 0) {
            return this.api.hap.Characteristic.InUse.IN_USE;
        } else {
            return this.api.hap.Characteristic.InUse.NOT_IN_USE;
        }
    }

    getValveActivity(ctx: DriverWaterPurifierInterface): CharacteristicValue {
        const controlInfo = ctx.controlInfo;
        if(controlInfo.faucetState == FaucetState.IDLE && controlInfo.flowingMilliliter > 0) {
            return this.api.hap.Characteristic.Active.ACTIVE;
        } else {
            return this.api.hap.Characteristic.Active.INACTIVE;
        }
    }

    getColdWaterLockState(ctx: DriverWaterPurifierInterface): WaterPurifierLockState {
        return this.getWaterLockState(ctx, (ctx) => ctx.controlInfo.coldWaterLock === ColdWaterLock.LOCKED);
    }

    getHotWaterLockState(ctx: DriverWaterPurifierInterface): WaterPurifierLockState {
        return this.getWaterLockState(ctx, (ctx) => ctx.controlInfo.hotWaterLock === HotWaterLock.LOCKED);
    }

    getWaterLockState(ctx: DriverWaterPurifierInterface, condition: (ctx: DriverWaterPurifierInterface) => boolean): WaterPurifierLockState {
        if(condition(ctx)) {
            return {
                currentState: this.api.hap.Characteristic.LockCurrentState.SECURED,
                targetState: this.api.hap.Characteristic.LockTargetState.SECURED
            };
        } else {
            return {
                currentState: this.api.hap.Characteristic.LockCurrentState.UNSECURED,
                targetState: this.api.hap.Characteristic.LockTargetState.UNSECURED
            };
        }
    }
}