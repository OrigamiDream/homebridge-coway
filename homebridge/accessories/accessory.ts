import {API, Logging, PlatformAccessory, Service, WithUUID} from "homebridge";
import {CowayConfig} from "../interfaces/config";
import {AccessToken, CowayService, PayloadCommand} from "../coway";
import {DeviceType, Endpoint, Field} from "../enumerations";
import {Device} from "../interfaces/device";
import {DeviceStatusRequest} from "../interfaces/requests";

export type ServiceType = WithUUID<typeof Service>;
export type AccessoryResponses = { [key in Endpoint]?: any }

export interface AccessoryInterface {
    deviceType: string;
    deviceInfo: Device;
    init: boolean;
    configured: boolean;
}

interface ExpirablePayloadCommand extends PayloadCommand {
    skips: number;
}

const COMMAND_MAXIMUM_SKIPS = 3;

export type CharacteristicRefreshingCallback = () => void;

export class Accessory<T extends AccessoryInterface> {

    protected readonly endpoints: Endpoint[] = [];
    protected readonly enqueuedPayloads: ExpirablePayloadCommand[] = [];

    // Lazy-inits
    protected config?: CowayConfig = undefined;
    protected accessToken?: AccessToken = undefined;

    protected characteristicRefreshing = false;

    constructor(protected readonly log: Logging,
                protected readonly api: API,
                protected readonly deviceType: DeviceType,
                protected readonly deviceInfo: Device,
                protected readonly service: CowayService,
                protected readonly platformAccessory: PlatformAccessory) {
    }

    getEndpoints(): Endpoint[] {
        return this.endpoints;
    }

    configureCredentials(config: CowayConfig, accessToken: AccessToken) {
        this.config = config;
        this.accessToken = accessToken;
    }

    getPlatformAccessory(): PlatformAccessory {
        return this.platformAccessory;
    }

    protected replace(context: T) {
        this.platformAccessory.context = context;
    }

    protected ensureServiceAvailability(serviceType: ServiceType, displayName?: string, serviceId?: string): Service {
        let service;
        if(displayName && serviceId) {
            service = this.platformAccessory.getServiceById(serviceType, serviceId);
        } else {
            service = this.platformAccessory.getService(serviceType);
        }
        if(!service) {
            displayName = displayName || this.platformAccessory.displayName;
            if(serviceId) {
                service = this.platformAccessory.addService(serviceType, displayName, serviceId);
            } else {
                service = this.platformAccessory.addService(serviceType, displayName);
            }
        }
        return service;
    }

    private createDevicePayload(): DeviceStatusRequest {
        return {
            barcode: this.deviceInfo.barcode,
            dvcBrandCd: this.deviceInfo.dvcBrandCd,
            prodName: this.deviceInfo.prodName,
            stationCd: this.deviceInfo.stationCd,
            resetDttm: this.deviceInfo.resetDttm,
            dvcTypeCd: this.deviceInfo.dvcTypeCd,
            refreshFlag: "true"
        };
    }

    async retrieveDeviceState(endpoint: Endpoint) {
        return await this.service.executePayload(endpoint, this.createDevicePayload(), this.accessToken, false).catch(error => {
            return error.response;
        });
    }

    zipEndpointResponses(responses: any[]) {
        if(responses.length != this.endpoints.length) {
            throw "Length between responses and endpoints must be same (" + responses.length + " != " + this.endpoints.length + ")";
        }
        const map: AccessoryResponses = {};
        for(let i = 0; i < responses.length; i++) {
            map[this.endpoints[i]] = responses[i].data["body"];
        }
        return map;
    }

    async refreshDevice() {
        const queues = this.endpoints.map(endpoint => this.retrieveDeviceState(endpoint));
        const responses = await Promise.all(queues);
        return this.zipEndpointResponses(responses);
    }

    async refresh(responses: AccessoryResponses) {
        if(Endpoint.GET_DEVICE_CONTROL_INFO in responses) {
            const info = responses[Endpoint.GET_DEVICE_CONTROL_INFO]["controlStatus"];
            const commandsToFlush: ExpirablePayloadCommand[] = [];
            const commandsToPurge: ExpirablePayloadCommand[] = [];

            let skipped = 0;
            let purged = 0;
            for(const command of this.enqueuedPayloads) {
                const fetchedValue = info[command.key];
                const desiredValue = command.value;

                // If the newly fetched value is same with desired value, invalidate the enqueued command
                if(fetchedValue === desiredValue) {
                    commandsToFlush.push(command);
                } else {
                    // Otherwise, override the fetched value with desired value until be same
                    info[command.key] = desiredValue;
                    command.skips++;
                    // Too many skips will be purged automatically
                    if(command.skips >= COMMAND_MAXIMUM_SKIPS) {
                        commandsToPurge.push(command);
                        purged++;
                    } else {
                        skipped++;
                    }
                }
            }
            if(commandsToFlush.length) {
                commandsToFlush.forEach(command => {
                    this.enqueuedPayloads.splice(this.enqueuedPayloads.indexOf(command), 1);
                });
                this.log.debug("%d enqueued payloads have been flushed", commandsToFlush.length);
            }
            if(commandsToPurge.length) {
                commandsToPurge.forEach(command => {
                    this.enqueuedPayloads.splice(this.enqueuedPayloads.indexOf(command), 1);
                });
                this.log.debug("%d enqueued payloads have been purged since have skipped %d times", commandsToPurge.length, COMMAND_MAXIMUM_SKIPS);
            }
            if(skipped) {
                this.log.debug("%d fetched keys have been kept this time", skipped);
            }
        }
    }

    async refreshCharacteristics(callback: CharacteristicRefreshingCallback) {
        this.characteristicRefreshing = true;
        await callback();
        this.characteristicRefreshing = false;
    }

    async configure() {
        const service = this.ensureServiceAvailability(this.api.hap.Service.AccessoryInformation);
        service.setCharacteristic(this.api.hap.Characteristic.Manufacturer, "Coway Co.,Ltd.");
        service.setCharacteristic(this.api.hap.Characteristic.Model, this.deviceInfo.dvcModel);
        service.setCharacteristic(this.api.hap.Characteristic.SerialNumber, this.deviceInfo.barcode);
    }

    async executeSetPayloads(deviceInfo: Device, inputs: PayloadCommand[], accessToken?: AccessToken) {
        for(const command of inputs) {
            const preoccupied = this.enqueuedPayloads.find(preoccupied => preoccupied.key === command.key);
            if(preoccupied) {
                // already preoccupied payload exists
                this.log.debug("Payload command has overridden: %s - %s → %s", command.key, preoccupied.value, command.value);
                preoccupied.value = command.value;
            } else {
                this.enqueuedPayloads.push({
                    ...command,
                    skips: 0
                });
            }
        }
        return await this.service.executeSetPayloads(deviceInfo, inputs, accessToken);
    }

    async executeSetPayload(deviceInfo: Device, field: Field, value: string, accessToken?: AccessToken) {
        return await this.executeSetPayloads(deviceInfo, [{
            key: field,
            value: value
        }], accessToken);
    }

}